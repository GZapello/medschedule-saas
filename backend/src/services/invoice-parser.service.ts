import { db } from '../config/database';
import { GeminiService } from './gemini.service';

export interface ExtractedInvoiceInfo {
  invoiceNumber?: string;
  series?: string;
  issueDate?: string;
  accessKey?: string;
  supplier?: {
    name?: string;
    tradeName?: string;
    cnpj?: string;
  };
  totalAmount?: number;
}

export interface ExtractedInvoiceItem {
  id: string; // id temporário para conferência
  code?: string;
  ean?: string;
  ncm?: string;
  name: string;
  cleanName: string;
  brand?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  batchNumber?: string;
  expirationDate?: string;
  matchedItemId?: string;
  matchedItemName?: string;
  action: 'update' | 'create' | 'ignore';
  packMultiplier?: number;
}

export class InvoiceParserService {
  /**
   * Ponto de entrada unificado para processamento de notas fiscais
   * REGRA CRÍTICA: Processamento efêmero em memória. NENHUM arquivo é persistido em disco ou banco.
   */
  static async parseInvoice(params: {
    buffer: Buffer;
    fileName: string;
    mimeType?: string;
    tenantId: string;
  }): Promise<{ invoiceInfo: ExtractedInvoiceInfo; items: ExtractedInvoiceItem[] }> {
    const { buffer, fileName, mimeType, tenantId } = params;
    const lowerName = (fileName || '').toLowerCase();
    const isXml = lowerName.endsWith('.xml') || (mimeType && mimeType.includes('xml'));
    const isPdf = lowerName.endsWith('.pdf') || (mimeType && mimeType.includes('pdf'));
    const isImage = mimeType?.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(lowerName);

    let parsedResult: { invoiceInfo: ExtractedInvoiceInfo; items: ExtractedInvoiceItem[] };

    if (isXml) {
      // Prioridade 1: Parser determinístico SEFAZ NF-e / NFC-e XML
      parsedResult = this.parseNFeXml(buffer.toString('utf-8'));
    } else if (isPdf) {
      // Prioridade 2: DANFE PDF (digital ou escaneado) via Gemini Multimodal em memória
      parsedResult = await this.parseWithGeminiAi({
        base64: buffer.toString('base64'),
        mimeType: 'application/pdf',
        fileName
      });
    } else if (isImage) {
      // Prioridade 3: Foto de nota física / cupom / captura de câmera via Gemini Multimodal
      parsedResult = await this.parseWithGeminiAi({
        base64: buffer.toString('base64'),
        mimeType: mimeType || 'image/jpeg',
        fileName
      });
    } else {
      // Tenta XML como fallback caso a extensão tenha vindo truncada
      const strContent = buffer.toString('utf-8');
      if (strContent.includes('<nfeProc') || strContent.includes('<infNFe') || strContent.includes('<NFe')) {
        parsedResult = this.parseNFeXml(strContent);
      } else {
        parsedResult = await this.parseWithGeminiAi({
          base64: buffer.toString('base64'),
          mimeType: mimeType || 'application/octet-stream',
          fileName
        });
      }
    }

    // Cruza itens extraídos com catálogo existente da clínica no tenant
    parsedResult.items = this.matchWithClinicInventory(parsedResult.items, tenantId);

    return parsedResult;
  }

  /**
   * Parser determinístico para XML de NF-e (Layout oficial SEFAZ)
   */
  static parseNFeXml(xmlContent: string): { invoiceInfo: ExtractedInvoiceInfo; items: ExtractedInvoiceItem[] } {
    const getTag = (xml: string, tag: string): string => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return match ? match[1].trim() : '';
    };

    // Extrai dados gerais da nota
    const nNF = getTag(xmlContent, 'nNF');
    const serie = getTag(xmlContent, 'serie');
    const dhEmi = getTag(xmlContent, 'dhEmi') || getTag(xmlContent, 'dEmi');
    const chNFeMatch = xmlContent.match(/Id="NFe([0-9]{44})"/i) || xmlContent.match(/<chNFe>([0-9]{44})<\/chNFe>/i);
    const accessKey = chNFeMatch ? chNFeMatch[1] : undefined;

    // Emitente / Fornecedor
    const emitMatch = xmlContent.match(/<emit[^>]*>([\s\S]*?)<\/emit>/i);
    const emitXml = emitMatch ? emitMatch[1] : '';
    const supplierName = getTag(emitXml, 'xNome');
    const supplierTrade = getTag(emitXml, 'xFant');
    const supplierCnpj = getTag(emitXml, 'CNPJ') || getTag(emitXml, 'CPF');

    // Total da Nota
    const totalMatch = xmlContent.match(/<ICMSTot[^>]*>([\s\S]*?)<\/ICMSTot>/i);
    const totalXml = totalMatch ? totalMatch[1] : '';
    const totalAmount = parseFloat(getTag(totalXml, 'vNF')) || 0;

    const invoiceInfo: ExtractedInvoiceInfo = {
      invoiceNumber: nNF,
      series: serie,
      issueDate: dhEmi ? dhEmi.slice(0, 10) : undefined,
      accessKey,
      supplier: {
        name: supplierName || undefined,
        tradeName: supplierTrade || undefined,
        cnpj: supplierCnpj || undefined
      },
      totalAmount
    };

    // Itens da Nota (<det nItem="X">)
    const items: ExtractedInvoiceItem[] = [];
    const detRegex = /<det\s+nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/gi;
    let detMatch: RegExpExecArray | null;

    let index = 1;
    while ((detMatch = detRegex.exec(xmlContent)) !== null) {
      const detXml = detMatch[2];
      const prodMatch = detXml.match(/<prod[^>]*>([\s\S]*?)<\/prod>/i);
      const prodXml = prodMatch ? prodMatch[1] : detXml;

      const code = getTag(prodXml, 'cProd');
      const rawEan = getTag(prodXml, 'cEAN');
      const ean = rawEan && rawEan !== 'SEM GTIN' ? rawEan : undefined;
      const rawName = getTag(prodXml, 'xProd');
      const ncm = getTag(prodXml, 'NCM');
      const unit = (getTag(prodXml, 'uCom') || 'UN').toUpperCase();
      const quantity = parseFloat(getTag(prodXml, 'qCom')) || 1;
      const unitCost = parseFloat(getTag(prodXml, 'vUnCom')) || 0;
      const totalCost = parseFloat(getTag(prodXml, 'vProd')) || (quantity * unitCost);

      // Rastreabilidade / Lote e Validade (<rastro>)
      const rastroMatch = detXml.match(/<rastro[^>]*>([\s\S]*?)<\/rastro>/i);
      let batchNumber: string | undefined;
      let expirationDate: string | undefined;

      if (rastroMatch) {
        batchNumber = getTag(rastroMatch[1], 'nLote') || undefined;
        const dVal = getTag(rastroMatch[1], 'dVal');
        if (dVal) expirationDate = dVal.slice(0, 10);
      }

      // Se não encontrou no <rastro>, procura por lote e validade na descrição do produto
      if (!batchNumber) {
        const batchRegexMatch = rawName.match(/LOT[E]?[:\s]*([A-Z0-9\-\/]+)/i);
        if (batchRegexMatch) batchNumber = batchRegexMatch[1];
      }
      if (!expirationDate) {
        const valRegexMatch = rawName.match(/VAL[IDADE]?[:\s]*([0-9]{2}[\/\.][0-9]{2,4})/i);
        if (valRegexMatch) {
          const parts = valRegexMatch[1].split(/[\/\.]/);
          if (parts.length === 2) {
            expirationDate = `${parts[1].length === 2 ? '20' + parts[1] : parts[1]}-${parts[0]}-01`;
          }
        }
      }

      // Limpeza de nome do produto
      const cleanName = rawName
        .replace(/^(PROD:|ITEM:)\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Detecção de multiplicador de embalagem (ex: "CX C/ 100", "PCT 50 UN")
      let packMultiplier = 1;
      const packMatch = rawName.match(/(?:CX|PCT|PACOTE|CAIXA|C\/)\s*(?:C\/)?\s*(\d+)\s*(?:UN|UNIDADES|AMP|CAPS)?/i);
      if (packMatch && (unit === 'CX' || unit === 'PCT' || unit === 'FD')) {
        packMultiplier = parseInt(packMatch[1], 10) || 1;
      }

      items.push({
        id: `nf-item-${index++}`,
        code,
        ean,
        ncm,
        name: rawName,
        cleanName,
        quantity,
        unit,
        unitCost,
        totalCost,
        batchNumber,
        expirationDate,
        action: 'create',
        packMultiplier: packMultiplier > 1 ? packMultiplier : undefined
      });
    }

    return { invoiceInfo, items };
  }

  /**
   * Verifica se o PDF possui texto suficiente para extração textual direta
   */
  private static canExtractDanfeText(text: string): boolean {
    return (
      (text.includes('DANFE') || text.includes('DOCUMENTO AUXILIAR')) &&
      (text.includes('CNPJ') || text.includes('INSCRIÇÃO ESTADUAL'))
    );
  }

  /**
   * Parser textual para DANFE com texto selecionável
   */
  private static parseDanfeText(text: string): { invoiceInfo: ExtractedInvoiceInfo; items: ExtractedInvoiceItem[] } {
    const cnpjMatch = text.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
    const nfMatch = text.match(/N[ºo°\.\s]*([0-9\.\s]{1,15})/i);
    const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);

    const invoiceInfo: ExtractedInvoiceInfo = {
      invoiceNumber: nfMatch ? nfMatch[1].replace(/\D/g, '') : undefined,
      issueDate: dateMatch ? dateMatch[1].split('/').reverse().join('-') : undefined,
      supplier: {
        cnpj: cnpjMatch ? cnpjMatch[1] : undefined
      }
    };

    return {
      invoiceInfo,
      items: []
    };
  }

  /**
   * Extração via IA Multimodal (Gemini Cascade) para fotos de notas, recibos e PDFs digitalizados
   * REGRA CRÍTICA: Os bytes do arquivo são passados diretamente em memória via inlineData.
   * Nenhum arquivo é persistido em disco ou banco (Zero Data Retention).
   */
  private static async parseWithGeminiAi(params: {
    base64: string;
    mimeType: string;
    fileName: string;
  }): Promise<{ invoiceInfo: ExtractedInvoiceInfo; items: ExtractedInvoiceItem[] }> {
    try {
      const extracted = await GeminiService.extractInvoiceFromDocument({
        file: {
          mimeType: params.mimeType,
          base64: params.base64,
          fileName: params.fileName
        },
        timeoutMs: 40000
      });

      if (extracted && extracted.items && extracted.items.length > 0) {
        return {
          invoiceInfo: {
            invoiceNumber: extracted.invoiceInfo?.invoiceNumber,
            series: extracted.invoiceInfo?.series,
            issueDate: extracted.invoiceInfo?.issueDate,
            accessKey: extracted.invoiceInfo?.accessKey,
            supplier: extracted.invoiceInfo?.supplier,
            totalAmount: Number(extracted.invoiceInfo?.totalAmount) || 0
          },
          items: extracted.items.map((it: any, i: number) => ({
            id: `nf-item-${i + 1}`,
            code: it.code || undefined,
            ean: it.ean || undefined,
            ncm: it.ncm || undefined,
            name: it.name || 'Item Importado',
            cleanName: it.cleanName || it.name || 'Item Importado',
            brand: it.brand || undefined,
            quantity: Number(it.quantity) || 1,
            unit: (it.unit || 'UN').toUpperCase(),
            unitCost: Number(it.unitCost) || 0,
            totalCost: Number(it.totalCost) || (Number(it.quantity) * Number(it.unitCost)) || 0,
            batchNumber: it.batchNumber || undefined,
            expirationDate: it.expirationDate || undefined,
            action: 'create',
            packMultiplier: it.packMultiplier && it.packMultiplier > 1 ? it.packMultiplier : undefined
          }))
        };
      }
    } catch (err: any) {
      console.warn('[InvoiceParserService.parseWithGeminiAi] Falha na extração por IA:', err?.message || err);
    }

    // Fallback gracioso se a IA falhar
    return {
      invoiceInfo: {
        invoiceNumber: undefined,
        totalAmount: 0
      },
      items: []
    };
  }

  /**
   * Cruza itens extraídos da nota com o estoque existente da clínica (por EAN, NCM ou similaridade de nome)
   */
  static matchWithClinicInventory(
    extractedItems: ExtractedInvoiceItem[],
    tenantId: string
  ): ExtractedInvoiceItem[] {
    let existingItems: any[] = [];
    try {
      existingItems = db.prepare(`
        SELECT id, name, category, brand, unit, unit_cost, batch_number, expiration_date, ean, ncm
        FROM inventory_items
        WHERE tenant_id = ? AND active = 1
      `).all(tenantId) as any[];
    } catch (err) {
      console.warn('[InvoiceParserService.matchWithClinicInventory] Erro ao consultar estoque:', err);
      return extractedItems;
    }

    if (existingItems.length === 0) return extractedItems;

    return extractedItems.map(item => {
      let matched: any = null;

      // 1. Busca por código de barras / EAN idêntico
      if (item.ean) {
        matched = existingItems.find(ex => ex.ean && ex.ean === item.ean);
      }

      // 2. Busca por nome idêntico (normalizado)
      if (!matched && item.cleanName) {
        const itemNorm = item.cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
        matched = existingItems.find(ex => {
          const exNorm = (ex.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return exNorm === itemNorm;
        });
      }

      // 3. Busca por contenção forte de palavras-chave
      if (!matched && item.cleanName) {
        const words = item.cleanName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (words.length >= 2) {
          matched = existingItems.find(ex => {
            const exName = (ex.name || '').toLowerCase();
            const matchCount = words.filter(w => exName.includes(w)).length;
            return matchCount >= Math.min(3, words.length);
          });
        }
      }

      if (matched) {
        return {
          ...item,
          matchedItemId: matched.id,
          matchedItemName: matched.name,
          action: 'update' as const
        };
      }

      return {
        ...item,
        action: 'create' as const
      };
    });
  }
}
