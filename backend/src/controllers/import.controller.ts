import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import { logAudit } from '../middlewares/audit.middleware';

// Definição dos campos alvo para mapeamento inteligente
export const TARGET_FIELDS = [
  { field: 'full_name', label: 'Nome Completo do Paciente *', required: true, synonyms: ['nome', 'nome completo', 'paciente', 'cliente', 'nome do paciente', 'nome paciente', 'patient', 'name', 'full name'] },
  { field: 'cpf', label: 'CPF / Documento', required: false, synonyms: ['cpf', 'cpf/cnpj', 'documento', 'doc', 'nr_documento', 'cpf_paciente', 'cpf/rg'] },
  { field: 'phone', label: 'Telefone / Celular *', required: false, synonyms: ['telefone', 'fone', 'tel', 'celular', 'contato', 'cel', 'phone', 'mobile'] },
  { field: 'whatsapp', label: 'WhatsApp', required: false, synonyms: ['whatsapp', 'whats', 'zap', 'wpp'] },
  { field: 'email', label: 'E-mail', required: false, synonyms: ['email', 'e-mail', 'mail', 'correio'] },
  { field: 'birth_date', label: 'Data de Nascimento', required: false, synonyms: ['data nascimento', 'nascimento', 'data de nascimento', 'dt nascimento', 'dt_nasc', 'dtnasc', 'aniversario', 'birth', 'birthday'] },
  { field: 'address', label: 'Endereço Completo', required: false, synonyms: ['endereco', 'endereço', 'rua', 'logradouro', 'address', 'rua/av'] },
  { field: 'city', label: 'Cidade', required: false, synonyms: ['cidade', 'municipio', 'município', 'city'] },
  { field: 'state', label: 'Estado (UF)', required: false, synonyms: ['estado', 'uf', 'state'] },
  { field: 'zip_code', label: 'CEP', required: false, synonyms: ['cep', 'codigo postal', 'zip', 'zipcode'] },
  { field: 'notes_admin', label: 'Observações / Histórico Geral', required: false, synonyms: ['observacoes', 'observações', 'obs', 'historico', 'notas', 'anotacoes', 'notes', 'quadro clinico'] },
  { field: 'appointment_date', label: 'Data da Consulta / Histórico', required: false, synonyms: ['data consulta', 'data atendimento', 'data da consulta', 'data agendamento', 'data sessao', 'dt consulta', 'dia consulta'] },
  { field: 'appointment_time', label: 'Horário da Consulta', required: false, synonyms: ['horario', 'hora', 'horário', 'hora consulta', 'hora atendimento', 'horario agendamento'] },
  { field: 'professional_name', label: 'Profissional / Médico(a)', required: false, synonyms: ['medico', 'médico', 'profissional', 'doutor', 'dr', 'dra', 'atendente', 'especialista'] },
  { field: 'service_name', label: 'Serviço / Procedimento', required: false, synonyms: ['servico', 'serviço', 'procedimento', 'especialidade', 'tipo atendimento', 'tipo consulta'] },
  { field: 'insurance_name', label: 'Convênio / Operadora', required: false, synonyms: ['convenio', 'convênio', 'operadora', 'plano de saude', 'plano saude', 'seguro', 'assistencia medica'] },
  { field: 'insurance_plan', label: 'Plano do Convênio', required: false, synonyms: ['plano', 'categoria plano', 'tipo plano', 'nome plano', 'plano convenio'] },
  { field: 'insurance_card', label: 'Número da Carteirinha', required: false, synonyms: ['carteirinha', 'matricula', 'matrícula', 'num carteira', 'nr carteira', 'codigo carteira', 'nr matricula'] }
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

  // Extrair tabelas <w:tbl>
  const tblMatches = xml.match(/<w:tbl[\s\S]*?<\/w:tbl>/g);
  if (tblMatches && tblMatches.length > 0) {
    // Escolhe a tabela com mais linhas
    let bestTableRows: string[][] = [];
    for (const tblXml of tblMatches) {
      const trMatches = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
      const currentRows: string[][] = [];

      for (const trXml of trMatches) {
        const tcMatches = trXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
        const rowCells: string[] = [];

        for (const tcXml of tcMatches) {
          // Extrair todo o texto dos nós <w:t>
          const tMatches = tcXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
          let cellText = '';
          if (tMatches.length > 0) {
            for (const tNode of tMatches) {
              const textInside = tNode.replace(/^<w:t\b[^>]*>/, '').replace(/<\/w:t>$/, '');
              cellText += textInside;
            }
          } else {
            cellText = tcXml;
          }
          // Limpar qualquer tag XML remanescente e decodificar entidades XML
          cellText = cellText
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
          rowCells.push(cellText);
        }

        if (rowCells.some(c => c.length > 0)) {
          currentRows.push(rowCells);
        }
      }

      if (currentRows.length > bestTableRows.length) {
        bestTableRows = currentRows;
      }
    }

    if (bestTableRows.length > 0) {
      const headerRow = bestTableRows[0];
      const headers = headerRow.map((h, i) => (h && h.trim().length > 0 ? h.trim() : `Coluna_${i + 1}`));
      const rows: Record<string, string>[] = [];

      for (let r = 1; r < bestTableRows.length; r++) {
        const rowData: Record<string, string> = {};
        const cells = bestTableRows[r];
        headers.forEach((h, i) => {
          rowData[h] = cells[i] || '';
        });
        if (Object.values(rowData).some(v => v.trim().length > 0)) {
          rows.push(rowData);
        }
      }

      return { headers, rows };
    }
  }

  // Fallback se não houver tabela: interpretar parágrafos <w:p>
  const pMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const lines: string[] = [];

  for (const pXml of pMatches) {
    const tMatches = pXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    let pText = '';
    for (const tNode of tMatches) {
      const textInside = tNode.replace(/^<w:t\b[^>]*>/, '').replace(/<\/w:t>$/, '');
      pText += textInside;
    }
    pText = pText.replace(/<[^>]+>/g, '').trim();
    if (pText.length > 0) lines.push(pText);
  }

  // Verificar se há linhas com separador (tab, vírgula, ponto-e-vírgula)
  if (lines.length > 1 && (lines[0].includes(';') || lines[0].includes(',') || lines[0].includes('\t'))) {
    const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(delimiter).map(c => c.trim());
      const rowData: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowData[h] = cells[idx] || '';
      });
      rows.push(rowData);
    }
    return { headers, rows };
  }

  // Fallback: chave-valor estruturado por blocos de pacientes
  const headers = ['Nome Completo', 'CPF', 'Telefone', 'E-mail', 'Data de Nascimento', 'Observações'];
  const rows: Record<string, string>[] = [];
  let currentRow: Record<string, string> = {};

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('nome:') || lower.startsWith('paciente:')) {
      if (Object.keys(currentRow).length > 0) {
        rows.push(currentRow);
        currentRow = {};
      }
      currentRow['Nome Completo'] = line.split(':')[1]?.trim() || '';
    } else if (lower.startsWith('cpf:')) {
      currentRow['CPF'] = line.split(':')[1]?.trim() || '';
    } else if (lower.startsWith('tel:') || lower.startsWith('telefone:') || lower.startsWith('celular:')) {
      currentRow['Telefone'] = line.split(':')[1]?.trim() || '';
    } else if (lower.startsWith('email:') || lower.startsWith('e-mail:')) {
      currentRow['E-mail'] = line.split(':')[1]?.trim() || '';
    } else if (lower.startsWith('nasc:') || lower.startsWith('nascimento:')) {
      currentRow['Data de Nascimento'] = line.split(':')[1]?.trim() || '';
    } else if (lower.startsWith('obs:') || lower.startsWith('observacao:') || lower.startsWith('observação:')) {
      currentRow['Observações'] = line.split(':')[1]?.trim() || '';
    }
  }
  if (Object.keys(currentRow).length > 0) {
    rows.push(currentRow);
  }

  return { headers, rows };
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

  // Detecta delimitador: conta ocorrências na primeira linha (suporte especial a ; do Excel BR)
  const firstLine = rawLines[0];
  const countSemicolon = (firstLine.match(/;/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;
  const countTab = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (countSemicolon >= countComma && countSemicolon >= countTab && countSemicolon > 0) {
    delimiter = ';';
  } else if (countTab >= countComma && countTab > 0) {
    delimiter = '\t';
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
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Nenhuma planilha encontrada no arquivo.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

  if (!rawRows || rawRows.length === 0) {
    return { headers: [], rows: [] };
  }

  // Localizar primeira linha com conteúdo para cabeçalho
  let headerIndex = 0;
  for (let i = 0; i < rawRows.length; i++) {
    if (rawRows[i].some(cell => String(cell).trim().length > 0)) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = rawRows[headerIndex] || [];
  const headers = rawHeaders.map((h: any, i: number) => {
    const str = String(h || '').trim();
    return str.length > 0 ? str : `Coluna_${i + 1}`;
  });

  const rows: Record<string, string>[] = [];
  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const rowCells = rawRows[i] || [];
    if (!rowCells.some((c: any) => String(c).trim().length > 0)) continue;

    const rowData: Record<string, string> = {};
    headers.forEach((h: string, idx: number) => {
      let cellVal = rowCells[idx];
      if (cellVal instanceof Date) {
        cellVal = cellVal.toISOString().split('T')[0];
      }
      rowData[h] = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
    });
    rows.push(rowData);
  }

  return { headers, rows };
}

export class ImportController {
  /**
   * 1. PARSE DO ARQUIVO + MAPEAMENTO INTELIGENTE + DETECÇÃO DE DUPLICATAS
   */
  static parseFile(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { fileName, fileBase64 } = req.body;

      if (!fileName || !fileBase64) {
        res.status(400).json({ error: 'Arquivo e nome do arquivo são obrigatórios' });
        return;
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      let parsed: { headers: string[]; rows: Record<string, string>[] };

      if (ext === 'docx') {
        parsed = parseDocxContent(buffer);
      } else if (['csv', 'tsv', 'txt'].includes(ext)) {
        try {
          parsed = parseCsvContent(buffer);
          if (parsed.headers.length === 0 || parsed.rows.length === 0) {
            parsed = parseSpreadsheetContent(buffer);
          }
        } catch (e) {
          parsed = parseSpreadsheetContent(buffer);
        }
      } else if (['xlsx', 'xls'].includes(ext)) {
        parsed = parseSpreadsheetContent(buffer);
      } else {
        res.status(400).json({ error: `Formato de arquivo .${ext} não suportado. Utilize .docx, .xlsx, .csv ou .txt` });
        return;
      }

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        res.status(400).json({ error: 'Nenhum dado ou cabeçalho identificado no arquivo enviado.' });
        return;
      }

      // Mapeamento heurístico de colunas
      const columnMappings = parsed.headers.map(header => {
        const match = matchColumn(header);
        return {
          sourceColumn: header,
          targetField: match.targetField,
          confidence: match.confidence
        };
      });

      // Busca pacientes existentes da clínica para detecção inteligente de duplicatas
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

      // Análise de duplicidade linha a linha (Banco da clínica + Repetições dentro do próprio arquivo)
      const intraCpfSet = new Set<string>();
      const intraPhoneSet = new Set<string>();
      const intraEmailSet = new Set<string>();
      const intraNameSet = new Set<string>();

      let duplicateCount = 0;
      let intraDuplicateCount = 0;

      const previewRows = parsed.rows.slice(0, 100).map((row, idx) => {
        let isDuplicate = false;
        let isIntraDuplicate = false;
        let matchedPatient: any = null;
        let matchReason = '';

        // Tenta achar campo mapeado ou heurístico
        const nameField = columnMappings.find(m => m.targetField === 'full_name')?.sourceColumn;
        const cpfField = columnMappings.find(m => m.targetField === 'cpf')?.sourceColumn;
        const phoneField = columnMappings.find(m => m.targetField === 'phone')?.sourceColumn;
        const emailField = columnMappings.find(m => m.targetField === 'email')?.sourceColumn;

        const rowCpf = cpfField ? cleanDigits(row[cpfField]) : '';
        const rowPhone = phoneField ? cleanDigits(row[phoneField]) : '';
        const rowEmail = emailField ? (row[emailField] || '').toLowerCase().trim() : '';
        const rowName = nameField ? normalizeHeader(row[nameField] || '') : '';

        // 1. Checa contra banco existente
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

        // 2. Checa duplicidade intra-arquivo
        if (rowCpf && intraCpfSet.has(rowCpf)) {
          isIntraDuplicate = true;
          matchReason = matchReason ? `${matchReason} (e repetido no arquivo)` : 'CPF repetido no próprio arquivo';
        } else if (rowPhone && rowPhone.length >= 8 && intraPhoneSet.has(rowPhone.slice(-9))) {
          isIntraDuplicate = true;
          matchReason = matchReason ? `${matchReason} (e repetido no arquivo)` : 'Telefone repetido no próprio arquivo';
        } else if (rowEmail && intraEmailSet.has(rowEmail)) {
          isIntraDuplicate = true;
          matchReason = matchReason ? `${matchReason} (e repetido no arquivo)` : 'E-mail repetido no próprio arquivo';
        } else if (rowName && rowName.length > 5 && intraNameSet.has(rowName)) {
          isIntraDuplicate = true;
          matchReason = matchReason ? `${matchReason} (e repetido no arquivo)` : 'Nome repetido no próprio arquivo';
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
        fileName,
        fileType: ext,
        totalRows: parsed.rows.length,
        headers: parsed.headers,
        columnMappings,
        availableTargetFields: TARGET_FIELDS,
        duplicateCount,
        intraDuplicateCount,
        allRows: parsed.rows,
        previewRows
      });
    } catch (err: any) {
      console.error('[ImportController.parseFile] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar e ler o arquivo: ' + (err.message || 'Formato inválido') });
    }
  }

  /**
   * 2. EXECUÇÃO EM LOTE TRANSACIONAL COM RESOLUÇÃO DE DUPLICATAS E CONSULTAS HISTÓRICAS
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

    // Mapeador invertido: targetField -> sourceColumn
    const targetToSource: Record<string, string> = {};
    for (const m of columnMappings) {
      if (m.targetField && m.sourceColumn) {
        targetToSource[m.targetField] = m.sourceColumn;
      }
    }

    if (!targetToSource['full_name']) {
      res.status(400).json({ error: 'O mapeamento do campo "Nome Completo" é estritamente obrigatório.' });
      return;
    }

    // Profissionais e serviços para histórico de agendamentos
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
        try {
          const fullName = (row[targetToSource['full_name']] || '').trim();
          if (!fullName) {
            skippedCount++;
            continue;
          }

          const rawCpf = targetToSource['cpf'] ? (row[targetToSource['cpf']] || '').trim() : '';
          const rawPhone = targetToSource['phone'] ? (row[targetToSource['phone']] || '').trim() : '';
          const rawWhatsapp = targetToSource['whatsapp'] ? (row[targetToSource['whatsapp']] || '').trim() : '';
          const rawEmail = targetToSource['email'] ? (row[targetToSource['email']] || '').trim() : '';
          const rawBirthDate = targetToSource['birth_date'] ? (row[targetToSource['birth_date']] || '').trim() : '';
          const rawAddress = targetToSource['address'] ? (row[targetToSource['address']] || '').trim() : '';
          const rawCity = targetToSource['city'] ? (row[targetToSource['city']] || '').trim() : '';
          const rawState = targetToSource['state'] ? (row[targetToSource['state']] || '').trim() : '';
          const rawZip = targetToSource['zip_code'] ? (row[targetToSource['zip_code']] || '').trim() : '';
          const rawNotes = targetToSource['notes_admin'] ? (row[targetToSource['notes_admin']] || '').trim() : '';

          // Telefone de segurança caso não venha no arquivo
          const finalPhone = rawPhone || rawWhatsapp || '(00) 00000-0000';

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

          // Decisão de duplicidade para esta linha
          const userDecision = duplicateDecisions?.[i] || duplicateDecisions?.[fullName] || (existingId ? 'update' : 'create_new');

          let patientIdToUse: string;

          if (existingId && userDecision === 'skip') {
            skippedCount++;
            continue;
          } else if (existingId && userDecision === 'update') {
            patientIdToUse = existingId;
            // Atualiza paciente existente mesclando dados
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
                notes_admin = CASE 
                  WHEN ? != '' AND notes_admin IS NOT NULL THEN notes_admin || ' | ' || ?
                  WHEN ? != '' THEN ?
                  ELSE notes_admin 
                END,
                updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(
              finalPhone, rawWhatsapp, rawEmail, rawCpf, rawBirthDate,
              rawAddress, rawCity, rawState, rawZip,
              rawNotes, rawNotes, rawNotes, rawNotes,
              patientIdToUse, tenantId
            );
            updatedCount++;
          } else {
            // Criação de novo paciente
            patientIdToUse = 'pat-imp-' + uuidv4().slice(0, 10);
            db.prepare(`
              INSERT INTO patients (
                id, tenant_id, full_name, cpf, phone, whatsapp, email,
                birth_date, address, city, state, zip_code, notes_admin,
                active, import_batch_id
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `).run(
              patientIdToUse, tenantId, fullName, rawCpf || null, finalPhone, rawWhatsapp || null,
              rawEmail || null, rawBirthDate || null, rawAddress || null, rawCity || null,
              rawState || null, rawZip || null, rawNotes || null, batchId
            );

            // Atualiza mapas em memória para as próximas linhas
            if (cleanC) cpfMap.set(cleanC, patientIdToUse);
            if (cleanP && cleanP.length >= 8) phoneMap.set(cleanP.slice(-9), patientIdToUse);
            if (cleanE) emailMap.set(cleanE, patientIdToUse);
            if (cleanN) nameMap.set(cleanN, patientIdToUse);

            importedCount++;
          }

          // Importação opcional de agendamento histórico
          if (importHistoricalAppointments && targetToSource['appointment_date']) {
            const rawApptDate = (row[targetToSource['appointment_date']] || '').trim();
            if (rawApptDate) {
              const rawApptTime = targetToSource['appointment_time'] ? (row[targetToSource['appointment_time']] || '09:00').trim() : '09:00';
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
                if (targetToSource['professional_name']) {
                  const profName = (row[targetToSource['professional_name']] || '').trim();
                  if (profName) {
                    const foundProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND LOWER(name) LIKE ? LIMIT 1').get(tenantId, `%${profName.toLowerCase()}%`) as any;
                    if (foundProf) apptProfId = foundProf.id;
                  }
                }

                let apptServiceId = firstService.id;
                if (targetToSource['service_name']) {
                  const srvName = (row[targetToSource['service_name']] || '').trim();
                  if (srvName) {
                    const foundSrv = db.prepare('SELECT id FROM services WHERE tenant_id = ? AND LOWER(name) LIKE ? LIMIT 1').get(tenantId, `%${srvName.toLowerCase()}%`) as any;
                    if (foundSrv) apptServiceId = foundSrv.id;
                  }
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
            patientName: row[targetToSource['full_name']] || `Linha ${i + 1}`,
            reason: rowErr.message || 'Erro ao processar linha'
          });
        }
      }

      // Atualiza o resumo do lote
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

      const clinic = db.prepare('SELECT name, document, phone, email, address_street, address_number, address_city, address_state FROM tenants WHERE id = ?').get(tenantId) as any;
      const clinicName = clinic?.name || 'Zemda Saúde';
      const clinicAddress = `${clinic?.address_street || ''}, ${clinic?.address_number || ''} - ${clinic?.address_city || ''}/${clinic?.address_state || ''} | Tel: ${clinic?.phone || ''}`;

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
            <div class="sub-info">${subtitle || 'Exportação oficial gerada pelo sistema Zemda Saúde'} • Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</div>
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
