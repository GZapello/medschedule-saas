import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import { logAudit } from '../middlewares/audit.middleware';

// Definição dos campos alvo para mapeamento inteligente
export const TARGET_FIELDS = [
  { field: 'full_name', label: 'Nome Completo do Paciente *', required: true, synonyms: ['nome', 'nome completo', 'paciente', 'cliente', 'nome do paciente', 'nome paciente', 'patient', 'name', 'full name', 'aluno', 'estudante', 'paciente/cliente'] },
  { field: 'cpf', label: 'CPF / Documento', required: false, synonyms: ['cpf', 'cpf/cnpj', 'documento', 'doc', 'nr_documento', 'cpf_paciente', 'cpf/rg', 'rg/cpf', 'rg', 'identidade'] },
  { field: 'birth_date', label: 'Data de Nascimento', required: false, synonyms: ['data nascimento', 'nascimento', 'data de nascimento', 'dt nascimento', 'dt_nasc', 'dtnasc', 'aniversario', 'birth', 'birthday', 'dn', 'd.n.'] },
  { field: 'phone', label: 'Telefone / Celular', required: false, synonyms: ['telefone', 'fone', 'tel', 'celular', 'contato', 'cel', 'phone', 'mobile', 'tel contato', 'tel residencial', 'telefone celular'] },
  { field: 'whatsapp', label: 'WhatsApp', required: false, synonyms: ['whatsapp', 'whats', 'zap', 'wpp', 'cel whatsapp'] },
  { field: 'email', label: 'E-mail', required: false, synonyms: ['email', 'e-mail', 'mail', 'correio eletronico'] },
  { field: 'address', label: 'Endereço Completo', required: false, synonyms: ['endereco', 'endereço', 'rua', 'logradouro', 'address', 'rua/av', 'domicilio', 'residencia'] },
  { field: 'city', label: 'Cidade', required: false, synonyms: ['cidade', 'municipio', 'município', 'city'] },
  { field: 'state', label: 'Estado (UF)', required: false, synonyms: ['estado', 'uf', 'state'] },
  { field: 'zip_code', label: 'CEP', required: false, synonyms: ['cep', 'codigo postal', 'zip', 'zipcode'] },
  { field: 'profession', label: 'Profissão / Ocupação', required: false, synonyms: ['profissao', 'profissão', 'ocupacao', 'ocupação', 'cargo', 'atividade', 'trabalho', 'funcao'] },
  { field: 'responsible', label: 'Responsável / Contato Emergencial', required: false, synonyms: ['responsavel', 'responsável', 'nome do responsavel', 'mae', 'mãe', 'pai', 'filiacao', 'filiação', 'contato de emergencia', 'contato emergencia', 'responsavel legal', 'responsavel financeiro', 'tutor'] },
  { field: 'insurance_name', label: 'Convênio / Operadora', required: false, synonyms: ['convenio', 'convênio', 'operadora', 'plano de saude', 'plano saude', 'seguro', 'assistencia medica', 'plano'] },
  { field: 'insurance_plan', label: 'Plano do Convênio', required: false, synonyms: ['tipo plano', 'categoria plano', 'nome plano', 'plano convenio'] },
  { field: 'insurance_card', label: 'Número da Carteirinha', required: false, synonyms: ['carteirinha', 'matricula', 'matrícula', 'num carteira', 'nr carteira', 'codigo carteira', 'nr matricula', 'carteira convenio'] },
  { field: 'allergies', label: 'Alergias / Alertas Clínicos', required: false, synonyms: ['alergia', 'alergias', 'reacao alergica', 'reacoes alergicas', 'quadro alergico', 'alergico a', 'hipersensibilidade', 'alertas'] },
  { field: 'medications', label: 'Medicamentos em Uso', required: false, synonyms: ['medicamento', 'medicamentos', 'remedio', 'remédios', 'medicacao', 'medicação', 'medicamentos em uso', 'farmacos', 'uso continuo'] },
  { field: 'chief_complaint', label: 'Queixa Principal / Motivo', required: false, synonyms: ['queixa principal', 'queixa', 'motivo', 'motivo da consulta', 'motivo consulta', 'queixa_principal', 'sintoma principal', 'queixa inicial'] },
  { field: 'anamnesis', label: 'Anamnese / Histórico Clínico', required: false, synonyms: ['anamnese', 'historico clinico', 'histórico clínico', 'antecedentes', 'historia pregressa', 'historia da doenca', 'hda', 'antecedentes pessoais', 'antecedentes familiares'] },
  { field: 'medical_record', label: 'Prontuário / Evolução / Conduta', required: false, synonyms: ['prontuario', 'prontuário', 'evolucao', 'evolução', 'conduta', 'evolucoes', 'notas clinicas', 'registro clinico', 'descricao clinica', 'evolucao clinica', 'plano terapeutico', 'diagnostico'] },
  { field: 'notes_admin', label: 'Observações / Anotações Gerais', required: false, synonyms: ['observacoes', 'observações', 'obs', 'notas', 'anotacoes', 'anotações', 'notes', 'quadro clinico', 'comentarios'] },
  { field: 'appointment_date', label: 'Data da Consulta / Histórico', required: false, synonyms: ['data consulta', 'data atendimento', 'data da consulta', 'data agendamento', 'data sessao', 'dt consulta', 'dia consulta', 'data da ultima consulta'] },
  { field: 'appointment_time', label: 'Horário da Consulta', required: false, synonyms: ['horario', 'hora', 'horário', 'hora consulta', 'hora atendimento', 'horario agendamento'] },
  { field: 'professional_name', label: 'Profissional / Médico(a)', required: false, synonyms: ['medico', 'médico', 'profissional', 'doutor', 'dr', 'dra', 'atendente', 'especialista', 'terapeuta', 'fonoaudiologo', 'fisioterapeuta', 'psicologo'] },
  { field: 'service_name', label: 'Serviço / Procedimento', required: false, synonyms: ['servico', 'serviço', 'procedimento', 'especialidade', 'tipo atendimento', 'tipo consulta', 'tratamento'] }
];

function cleanDigits(val: any): string {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}

function cleanXmlText(xmlStr: string): string {
  return xmlStr
    .replace(/<w:br\b[^>]*\/>/gi, '\n')
    .replace(/<w:cr\b[^>]*\/>/gi, '\n')
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function extractCellText(tcXml: string): string {
  const pMatches = tcXml.match(/<w:p\b[\s\S]*?<\/w:p>/g);
  if (!pMatches || pMatches.length === 0) {
    return cleanXmlText(tcXml).trim();
  }

  const pTexts: string[] = [];
  for (const pXml of pMatches) {
    const textPieces: string[] = [];
    const runOrBreakMatches = pXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<w:tab\b[^>]*\/>/g) || [];
    for (const match of runOrBreakMatches) {
      if (match.startsWith('<w:br') || match.startsWith('<w:cr')) {
        textPieces.push('\n');
      } else if (match.startsWith('<w:tab')) {
        textPieces.push('\t');
      } else {
        const textContent = match.replace(/^<w:t\b[^>]*>/, '').replace(/<\/w:t>$/, '');
        textPieces.push(textContent);
      }
    }
    const paragraphText = cleanXmlText(textPieces.join('')).trim();
    if (paragraphText.length > 0) {
      pTexts.push(paragraphText);
    }
  }

  return pTexts.join('\n');
}

function extractTablesXml(docXml: string): string[] {
  const tables: string[] = [];
  let depth = 0;
  let startIndex = -1;
  const regex = /<\/?w:tbl\b[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(docXml)) !== null) {
    if (match[0].startsWith('</')) {
      depth--;
      if (depth === 0 && startIndex !== -1) {
        tables.push(docXml.substring(startIndex, regex.lastIndex));
        startIndex = -1;
      }
    } else {
      if (depth === 0) {
        startIndex = match.index;
      }
      depth++;
    }
  }

  return tables;
}

function isFieldLabel(str: string): boolean {
  const norm = normalizeHeader(str.replace(/[:：]/g, ''));
  if (!norm || norm.length > 35) return false;
  return TARGET_FIELDS.some(t => t.synonyms.some(s => {
    const normSyn = normalizeHeader(s);
    return norm === normSyn || norm.startsWith(normSyn) || normSyn.startsWith(norm);
  }));
}

function matchColumn(header: string): { targetField: string | null; confidence: number } {
  const normHeader = normalizeHeader(header);
  if (!normHeader) return { targetField: null, confidence: 0 };

  let bestMatch: string | null = null;
  let bestConfidence = 0;

  for (const target of TARGET_FIELDS) {
    for (const syn of target.synonyms) {
      const normSyn = normalizeHeader(syn);
      if (normHeader === normSyn) {
        return { targetField: target.field, confidence: 100 };
      }
      if (normHeader.includes(normSyn) || normSyn.includes(normHeader)) {
        const conf = 85;
        if (conf > bestConfidence) {
          bestConfidence = conf;
          bestMatch = target.field;
        }
      }
    }
  }

  return { targetField: bestMatch, confidence: bestConfidence };
}

function parseDocxContent(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const zip = new AdmZip(buffer);
  const docEntry = zip.getEntry('word/document.xml');
  if (!docEntry) {
    throw new Error('Arquivo .docx inválido ou corrompido: não contém word/document.xml');
  }

  const xml = docEntry.getData().toString('utf8');
  const allFoundRows: Record<string, string>[] = [];
  const allHeadersSet = new Set<string>();

  // 1. Processar todas as tabelas <w:tbl>
  const tblXmls = extractTablesXml(xml);
  for (const tblXml of tblXmls) {
    const trMatches = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    const tableMatrix: string[][] = [];

    for (const trXml of trMatches) {
      const tcMatches = trXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
      const rowCells: string[] = [];
      for (const tcXml of tcMatches) {
        rowCells.push(extractCellText(tcXml));
      }
      if (rowCells.some(c => c.trim().length > 0)) {
        tableMatrix.push(rowCells);
      }
    }

    if (tableMatrix.length === 0) continue;

    // Detectar se é uma tabela chave-valor (Formulário / Ficha de Paciente)
    const isKeyValue = tableMatrix.some(r => r.length >= 2 && isFieldLabel(r[0]));
    if (isKeyValue && tableMatrix[0].length <= 4) {
      const record: Record<string, string> = {};
      for (const r of tableMatrix) {
        if (r.length >= 2) {
          const k1 = r[0].replace(/[:：\s]+$/, '').trim();
          const v1 = r[1]?.trim() || '';
          if (k1 && (v1 || isFieldLabel(k1))) {
            record[k1] = v1;
            allHeadersSet.add(k1);
          }
        }
        if (r.length >= 4) {
          const k2 = r[2].replace(/[:：\s]+$/, '').trim();
          const v2 = r[3]?.trim() || '';
          if (k2 && (v2 || isFieldLabel(k2))) {
            record[k2] = v2;
            allHeadersSet.add(k2);
          }
        }
      }
      if (Object.keys(record).length > 0) {
        allFoundRows.push(record);
      }
    } else {
      // Tabela padrão tabular (Linha 0 = Cabeçalho, Linhas 1..N = Registros)
      const headerRow = tableMatrix[0];
      const tableHeaders = headerRow.map((h, i) => (h && h.trim().length > 0 ? h.trim() : `Coluna_${i + 1}`));
      tableHeaders.forEach(h => allHeadersSet.add(h));

      for (let r = 1; r < tableMatrix.length; r++) {
        const rowCells = tableMatrix[r];
        const rowData: Record<string, string> = {};
        tableHeaders.forEach((h, idx) => {
          rowData[h] = rowCells[idx] || '';
        });
        if (Object.values(rowData).some(v => v.trim().length > 0)) {
          allFoundRows.push(rowData);
        }
      }
    }
  }

  // 2. Processar parágrafos de texto (fichas clínicas, anamneses e textos fora das tabelas)
  const xmlWithoutTables = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, '');
  const pMatches = xmlWithoutTables.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const paragraphLines: string[] = [];

  for (const pXml of pMatches) {
    const text = extractCellText(pXml);
    if (text.length > 0) {
      const subLines = text.split(/\r?\n/);
      for (const sl of subLines) {
        if (sl.trim().length > 0) paragraphLines.push(sl.trim());
      }
    }
  }

  if (paragraphLines.length > 0) {
    if (allFoundRows.length === 0 && paragraphLines.length > 1 && (paragraphLines[0].includes(';') || paragraphLines[0].includes(',') || paragraphLines[0].includes('\t'))) {
      const delimiter = paragraphLines[0].includes(';') ? ';' : paragraphLines[0].includes('\t') ? '\t' : ',';
      const pHeaders = paragraphLines[0].split(delimiter).map(h => h.trim());
      pHeaders.forEach(h => allHeadersSet.add(h));
      for (let i = 1; i < paragraphLines.length; i++) {
        const cells = paragraphLines[i].split(delimiter).map(c => c.trim());
        const rowData: Record<string, string> = {};
        pHeaders.forEach((h, idx) => {
          rowData[h] = cells[idx] || '';
        });
        if (Object.values(rowData).some(v => v.length > 0)) {
          allFoundRows.push(rowData);
        }
      }
    } else {
      let currentRec: Record<string, string> = {};
      let currentField = '';

      for (const line of paragraphLines) {
        const colonIdx = line.indexOf(':');
        const isHeaderLine = colonIdx > 1 && colonIdx < 35 && isFieldLabel(line.substring(0, colonIdx));

        if (isHeaderLine) {
          const fieldLabel = line.substring(0, colonIdx).trim();
          const fieldValue = line.substring(colonIdx + 1).trim();

          const norm = normalizeHeader(fieldLabel);
          if (norm.startsWith('nome') || norm.startsWith('paciente') || line.startsWith('---')) {
            if (Object.keys(currentRec).length > 0) {
              allFoundRows.push(currentRec);
              currentRec = {};
            }
          }

          currentField = fieldLabel;
          currentRec[currentField] = fieldValue;
          allHeadersSet.add(fieldLabel);
        } else if (currentField && line.length > 0 && !line.startsWith('---') && !line.startsWith('===')) {
          // Preserva textos extensos de prontuário, anamnese e evolução
          currentRec[currentField] = (currentRec[currentField] ? currentRec[currentField] + '\n' : '') + line;
        } else if (line.startsWith('---') || line.startsWith('===')) {
          if (Object.keys(currentRec).length > 0) {
            allFoundRows.push(currentRec);
            currentRec = {};
            currentField = '';
          }
        }
      }

      if (Object.keys(currentRec).length > 0) {
        allFoundRows.push(currentRec);
      }
    }
  }

  // Organizar ordem recomendada de cabeçalhos
  const defaultHeaderOrder = [
    'Nome Completo', 'CPF', 'Telefone', 'WhatsApp', 'E-mail', 'Data de Nascimento',
    'Endereço', 'Cidade', 'Estado', 'CEP', 'Profissão', 'Responsável',
    'Convênio', 'Plano', 'Carteirinha',
    'Alergias', 'Medicamentos', 'Queixa Principal', 'Anamnese', 'Prontuário', 'Observações',
    'Data da Consulta', 'Horário da Consulta', 'Profissional', 'Serviço'
  ];

  const headers: string[] = [];
  for (const def of defaultHeaderOrder) {
    for (const h of allHeadersSet) {
      if (!headers.includes(h) && normalizeHeader(h) === normalizeHeader(def)) {
        headers.push(h);
      }
    }
  }
  for (const h of allHeadersSet) {
    if (!headers.includes(h)) {
      headers.push(h);
    }
  }

  return { headers, rows: allFoundRows };
}

function parseCsvContent(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  let content = buffer.toString('utf8');
  if (content.includes('\uFFFD')) {
    content = buffer.toString('latin1');
  }
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return { headers: [], rows: [] };

  const firstLine = rawLines[0];
  const countSemicolon = (firstLine.match(/;/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;
  const countTab = (firstLine.match(/\t/g) || []).length;
  const countPipe = (firstLine.match(/\|/g) || []).length;

  let delimiter = ',';
  if (countSemicolon >= countComma && countSemicolon >= countTab && countSemicolon >= countPipe && countSemicolon > 0) {
    delimiter = ';';
  } else if (countTab >= countComma && countTab >= countPipe && countTab > 0) {
    delimiter = '\t';
  } else if (countPipe >= countComma && countPipe > 0) {
    delimiter = '|';
  }

  const splitLine = (line: string, delim: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === delim && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  };

  const rawHeaders = splitLine(rawLines[0], delimiter);
  // Se linha 0 tem apenas 1 coluna e o arquivo possui formato chave-valor estruturado
  if (rawHeaders.length <= 1 && rawLines.some(l => isFieldLabel(l.split(':')[0] || ''))) {
    const headers = ['Nome Completo', 'CPF', 'Telefone', 'E-mail', 'Data de Nascimento', 'Observações', 'Anamnese', 'Prontuário'];
    const rows: Record<string, string>[] = [];
    let currentRec: Record<string, string> = {};
    let currentField = '';

    for (const line of rawLines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 1 && colonIdx < 35 && isFieldLabel(line.substring(0, colonIdx))) {
        const k = line.substring(0, colonIdx).trim();
        const v = line.substring(colonIdx + 1).trim();
        const norm = normalizeHeader(k);
        if (norm.startsWith('nome') || norm.startsWith('paciente')) {
          if (Object.keys(currentRec).length > 0) {
            rows.push(currentRec);
            currentRec = {};
          }
        }
        currentField = k;
        currentRec[currentField] = v;
      } else if (currentField && line.length > 0 && !line.startsWith('---') && !line.startsWith('===')) {
        currentRec[currentField] = (currentRec[currentField] ? currentRec[currentField] + '\n' : '') + line;
      } else if (line.startsWith('---') || line.startsWith('===')) {
        if (Object.keys(currentRec).length > 0) {
          rows.push(currentRec);
          currentRec = {};
          currentField = '';
        }
      }
    }
    if (Object.keys(currentRec).length > 0) rows.push(currentRec);
    return { headers, rows };
  }

  const headers = rawHeaders.map((h, i) => (h && h.length > 0 ? h : `Coluna_${i + 1}`));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const cells = splitLine(rawLines[i], delimiter);
    if (!cells.some(c => c.length > 0)) continue;
    const rowData: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowData[h] = cells[idx] !== undefined ? cells[idx] : '';
    });
    rows.push(rowData);
  }

  return { headers, rows };
}

function parseSpreadsheetContent(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Nenhuma planilha encontrada no arquivo.');
  }

  const allRows: Record<string, string>[] = [];
  const allHeadersSet = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    if (!rawRows || rawRows.length === 0) continue;

    let headerIndex = -1;
    for (let i = 0; i < rawRows.length; i++) {
      if (rawRows[i].some(cell => String(cell).trim().length > 0)) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) continue;

    const rawHeaders = rawRows[headerIndex] || [];
    const sheetHeaders = rawHeaders.map((h: any, i: number) => {
      const str = String(h || '').trim();
      return str.length > 0 ? str : `Coluna_${i + 1}`;
    });

    sheetHeaders.forEach(h => allHeadersSet.add(h));

    for (let i = headerIndex + 1; i < rawRows.length; i++) {
      const rowCells = rawRows[i] || [];
      if (!rowCells.some((c: any) => String(c).trim().length > 0)) continue;

      const rowData: Record<string, string> = {};
      sheetHeaders.forEach((h: string, idx: number) => {
        let cellVal = rowCells[idx];
        if (cellVal instanceof Date) {
          cellVal = cellVal.toISOString().split('T')[0];
        }
        rowData[h] = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
      });

      if (Object.values(rowData).some(v => v.length > 0)) {
        allRows.push(rowData);
      }
    }
  }

  const headers = Array.from(allHeadersSet);
  return { headers, rows: allRows };
}

export class ImportController {
  /**
   * 1. PARSE DE ARQUIVOS (ÚNICO OU MÚLTIPLOS) + CONSOLIDAÇÃO INTELIGENTE + RESOLUÇÃO DE DUPLICATAS
   */
  static parseFile(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      let incomingFiles: Array<{ fileName: string; fileBase64: string }> = [];
      if (Array.isArray(req.body.files) && req.body.files.length > 0) {
        incomingFiles = req.body.files;
      } else if (req.body.fileName && req.body.fileBase64) {
        incomingFiles = [{ fileName: req.body.fileName, fileBase64: req.body.fileBase64 }];
      } else {
        res.status(400).json({ error: 'Nenhum arquivo fornecido para análise.' });
        return;
      }

      const allParsedRows: Record<string, string>[] = [];
      const allHeadersSet = new Set<string>();
      const filesSummary: Array<{ fileName: string; rowCount: number; format: string }> = [];

      for (const item of incomingFiles) {
        if (!item.fileName || !item.fileBase64) continue;
        const buffer = Buffer.from(item.fileBase64, 'base64');
        const ext = item.fileName.split('.').pop()?.toLowerCase() || '';

        let parsed: { headers: string[]; rows: Record<string, string>[] };
        if (ext === 'docx') {
          parsed = parseDocxContent(buffer);
        } else if (['csv', 'tsv', 'txt'].includes(ext)) {
          try {
            parsed = parseCsvContent(buffer);
            if (parsed.headers.length === 0 || parsed.rows.length === 0) {
              parsed = parseSpreadsheetContent(buffer);
            }
          } catch {
            parsed = parseSpreadsheetContent(buffer);
          }
        } else if (['xlsx', 'xls'].includes(ext)) {
          parsed = parseSpreadsheetContent(buffer);
        } else {
          continue;
        }

        parsed.headers.forEach(h => allHeadersSet.add(h));
        for (const row of parsed.rows) {
          row._source_file = item.fileName;
          allParsedRows.push(row);
        }

        filesSummary.push({
          fileName: item.fileName,
          rowCount: parsed.rows.length,
          format: ext.toUpperCase()
        });
      }

      if (allParsedRows.length === 0) {
        res.status(400).json({ error: 'Nenhum dado ou registro válido identificado nos arquivos enviados. Verifique se os arquivos possuem tabelas ou dados de pacientes.' });
        return;
      }

      const headers = Array.from(allHeadersSet);

      // Mapeamento heurístico de colunas
      const columnMappings = headers.map(header => {
        const match = matchColumn(header);
        return {
          sourceColumn: header,
          targetField: match.targetField,
          confidence: match.confidence
        };
      });

      // Consolidação de registros entre arquivos (mesmo paciente com informações complementares)
      const nameCol = columnMappings.find(m => m.targetField === 'full_name')?.sourceColumn;
      const cpfCol = columnMappings.find(m => m.targetField === 'cpf')?.sourceColumn;
      const phoneCol = columnMappings.find(m => m.targetField === 'phone')?.sourceColumn;

      const consolidatedMap = new Map<string, Record<string, string>>();
      let consolidatedCount = 0;

      for (const row of allParsedRows) {
        const rawCpf = cpfCol ? cleanDigits(row[cpfCol]) : '';
        const rawPhone = phoneCol ? cleanDigits(row[phoneCol]) : '';
        const rawName = nameCol ? normalizeHeader(row[nameCol] || '') : '';

        let key = '';
        if (rawCpf && rawCpf.length >= 11) {
          key = 'cpf:' + rawCpf;
        } else if (rawPhone && rawPhone.length >= 8) {
          key = 'phone:' + rawPhone.slice(-9);
        } else if (rawName && rawName.length >= 5) {
          key = 'name:' + rawName;
        }

        if (key && consolidatedMap.has(key)) {
          const existing = consolidatedMap.get(key)!;
          consolidatedCount++;

          for (const col of Object.keys(row)) {
            if (col === '_source_file') continue;
            const currentVal = existing[col] || '';
            const incomingVal = row[col] || '';

            if (!currentVal && incomingVal) {
              existing[col] = incomingVal;
            } else if (currentVal && incomingVal && currentVal !== incomingVal) {
              const colTarget = columnMappings.find(m => m.sourceColumn === col)?.targetField;
              const isLongText = ['anamnesis', 'medical_record', 'chief_complaint', 'notes_admin'].includes(colTarget || '');
              if (isLongText) {
                existing[col] = `${currentVal}\n\n[Origem: ${row._source_file}]: ${incomingVal}`;
              }
            }
          }
        } else {
          if (key) {
            consolidatedMap.set(key, { ...row });
          } else {
            consolidatedMap.set('idx:' + Math.random().toString(36), { ...row });
          }
        }
      }

      const consolidatedRows = Array.from(consolidatedMap.values());

      // Busca pacientes existentes no banco para verificação de duplicidade
      const existingPatients = db.prepare(`
        SELECT id, full_name, cpf, phone, email
        FROM patients
        WHERE tenant_id = ? AND active = 1
      `).all(tenantId) as { id: string; full_name: string; cpf?: string; phone?: string; email?: string }[];

      const cpfMap = new Map<string, typeof existingPatients[0]>();
      const phoneMap = new Map<string, typeof existingPatients[0]>();
      const emailMap = new Map<string, typeof existingPatients[0]>();
      const nameMap = new Map<string, typeof existingPatients[0]>();

      for (const p of existingPatients) {
        const cpfDigits = cleanDigits(p.cpf);
        if (cpfDigits.length >= 11) cpfMap.set(cpfDigits, p);

        const phoneDigits = cleanDigits(p.phone);
        if (phoneDigits.length >= 8) phoneMap.set(phoneDigits.slice(-9), p);

        if (p.email && p.email.includes('@')) emailMap.set(p.email.toLowerCase().trim(), p);

        const normName = normalizeHeader(p.full_name);
        if (normName.length > 3) nameMap.set(normName, p);
      }

      const intraCpfSet = new Set<string>();
      const intraPhoneSet = new Set<string>();
      const intraEmailSet = new Set<string>();
      const intraNameSet = new Set<string>();

      let duplicateCount = 0;
      let intraDuplicateCount = 0;

      const previewRows = consolidatedRows.slice(0, 100).map((row, idx) => {
        let isDuplicate = false;
        let isIntraDuplicate = false;
        let matchedPatient: any = null;
        let matchReason = '';

        const nameField = columnMappings.find(m => m.targetField === 'full_name')?.sourceColumn;
        const cpfField = columnMappings.find(m => m.targetField === 'cpf')?.sourceColumn;
        const phoneField = columnMappings.find(m => m.targetField === 'phone')?.sourceColumn;
        const emailField = columnMappings.find(m => m.targetField === 'email')?.sourceColumn;

        const rowCpf = cpfField ? cleanDigits(row[cpfField]) : '';
        const rowPhone = phoneField ? cleanDigits(row[phoneField]) : '';
        const rowEmail = emailField ? (row[emailField] || '').toLowerCase().trim() : '';
        const rowName = nameField ? normalizeHeader(row[nameField] || '') : '';

        // 1. Checa contra banco existente da clínica
        if (rowCpf && cpfMap.has(rowCpf)) {
          isDuplicate = true;
          matchedPatient = cpfMap.get(rowCpf);
          matchReason = 'CPF já cadastrado na clínica';
        } else if (rowPhone && rowPhone.length >= 8 && phoneMap.has(rowPhone.slice(-9))) {
          isDuplicate = true;
          matchedPatient = phoneMap.get(rowPhone.slice(-9));
          matchReason = 'Telefone já cadastrado na clínica';
        } else if (rowEmail && emailMap.has(rowEmail)) {
          isDuplicate = true;
          matchedPatient = emailMap.get(rowEmail);
          matchReason = 'E-mail já cadastrado na clínica';
        } else if (rowName && nameMap.has(rowName)) {
          isDuplicate = true;
          matchedPatient = nameMap.get(rowName);
          matchReason = 'Nome já cadastrado na clínica';
        }

        // 2. Checa repetição residual intra-lote
        if (rowCpf && intraCpfSet.has(rowCpf)) {
          isIntraDuplicate = true;
          matchReason = matchReason ? `${matchReason} (e repetido no lote)` : 'CPF repetido no lote';
        } else if (rowPhone && rowPhone.length >= 8 && intraPhoneSet.has(rowPhone.slice(-9))) {
          isIntraDuplicate = true;
          matchReason = matchReason ? `${matchReason} (e repetido no lote)` : 'Telefone repetido no lote';
        } else if (rowEmail && intraEmailSet.has(rowEmail)) {
          isIntraDuplicate = true;
          matchReason = matchReason ? `${matchReason} (e repetido no lote)` : 'E-mail repetido no lote';
        } else if (rowName && rowName.length > 5 && intraNameSet.has(rowName)) {
          isIntraDuplicate = true;
          matchReason = matchReason ? `${matchReason} (e repetido no lote)` : 'Nome repetido no lote';
        }

        if (rowCpf) intraCpfSet.add(rowCpf);
        if (rowPhone && rowPhone.length >= 8) intraPhoneSet.add(rowPhone.slice(-9));
        if (rowEmail) intraEmailSet.add(rowEmail);
        if (rowName) intraNameSet.add(rowName);

        if (isDuplicate) duplicateCount++;
        if (isIntraDuplicate) intraDuplicateCount++;

        return {
          rowIndex: idx,
          data: row,
          isDuplicate: isDuplicate || isIntraDuplicate,
          isIntraDuplicate,
          matchedPatient: matchedPatient ? { id: matchedPatient.id, full_name: matchedPatient.full_name, cpf: matchedPatient.cpf, phone: matchedPatient.phone } : null,
          matchReason,
          suggestedAction: isDuplicate ? 'update' : isIntraDuplicate ? 'skip' : 'create_new'
        };
      });

      res.json({
        filesSummary,
        fileName: incomingFiles.length === 1 ? incomingFiles[0].fileName : `${incomingFiles.length} arquivos selecionados`,
        fileType: incomingFiles.length === 1 ? incomingFiles[0].fileName.split('.').pop()?.toLowerCase() : 'multi',
        totalRows: consolidatedRows.length,
        consolidatedCount,
        headers,
        columnMappings,
        availableTargetFields: TARGET_FIELDS,
        duplicateCount,
        intraDuplicateCount,
        allRows: consolidatedRows,
        previewRows
      });
    } catch (err: any) {
      console.error('[ImportController.parseFile] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar e ler o arquivo: ' + (err.message || 'Formato inválido') });
    }
  }

  /**
   * 2. EXECUÇÃO EM LOTE TRANSACIONAL COM RESOLUÇÃO DE DUPLICATAS E REGISTROS CLÍNICOS
   */
  static executeImport(req: Request, res: Response): void {
    const tenantId = req.tenantId;
    const userId = req.user?.userId || 'usr-system';
    const { fileName, fileType, columnMappings, rows, duplicateDecisions, importHistoricalAppointments } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Nenhuma linha fornecida para importação' });
      return;
    }

    if (!columnMappings || !Array.isArray(columnMappings)) {
      res.status(400).json({ error: 'Mapeamento de colunas é obrigatório' });
      return;
    }

    // Gerar identificador amigável do lote: #IMP-XXXX
    const batchId = 'IMP-' + Math.floor(100000 + Math.random() * 900000);

    // Mapeador invertido multi-colunas: targetField -> sourceColumns[]
    const targetToSources: Record<string, string[]> = {};
    for (const m of columnMappings) {
      if (m.targetField && m.sourceColumn) {
        if (!targetToSources[m.targetField]) {
          targetToSources[m.targetField] = [];
        }
        targetToSources[m.targetField].push(m.sourceColumn);
      }
    }

    if (!targetToSources['full_name'] || targetToSources['full_name'].length === 0) {
      res.status(400).json({ error: 'O mapeamento do campo "Nome Completo" é estritamente obrigatório.' });
      return;
    }

    // Profissional e serviço padrão para agendamentos e registros históricos
    let firstProf = db.prepare('SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
    if (!firstProf) {
      const autoProfId = 'pro-auto-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO professionals (id, tenant_id, name, active)
        VALUES (?, ?, 'Profissional da Clínica', 1)
      `).run(autoProfId, tenantId);
      firstProf = { id: autoProfId, name: 'Profissional da Clínica' };
    }

    let firstService = db.prepare('SELECT id, name FROM services WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
    if (!firstService) {
      const autoSrvId = 'srv-auto-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO services (id, tenant_id, name, duration_minutes, price, active)
        VALUES (?, ?, 'Atendimento / Consulta', 50, 0.0, 1)
      `).run(autoSrvId, tenantId);
      firstService = { id: autoSrvId, name: 'Atendimento / Consulta' };
    }

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: { row: number; patientName: string; reason: string }[] = [];

    // Prepara mapas de busca de pacientes existentes
    const existingPatients = db.prepare('SELECT id, full_name, cpf, phone, email FROM patients WHERE tenant_id = ? AND active = 1').all(tenantId) as any[];
    const cpfMap = new Map<string, string>();
    const phoneMap = new Map<string, string>();
    const emailMap = new Map<string, string>();
    const nameMap = new Map<string, string>();

    for (const p of existingPatients) {
      const c = cleanDigits(p.cpf);
      if (c.length >= 11) cpfMap.set(c, p.id);
      const ph = cleanDigits(p.phone);
      if (ph.length >= 8) phoneMap.set(ph.slice(-9), p.id);
      if (p.email) emailMap.set(p.email.toLowerCase().trim(), p.id);
      const nm = normalizeHeader(p.full_name);
      if (nm.length > 3) nameMap.set(nm, p.id);
    }

    try {
      db.exec('BEGIN TRANSACTION');

      // Registra o lote
      db.prepare(`
        INSERT INTO import_batches (
          id, tenant_id, user_id, file_name, file_type, total_records,
          imported_count, updated_count, skipped_count, error_count, errors_json
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '[]')
      `).run(batchId, tenantId, userId, fileName || 'importacao.xlsx', fileType || 'xlsx', rows.length);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let currentRowPatientName = 'Linha ' + (i + 1);
        try {
          const getFieldValue = (target: string): string => {
            const cols = targetToSources[target] || [];
            for (const col of cols) {
              const val = row[col];
              if (val !== undefined && val !== null && String(val).trim().length > 0) {
                return String(val).trim();
              }
            }
            return '';
          };

          const getCombinedTextValue = (target: string): string => {
            const cols = targetToSources[target] || [];
            const parts: string[] = [];
            for (const col of cols) {
              const val = row[col];
              if (val !== undefined && val !== null && String(val).trim().length > 0) {
                const trimmed = String(val).trim();
                if (!parts.includes(trimmed)) parts.push(trimmed);
              }
            }
            return parts.join('\n\n');
          };

          const fullName = getFieldValue('full_name');
          if (!fullName) {
            skippedCount++;
            continue;
          }
          currentRowPatientName = fullName;

          const rawCpf = getFieldValue('cpf');
          const rawPhone = getFieldValue('phone');
          const rawWhatsapp = getFieldValue('whatsapp');
          const rawEmail = getFieldValue('email');
          const rawBirthDate = getFieldValue('birth_date');
          const rawAddress = getFieldValue('address');
          const rawCity = getFieldValue('city');
          const rawState = getFieldValue('state');
          const rawZip = getFieldValue('zip_code');
          const rawProfession = getFieldValue('profession');
          const rawResponsible = getFieldValue('responsible');
          const rawInsuranceName = getFieldValue('insurance_name');
          const rawInsurancePlan = getFieldValue('insurance_plan');
          const rawInsuranceCard = getFieldValue('insurance_card');
          const rawAllergies = getCombinedTextValue('allergies');
          const rawMedications = getCombinedTextValue('medications');
          const rawChiefComplaint = getCombinedTextValue('chief_complaint');
          const rawAnamnesis = getCombinedTextValue('anamnesis');
          const rawMedicalRecord = getCombinedTextValue('medical_record');
          const rawNotes = getCombinedTextValue('notes_admin');

          const finalPhone = rawPhone || rawWhatsapp || '(00) 00000-0000';

          let combinedNotes = rawNotes;
          if (rawProfession) {
            combinedNotes = combinedNotes ? `${combinedNotes} | Profissão: ${rawProfession}` : `Profissão: ${rawProfession}`;
          }

          let combinedClinicalNotes = '';
          if (rawChiefComplaint) combinedClinicalNotes += `Queixa Principal: ${rawChiefComplaint}\n`;
          if (rawAnamnesis) combinedClinicalNotes += `Anamnese: ${rawAnamnesis}\n`;
          if (rawMedicalRecord) combinedClinicalNotes += `Prontuário/Evolução: ${rawMedicalRecord}\n`;
          if (rawAllergies) combinedClinicalNotes += `Alergias: ${rawAllergies}\n`;
          if (rawMedications) combinedClinicalNotes += `Medicamentos: ${rawMedications}\n`;
          combinedClinicalNotes = combinedClinicalNotes.trim();

          // Checar se paciente já existe
          let existingId: string | undefined;
          const cleanC = cleanDigits(rawCpf);
          const cleanP = cleanDigits(rawPhone || rawWhatsapp);
          const cleanE = rawEmail.toLowerCase().trim();
          const cleanN = normalizeHeader(fullName);

          if (cleanC && cpfMap.has(cleanC)) existingId = cpfMap.get(cleanC);
          else if (cleanP && cleanP.length >= 8 && phoneMap.has(cleanP.slice(-9))) existingId = phoneMap.get(cleanP.slice(-9));
          else if (cleanE && emailMap.has(cleanE)) existingId = emailMap.get(cleanE);
          else if (cleanN && nameMap.has(cleanN)) existingId = nameMap.get(cleanN);

          const userDecision = duplicateDecisions?.[i] || duplicateDecisions?.[fullName] || (existingId ? 'update' : 'create_new');
          let patientIdToUse: string;

          if (existingId && userDecision === 'skip') {
            skippedCount++;
            continue;
          } else if (existingId && userDecision === 'update') {
            patientIdToUse = existingId;
            db.prepare(`
              UPDATE patients SET
                phone = COALESCE(NULLIF(?, ''), phone),
                whatsapp = COALESCE(NULLIF(?, ''), whatsapp),
                email = COALESCE(NULLIF(?, ''), email),
                cpf = COALESCE(NULLIF(?, ''), cpf),
                birth_date = COALESCE(NULLIF(?, ''), birth_date),
                address = COALESCE(NULLIF(?, ''), address),
                city = COALESCE(NULLIF(?, ''), city),
                state = COALESCE(NULLIF(?, ''), state),
                zip_code = COALESCE(NULLIF(?, ''), zip_code),
                emergency_contact = COALESCE(NULLIF(?, ''), emergency_contact),
                health_insurance_provider = COALESCE(NULLIF(?, ''), health_insurance_provider),
                health_insurance_card = COALESCE(NULLIF(?, ''), health_insurance_card),
                health_insurance_plan = COALESCE(NULLIF(?, ''), health_insurance_plan),
                allergies_status = CASE WHEN ? != '' THEN 'has_allergies' ELSE allergies_status END,
                notes_admin = CASE 
                  WHEN ? != '' AND notes_admin IS NOT NULL AND notes_admin != '' THEN notes_admin || ' | ' || ?
                  WHEN ? != '' THEN ?
                  ELSE notes_admin 
                END,
                clinical_notes = CASE 
                  WHEN ? != '' AND clinical_notes IS NOT NULL AND clinical_notes != '' THEN clinical_notes || '\n\n' || ?
                  WHEN ? != '' THEN ?
                  ELSE clinical_notes 
                END,
                updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(
              finalPhone, rawWhatsapp, rawEmail, rawCpf, rawBirthDate,
              rawAddress, rawCity, rawState, rawZip,
              rawResponsible, rawInsuranceName, rawInsuranceCard, rawInsurancePlan,
              rawAllergies,
              combinedNotes, combinedNotes, combinedNotes, combinedNotes,
              combinedClinicalNotes, combinedClinicalNotes, combinedClinicalNotes, combinedClinicalNotes,
              patientIdToUse, tenantId
            );
            updatedCount++;
          } else {
            patientIdToUse = 'pat-imp-' + uuidv4().slice(0, 10);
            db.prepare(`
              INSERT INTO patients (
                id, tenant_id, full_name, cpf, phone, whatsapp, email,
                birth_date, address, city, state, zip_code, emergency_contact,
                health_insurance_provider, health_insurance_card, health_insurance_plan,
                notes_admin, clinical_notes, allergies_status,
                active, import_batch_id
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `).run(
              patientIdToUse, tenantId, fullName, rawCpf || null, finalPhone, rawWhatsapp || null,
              rawEmail || null, rawBirthDate || null, rawAddress || null, rawCity || null,
              rawState || null, rawZip || null, rawResponsible || null,
              rawInsuranceName || null, rawInsuranceCard || null, rawInsurancePlan || null,
              combinedNotes || null, combinedClinicalNotes || null,
              rawAllergies ? 'has_allergies' : null,
              batchId
            );

            if (cleanC) cpfMap.set(cleanC, patientIdToUse);
            if (cleanP && cleanP.length >= 8) phoneMap.set(cleanP.slice(-9), patientIdToUse);
            if (cleanE) emailMap.set(cleanE, patientIdToUse);
            if (cleanN) nameMap.set(cleanN, patientIdToUse);

            importedCount++;
          }

          // Inserção em tabelas clínicas especializadas
          if (rawAllergies) {
            try {
              const algId = 'alg-imp-' + uuidv4().slice(0, 10);
              db.prepare(`
                INSERT INTO patient_allergies (id, tenant_id, patient_id, agent, reaction, status, created_by)
                VALUES (?, ?, ?, ?, 'Importado via lote', 'active', ?)
              `).run(algId, tenantId, patientIdToUse, rawAllergies, userId);
            } catch (_) {}
          }

          if (rawMedications) {
            try {
              const medId = 'med-imp-' + uuidv4().slice(0, 10);
              db.prepare(`
                INSERT INTO patient_medications (id, tenant_id, patient_id, name, status, created_by)
                VALUES (?, ?, ?, ?, 'active', ?)
              `).run(medId, tenantId, patientIdToUse, rawMedications, userId);
            } catch (_) {}
          }

          if (rawAnamnesis || rawChiefComplaint) {
            try {
              const anmId = 'anm-imp-' + uuidv4().slice(0, 10);
              const contentJson = JSON.stringify({
                chief_complaint: rawChiefComplaint || '',
                history: rawAnamnesis || '',
                imported_from: row._source_file || 'importacao'
              });
              db.prepare(`
                INSERT INTO patient_anamnesis (id, tenant_id, patient_id, professional_id, title, template_type, content_json)
                VALUES (?, ?, ?, ?, 'Anamnese Importada', 'general', ?)
              `).run(anmId, tenantId, patientIdToUse, firstProf.id, contentJson);
            } catch (_) {}
          }

          if (rawMedicalRecord) {
            try {
              const recId = 'rec-imp-' + uuidv4().slice(0, 10);
              db.prepare(`
                INSERT INTO records (id, tenant_id, patient_id, professional_id, session_date, title, clinical_evolution, created_by)
                VALUES (?, ?, ?, ?, date('now'), 'Prontuário / Evolução Importada', ?, ?)
              `).run(recId, tenantId, patientIdToUse, firstProf.id, rawMedicalRecord, userId);
            } catch (_) {}
          }

          // Importação opcional de agendamento histórico
          if (importHistoricalAppointments) {
            const rawApptDate = getFieldValue('appointment_date');
            if (rawApptDate) {
              const rawApptTime = getFieldValue('appointment_time') || '09:00';
              let isoStartTime = '';
              let isoEndTime = '';

              if (rawApptDate.includes('-')) {
                isoStartTime = `${rawApptDate}T${rawApptTime.length === 5 ? rawApptTime : '09:00'}:00`;
              } else if (rawApptDate.includes('/')) {
                const parts = rawApptDate.split('/');
                if (parts.length === 3) {
                  const d = parts[0].padStart(2, '0');
                  const m = parts[1].padStart(2, '0');
                  const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                  isoStartTime = `${y}-${m}-${d}T${rawApptTime.length === 5 ? rawApptTime : '09:00'}:00`;
                }
              }

              if (isoStartTime) {
                const startDate = new Date(isoStartTime);
                const endDate = new Date(startDate.getTime() + 50 * 60 * 1000);
                isoEndTime = endDate.toISOString().slice(0, 19);

                const apptId = 'apt-imp-' + uuidv4().slice(0, 10);
                const apptNumber = 'AG-IMP-' + Math.floor(100000 + Math.random() * 900000);

                let apptProfId = firstProf.id;
                const profName = getFieldValue('professional_name');
                if (profName) {
                  const foundProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND LOWER(name) LIKE ? LIMIT 1').get(tenantId, `%${profName.toLowerCase()}%`) as any;
                  if (foundProf) apptProfId = foundProf.id;
                }

                let apptServiceId = firstService.id;
                const srvName = getFieldValue('service_name');
                if (srvName) {
                  const foundSrv = db.prepare('SELECT id FROM services WHERE tenant_id = ? AND LOWER(name) LIKE ? LIMIT 1').get(tenantId, `%${srvName.toLowerCase()}%`) as any;
                  if (foundSrv) apptServiceId = foundSrv.id;
                }

                db.prepare(`
                  INSERT INTO appointments (
                    id, tenant_id, appointment_number, patient_id, professional_id,
                    service_id, start_time, end_time, status, modality,
                    patient_notes, import_batch_id, created_by
                  )
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'presential', ?, ?, ?)
                `).run(
                  apptId,
                  tenantId,
                  apptNumber,
                  patientIdToUse,
                  apptProfId,
                  apptServiceId,
                  isoStartTime,
                  isoEndTime,
                  `Histórico importado em lote #${batchId}`,
                  batchId,
                  userId
                );
              }
            }
          }
        } catch (rowErr: any) {
          errorCount++;
          errors.push({
            row: i + 1,
            patientName: currentRowPatientName,
            reason: rowErr.message || 'Erro ao processar linha'
          });
        }
      }

      db.prepare(`
        UPDATE import_batches SET
          imported_count = ?,
          updated_count = ?,
          skipped_count = ?,
          error_count = ?,
          errors_json = ?
        WHERE id = ? AND tenant_id = ?
      `).run(importedCount, updatedCount, skippedCount, errorCount, JSON.stringify(errors), batchId, tenantId);

      db.exec('COMMIT');

      logAudit(req, 'EXECUTE_IMPORT_BATCH', 'import_batches', batchId, {
        fileName,
        total: rows.length,
        importedCount,
        updatedCount,
        skippedCount,
        errorCount
      });

      res.status(201).json({
        success: true,
        batchId,
        message: `Importação #${batchId} concluída com sucesso!`,
        totalRecords: rows.length,
        importedCount,
        updatedCount,
        skippedCount,
        errorCount,
        errors
      });
    } catch (err: any) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {}
      console.error('[ImportController.executeImport] Erro geral:', err);
      res.status(500).json({ error: 'Erro ao executar a importação transacional: ' + (err.message || '') });
    }
  }

  /**
   * 3. LISTAR HISTÓRICO DE LOTES DE IMPORTAÇÃO
   */
  static listBatches(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const batches = db.prepare(`
        SELECT ib.*, u.name as imported_by_name
        FROM import_batches ib
        LEFT JOIN users u ON u.id = ib.user_id
        WHERE ib.tenant_id = ?
        ORDER BY ib.created_at DESC
        LIMIT 50
      `).all(tenantId);

      res.json(batches);
    } catch (err: any) {
      console.error('[ImportController.listBatches] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar histórico de importações' });
    }
  }

  /**
   * 4. REVERSÃO TOTAL DO LOTE (ROLLBACK SELETIVO PELO ADMINISTRADOR)
   */
  static rollbackBatch(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id: batchId } = req.params;

      const batch = db.prepare('SELECT * FROM import_batches WHERE id = ? AND tenant_id = ?').get(batchId, tenantId) as any;
      if (!batch) {
        res.status(404).json({ error: 'Lote de importação não encontrado' });
        return;
      }

      db.exec('BEGIN TRANSACTION');

      // 1. Deletar agendamentos do lote
      const delAppts = db.prepare('DELETE FROM appointments WHERE import_batch_id = ? AND tenant_id = ?').run(batchId, tenantId);

      // 2. Deletar pacientes que foram criados exclusivamente neste lote
      const delPatients = db.prepare('DELETE FROM patients WHERE import_batch_id = ? AND tenant_id = ?').run(batchId, tenantId);

      // 3. Atualizar status ou deletar lote
      db.prepare('DELETE FROM import_batches WHERE id = ? AND tenant_id = ?').run(batchId, tenantId);

      db.exec('COMMIT');

      logAudit(req, 'ROLLBACK_IMPORT_BATCH', 'import_batches', batchId, {
        deletedAppointments: delAppts.changes,
        deletedPatients: delPatients.changes
      });

      res.json({
        success: true,
        message: `Lote #${batchId} revertido com sucesso. ${delPatients.changes} novos pacientes e ${delAppts.changes} atendimentos importados foram removidos com segurança.`,
        deletedPatients: delPatients.changes,
        deletedAppointments: delAppts.changes
      });
    } catch (err: any) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {}
      console.error('[ImportController.rollbackBatch] Erro:', err);
      res.status(500).json({ error: 'Erro ao reverter o lote de importação' });
    }
  }

  /**
   * 5. EXPORTAÇÃO PERSONALIZADA PARA DOCX COM TABELAS E IDENTIDADE VISUAL DA CLÍNICA
   */
  static exportCustomDocx(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { title, headers, rows, subtitle } = req.body;

      const clinic = db.prepare('SELECT name, trade_name, cnpj_cpf, phone, email, street, number, neighborhood, city, state, address FROM tenants WHERE id = ?').get(tenantId) as any;
      const clinicName = clinic?.trade_name || clinic?.name || 'Clínica Emissora';
      const clinicAddress = clinic?.address || [
        [clinic?.street, clinic?.number].filter(Boolean).join(', '),
        clinic?.neighborhood,
        (clinic?.city && clinic?.state) ? `${clinic.city}/${clinic.state}` : (clinic?.city || '')
      ].filter(Boolean).join(' - ') + (clinic?.phone ? ` | Tel: ${clinic.phone}` : '');

      const docTitle = title || 'Relatório de Dados';
      const tableHeaders = (headers || []).map((h: string) => `<th>${h}</th>`).join('');
      const tableRows = (rows || []).map((r: string[]) => `<tr>${r.map(c => `<td>${c || '-'}</td>`).join('')}</tr>`).join('');

      const docxHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${docTitle}</title>
          <style>
            @page Section1 { size: 595.3pt 841.9pt; margin: 40pt; }
            div.Section1 { page: Section1; font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 10.5pt; color: #1e293b; }
            .header-banner { border-bottom: 2px solid #0284c7; padding-bottom: 10pt; margin-bottom: 16pt; }
            .clinic-name { font-size: 15pt; font-weight: bold; color: #0f172a; margin: 0; }
            .clinic-sub { font-size: 9pt; color: #64748b; margin-top: 3pt; }
            h1 { color: #0284c7; font-size: 16pt; margin: 12pt 0 4pt 0; }
            .sub-info { font-size: 9.5pt; color: #64748b; margin-bottom: 12pt; }
            table { width: 100%; border-collapse: collapse; margin-top: 8pt; }
            th, td { border: 1px solid #cbd5e1; padding: 6pt 8pt; text-align: left; font-size: 9.5pt; }
            th { background-color: #f1f5f9; color: #0f172a; font-weight: bold; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .footer-box { border-top: 1px solid #e2e8f0; margin-top: 25pt; padding-top: 10pt; font-size: 8.5pt; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="Section1">
            <div class="header-banner">
              <div class="clinic-name">${clinicName}</div>
              <div class="clinic-sub">${clinicAddress}</div>
            </div>
            <h1>${docTitle}</h1>
            <div class="sub-info">${subtitle || 'Exportação oficial gerada pelo Sistema Zemda'} • Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</div>
            <table>
              <thead><tr>${tableHeaders}</tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
            <div class="footer-box">
              <p>Zemda — Plataforma de Gestão Clínica Inteligente</p>
            </div>
          </div>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'application/vnd.ms-word; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${docTitle.replace(/\s+/g, '_')}.docx"`);
      res.send(docxHtml);
    } catch (err: any) {
      console.error('[ImportController.exportCustomDocx] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar exportação para Word (.docx)' });
    }
  }
}
