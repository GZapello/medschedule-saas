export type AACCategories =
  | 'pronoun'    // Amarelo: Pessoas, Pronomes (Eu, Você, Papai, etc.)
  | 'action'     // Verde: Verbos, Ações (Quero, Comer, Beber, Ir, etc.)
  | 'noun'       // Laranja: Substantivos, Objetos, Coisas (Água, Banheiro, etc.)
  | 'feeling'    // Azul: Emoções, Sentimentos, Sensações (Feliz, Dor, etc.)
  | 'descriptor' // Branco / Cinza: Descritores, Respostas (Sim, Não, Mais, etc.)
  | 'social'     // Rosa / Roxo: Social, Cortesia (Oi, Tchau, Obrigado, etc.)
  | 'navigation';// Índigo: Cartão que abre outra página

export interface AACCard {
  id: string;
  board_id: string;
  page_id: string;
  label: string;
  spoken_text: string;
  image_url?: string;
  symbol_type?: 'symbol' | 'emoji' | 'image';
  category: AACCategories;
  color?: string;
  position: number;
  target_page_id?: string | null;
  behavior?: 'word' | 'navigation' | 'word_and_navigation';
  active: boolean | number;
  created_at?: string;
  updated_at?: string;
}

export interface AACAccessibilityPrefs {
  gridDensity: 'large' | 'medium' | 'compact';
  textSize: 'normal' | 'large' | 'extra-large';
  symbolSize: 'normal' | 'large';
  highContrast: boolean;
  speakOnClick: boolean;
  speechRate: number;
  voiceURI?: string;
  pinCoreBar?: boolean;
}

export interface AACPage {
  id: string;
  board_id: string;
  name: string;
  position: number;
  icon?: string;
  cards?: AACCard[];
  created_at?: string;
}

export interface AACBoard {
  id: string;
  tenant_id: string;
  patient_id: string;
  created_by_professional_id: string;
  name: string;
  description?: string;
  context?: string;
  columns: number;
  status: 'active' | 'archived';
  is_template?: number;
  pages?: AACPage[];
  created_at?: string;
  updated_at?: string;
  pages_count?: number;
  cards_count?: number;
}

export interface AACPhraseItem {
  id: string;
  label: string;
  spoken_text: string;
  category: AACCategories;
  color?: string;
  symbol_type?: 'symbol' | 'emoji' | 'image';
  image_url?: string;
}

export const FITZGERALD_COLORS: Record<AACCategories, { bg: string; border: string; text: string; label: string }> = {
  pronoun: {
    bg: '#fef9c3', // yellow-100
    border: '#eab308', // yellow-500
    text: '#854d0e', // yellow-800
    label: 'Pessoas / Pronomes'
  },
  action: {
    bg: '#dcfce7', // green-100
    border: '#22c55e', // green-500
    text: '#166534', // green-800
    label: 'Ações / Verbos'
  },
  noun: {
    bg: '#ffedd5', // orange-100
    border: '#f97316', // orange-500
    text: '#9a3412', // orange-800
    label: 'Substantivos / Objetos'
  },
  feeling: {
    bg: '#dbeafe', // blue-100
    border: '#3b82f6', // blue-500
    text: '#1e40af', // blue-800
    label: 'Sentimentos / Sensações'
  },
  descriptor: {
    bg: '#f8fafc', // slate-50
    border: '#94a3b8', // slate-400
    text: '#334155', // slate-700
    label: 'Descritores / Respostas'
  },
  social: {
    bg: '#fce7f3', // pink-100
    border: '#ec4899', // pink-500
    text: '#9d174d', // pink-800
    label: 'Social / Cortesia'
  },
  navigation: {
    bg: '#e0e7ff', // indigo-100
    border: '#6366f1', // indigo-500
    text: '#3730a3', // indigo-800
    label: 'Navegação de Página'
  }
};
