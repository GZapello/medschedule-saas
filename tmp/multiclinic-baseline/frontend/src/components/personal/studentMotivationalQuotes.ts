/**
 * Coleção local de frases motivacionais esportivas, originais e curtas para o aluno do ZemdaPersonal.
 * Escolhida uma única vez ao montar/carregar a tela (estável em re-renderizações).
 */

const WEEKDAY_QUOTES: Record<number, string[]> = {
  0: [ // Domingo
    "Domingo de foco e preparo. Sua evolução não para! 🌟",
    "Recarregue as energias e prepare o corpo para a semana! 💪",
    "Quem tem disciplina treina no seu próprio ritmo. Bom domingo! 🎯"
  ],
  1: [ // Segunda
    "Segunda é dia de começar com força total! 🔥",
    "Inicie a semana no melhor ritmo: superando seus limites! 🚀",
    "O melhor dia para recomeçar com tudo é hoje! 💪"
  ],
  2: [ // Terça
    "Terça-feira de foco e determinação. Vamos! 💪",
    "Mantenha o ritmo! Cada repetição constrói o resultado. 🎯",
    "Constância é o segredo dos grandes resultados. Força hoje! ⚡"
  ],
  3: [ // Quarta
    "Quarta é dia de levantar peso! 💪",
    "Metade da semana vencida e o foco continua no topo! 🔥",
    "Não desacelere agora. Faça a quarta-feira valer a pena! ⚡"
  ],
  4: [ // Quinta
    "Quinta no ritmo certo. Cada repetição conta! ⚡",
    "Mais um dia, mais um passo em direção à sua melhor versão. 🎯",
    "Supere sua meta de hoje com foco e técnica impecável! 💎"
  ],
  5: [ // Sexta
    "Sexta também é dia de resultado. Não desista! 🎯",
    "Sextou com treino concluído e sensação de dever cumprido! 🔥",
    "Termine a semana com o orgulho de quem não pulou o treino! 💪"
  ],
  6: [ // Sábado
    "Fim de semana ativo! Mais forte que ontem. 🏋️‍♂️",
    "Sábado de energia boa e treino de alta performance! ⚡",
    "Treinar no sábado é provar a si mesmo quem está no controle! 🎯"
  ]
};

const GENERAL_QUOTES: string[] = [
  "Hoje é dia de ficar mais forte.",
  "Um treino de cada vez.",
  "Constância constrói resultados.",
  "Você só precisa começar.",
  "Mais forte que ontem.",
  "Seu treino. Seu ritmo. Sua evolução.",
  "Vamos fazer esse treino valer a pena.",
  "Cada repetição conta.",
  "Seu corpo aguenta quase tudo. É a sua mente que você precisa convencer.",
  "O segredo do resultado é nunca faltar com você mesmo.",
  "A disciplina de hoje é o resultado e a saúde de amanhã.",
  "Foco no movimento, consciência na execução e carga no controle."
];

export function getRandomMotivationalQuote(): string {
  const day = new Date().getDay();
  const dayQuotes = WEEKDAY_QUOTES[day] || [];
  // 60% chance de frase específica do dia da semana, 40% frase geral
  const useDayQuote = dayQuotes.length > 0 && Math.random() < 0.6;
  const pool = useDayQuote ? dayQuotes : GENERAL_QUOTES;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
