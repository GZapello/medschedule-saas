// ============================================================================
// ZEMDA AI — Minimização de dados enviados a provedores externos (LGPD)
// ============================================================================
// Dados de saúde são sensíveis (LGPD art. 11). Tudo que vai para o Gemini deve
// conter apenas o necessário para a tarefa clínica: nome real, CPF, telefone,
// e-mail, contato de emergência e observações administrativas NUNCA são
// enviados. O nome é trocado por um marcador neutro e, quando a saída precisa
// exibir o nome, ele é reinserido localmente APÓS a resposta.
// ============================================================================

/** Marcador neutro usado no lugar do nome do paciente nos prompts. */
export const PATIENT_PLACEHOLDER = 'Paciente';

/** Marcador neutro usado no lugar do nome do aluno (ZemdaPersonal). */
export const STUDENT_PLACEHOLDER = 'Aluno(a)';

/**
 * Marcador explícito para documentos em que o nome real deve aparecer na saída
 * (ex.: relatórios de evolução). O modelo recebe só o marcador; o nome real é
 * reinserido localmente com `reinsertName`.
 */
export const PATIENT_NAME_TOKEN = '[NOME DO PACIENTE]';

const REMOVED = '[dado removido]';

type Replacement = { pattern: RegExp; replacement: string };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex tolerante a separadores (espaço, ponto, hífen, parênteses, barra) entre dígitos. */
function digitsPattern(digits: string): RegExp {
  const body = digits.split('').map(escapeRegex).join('[\\s.\\-()/]*');
  // Inclui "+" (DDI) e "(" (DDD) iniciais para não deixar sobras como "([dado removido]"
  return new RegExp(`(?<!\\d)[+(]*${body}(?!\\d)`, 'g');
}

/** Regex de palavra/expressão inteira, sem diferenciar maiúsculas e ignorando letras acentuadas vizinhas. */
function wordPattern(value: string): RegExp {
  const body = value.trim().split(/\s+/).map(escapeRegex).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * Monta a lista de substituições para os identificadores diretos de um paciente/aluno.
 * Nomes viram o marcador neutro; demais identificadores viram "[dado removido]".
 */
export function buildIdentifierReplacements(person: any, namePlaceholder: string = PATIENT_PLACEHOLDER): Replacement[] {
  if (!person) return [];
  const out: Replacement[] = [];
  const seen = new Set<string>();

  const addText = (value: any, replacement: string, minLen = 3) => {
    const v = typeof value === 'string' ? value.trim() : '';
    if (v.length < minLen) return;
    const key = `t:${v.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ pattern: wordPattern(v), replacement });
  };

  const addDigits = (value: any) => {
    const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8) {
      // Valores curtos/não numéricos: remove o texto literal se houver
      addText(raw, REMOVED, 6);
      return;
    }
    const variants = [digits];
    // Telefones com DDI 55: também cobre a forma sem DDI
    if (digits.length >= 12 && digits.startsWith('55')) variants.push(digits.slice(2));
    for (const d of variants) {
      const key = `d:${d}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ pattern: digitsPattern(d), replacement: REMOVED });
    }
  };

  // Blocos de texto administrativos longos primeiro (antes de trocar partes deles)
  addText(person.notes_admin, REMOVED, 6);
  addText(person.address, REMOVED, 6);
  addText(person.email, REMOVED);
  addText(person.emergency_contact, REMOVED);

  addDigits(person.cpf);
  addDigits(person.phone);
  addDigits(person.whatsapp);
  addDigits(person.emergency_phone);
  addDigits(person.health_insurance_card);

  // Nomes: completo, social e primeiro nome
  const names = [person.full_name, person.social_name, person.name].filter((n: any) => typeof n === 'string' && n.trim());
  // Ordena do maior para o menor para não quebrar o nome completo ao trocar o primeiro nome antes
  const fullNames = Array.from(new Set(names.map((n: string) => n.trim()))).sort((a, b) => b.length - a.length);
  for (const n of fullNames) addText(n, namePlaceholder, 2);
  for (const n of fullNames) {
    const first = n.split(/\s+/)[0];
    if (first && first.length >= 3 && first.toLowerCase() !== namePlaceholder.toLowerCase()) {
      addText(first, namePlaceholder, 3);
    }
  }

  return out;
}

/** Remove padrões genéricos de CPF e e-mail (defesa em profundidade para texto persistido). */
const GENERIC_PATTERNS: Replacement[] = [
  { pattern: /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g, replacement: REMOVED },
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: REMOVED }
];

/** Aplica as substituições (identificadores conhecidos + padrões genéricos) a um texto. */
export function redactText(text: string, replacements: Replacement[]): string {
  if (!text) return text;
  let out = text;
  for (const r of replacements) {
    r.pattern.lastIndex = 0;
    out = out.replace(r.pattern, r.replacement);
  }
  for (const r of GENERIC_PATTERNS) {
    r.pattern.lastIndex = 0;
    out = out.replace(r.pattern, r.replacement);
  }
  return out;
}

/** Redige identificadores em um histórico de conversa antes de reenviá-lo ao modelo. */
export function redactHistory<T extends { text: string }>(history: T[], replacements: Replacement[]): T[] {
  return (history || []).map(msg => {
    if (!msg || typeof msg.text !== 'string') return msg;
    return { ...msg, text: redactText(msg.text, replacements) };
  });
}

/** Reinsere localmente o nome real no lugar do marcador explícito, após a resposta do modelo. */
export function reinsertName(text: string, realName: string | null | undefined, token: string = PATIENT_NAME_TOKEN): string {
  if (!text || !realName) return text;
  return text.split(token).join(realName);
}
