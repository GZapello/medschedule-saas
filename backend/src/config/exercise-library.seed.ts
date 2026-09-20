export interface SeedExercise {
  id: string;
  name: string;
  muscle_group: string;
  secondary_muscles: string[];
  body_region: string;
  equipment: string;
  category: string;
  execution_type: string;
  mechanics: string;
  level: string;
  instructions: string;
  technical_notes?: string;
  photo_url?: string;
  exercise_file_id?: string;
}

export const DEFAULT_EXERCISE_LIBRARY: SeedExercise[] = [
  // ==========================================
  // 1. PEITORAL (13 variações)
  // ==========================================
  {
    id: 'ex-supino-reto-barra',
    name: 'Supino Reto com Barra',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Tríceps', 'Ombros (Deltoide Anterior)'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Deitado no banco plano com escápulas aduzidas e pés firmes no solo, desça a barra de forma controlada até o terço médio do esterno e empurre estendendo os cotovelos sem perder o arco dorsal seguro.',
    technical_notes: 'Mantenha punhos neutros e cotovelos alinhados a aproximadamente 45-70 graus em relação ao tronco, evitando hiperextensão articular no topo.'
  },
  {
    id: 'ex-supino-reto-halteres',
    name: 'Supino Reto com Halteres',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Tríceps', 'Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Deitado no banco plano com halteres acima do peito, desça os pesos controladamente aumentando a amplitude de alongamento do peitoral e empurre convergindo levemente no topo.',
    technical_notes: 'Maior liberdade articular para os ombros e punhos em relação à barra rígida.'
  },
  {
    id: 'ex-supino-inclinado-barra',
    name: 'Supino Inclinado com Barra',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Ombros (Deltoide Anterior)', 'Tríceps'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Em banco inclinado a 30-45 graus, desça a barra até a região subclavicular/superior do peito e empurre mantendo peito estufado.',
    technical_notes: 'Evite inclinações superiores a 45 graus para não transferir a sobrecarga excessiva aos deltoides.'
  },
  {
    id: 'ex-supino-inclinado-halteres',
    name: 'Supino Inclinado com Halteres',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Ombros', 'Tríceps'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Banco regulado a 30 graus, realize o movimento de descida com rotação neutra-pronada e subida focando no feixe clavicular do peitoral maior.',
    technical_notes: 'Foque na descida excêntrica lenta (2 a 3 segundos).'
  },
  {
    id: 'ex-supino-declinado-barra',
    name: 'Supino Declinado com Barra',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Tríceps', 'Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Com os pés travados no banco declinado a 15-30 graus, desça a barra até a porção inferior do peitoral e empurre com força.',
    technical_notes: 'Excelente ativação do feixe esternocostal inferior com menor estresse no manguito rotador.'
  },
  {
    id: 'ex-crucifixo-reto',
    name: 'Crucifixo Reto com Halteres',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Deitado no banco plano, abra os braços mantendo cotovelos semi-flexionados em ângulo fixo até sentir o alongamento máximo do peitoral e feche abraçando o ar.',
    technical_notes: 'Não flexione os cotovelos durante o movimento; a articulação deve permanecer estática.'
  },
  {
    id: 'ex-crucifixo-inclinado',
    name: 'Crucifixo Inclinado com Halteres',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Em banco inclinado a 30 graus, abra os braços com cotovelos em semi-flexão focando na porção superior do peitoral.',
    technical_notes: 'Controle a descida para proteger a cápsula articular anterior do ombro.'
  },
  {
    id: 'ex-peck-deck-voador',
    name: 'Voador / Peck Deck na Máquina',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Ajuste o assento para que as manoplas fiquem na linha média do peitoral. Aduza os braços até quase encostar e retorne controlando a tensão contínua.',
    technical_notes: 'Mantenha escápulas retraídas contra o encosto durante todo o arco do movimento.'
  },
  {
    id: 'ex-crossover-alta',
    name: 'Crossover na Polia Alta',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Ombros', 'Tríceps'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'intermediario',
    instructions: 'Com o tronco levemente inclinado à frente e cabos no ponto mais alto, puxe as manoplas para frente e para baixo com pico de contração de 1 segundo.',
    technical_notes: 'Foco na porção esternocostal inferior e adução horizontal do úmero.'
  },
  {
    id: 'ex-crossover-media',
    name: 'Crossover na Polia Média',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'intermediario',
    instructions: 'Com polias ajustadas na altura do peito, realize a adução horizontal dos braços mantendo tensão constante.',
    technical_notes: 'Ideal para hipertrofia com curva de resistência constante em toda a amplitude.'
  },
  {
    id: 'ex-crossover-baixa',
    name: 'Crossover na Polia Baixa',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Ombros (Deltoide Anterior)'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'intermediario',
    instructions: 'Com as polias ajustadas embaixo, puxe as manoplas de baixo para cima e para dentro até a linha dos olhos.',
    technical_notes: 'Foco no feixe clavicular (superior) do peitoral e serrátil anterior.'
  },
  {
    id: 'ex-flexao-solo',
    name: 'Flexão de Braços no Solo (Push-up)',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Tríceps', 'Ombros', 'Abdômen/Core'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'iniciante',
    instructions: 'Mãos ligeiramente mais largas que os ombros, corpo em linha reta e abdômen travado. Desça até o peito quase tocar o chão e empurre com força.',
    technical_notes: 'Mantenha a pelve neutra evitando hiperlordose durante a subida.'
  },
  {
    id: 'ex-paralelas-peito',
    name: 'Mergulho nas Barras Paralelas (Foco Peitoral)',
    muscle_group: 'Peitoral',
    secondary_muscles: ['Tríceps', 'Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'avancado',
    instructions: 'Incline o tronco cerca de 30 graus para frente, afaste ligeiramente os cotovelos e desça até 90 graus de flexão de cotovelos, subindo focado no peitoral.',
    technical_notes: 'A inclinação do tronco direciona a sobrecarga do tríceps para o peitoral.'
  },

  // ==========================================
  // 2. COSTAS (12 variações)
  // ==========================================
  {
    id: 'ex-puxada-frontal-aberta',
    name: 'Puxada Frontal com Pegada Aberta no Pulley',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Antebraços', 'Trapézio'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Sentado com coxas firmes no apoio, puxe a barra em direção à fúrcula clavicular deprimindo e aduzindo as escápulas.',
    technical_notes: 'Evite jogar o tronco exageradamente para trás; mantenha a coluna alinhada.'
  },
  {
    id: 'ex-puxada-supinada',
    name: 'Puxada Frontal com Pegada Supinada',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Braquial'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Pegada invertida (palmas voltadas para você) na largura dos ombros, puxe a barra rente ao corpo focando no grande dorsal inferior.',
    technical_notes: 'Excelente relação de força e recrutamento sinérgico do bíceps.'
  },
  {
    id: 'ex-puxada-triangulo',
    name: 'Puxada Frontal com Triângulo (Pegada Neutra)',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Braquiorradial'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Com o acessório triângulo preso na polia alta, puxe até o peito mantendo os cotovelos apontando para o chão.',
    technical_notes: 'Pegada neutra poupa os punhos e permite excelente amplitude excêntrica.'
  },
  {
    id: 'ex-remada-curvada-barra',
    name: 'Remada Curvada com Barra Pronada',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Lombar', 'Posteriores de coxa'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Tronco inclinado a 45 graus com joelhos semi-flexionados e coluna lombar selada. Puxe a barra em direção ao umbigo aproximando as escápulas.',
    technical_notes: 'Mantenha o core rígido para sustentação da postura durante toda a série.'
  },
  {
    id: 'ex-remada-curvada-supinada',
    name: 'Remada Curvada com Barra Supinada (Yates Row)',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Grande Dorsal'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Pegada supinada na largura dos ombros, incline o tronco e puxe a barra rente às coxas até o abdômen.',
    technical_notes: 'Maior ênfase no feixe inferior do grande dorsal.'
  },
  {
    id: 'ex-remada-serrote-halteres',
    name: 'Remada Unilateral com Halter (Serrote)',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Deltoide Posterior'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Apoie um joelho e mão no banco plano, mantenha o tronco paralelo ao chão. Puxe o halter trazendo o cotovelo em direção ao quadril.',
    technical_notes: 'Não faça rotação do tronco; o movimento deve ser exclusivo da articulação do ombro e escápula.'
  },
  {
    id: 'ex-remada-baixa-triangulo',
    name: 'Remada Baixa na Polia com Triângulo',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Trapézio Médio/Inferior'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Sentado com joelhos levemente destravados, inicie o movimento pela retração escapular e puxe o triângulo até o abdômen.',
    technical_notes: 'Evite oscilar o tronco para frente e para trás para não roubar impulso.'
  },
  {
    id: 'ex-remada-cavalinho',
    name: 'Remada Cavalinho (Barra T)',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Trapézio', 'Lombar'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Pés apoiados firmes, tronco inclinado e coluna reta. Puxe o suporte com anilhas até encostar no peitoral/abdômen.',
    technical_notes: 'Construção maciça de densidade para a região dorsal e romboides.'
  },
  {
    id: 'ex-remada-articulada',
    name: 'Remada Máquina Articulada',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Braquial'],
    body_region: 'Membros Superiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Com o peito apoiado na almofada, ajuste a altura do assento e puxe as manoplas simultânea ou alternadamente.',
    technical_notes: 'O apoio torácico anula a sobrecarga na lombar, permitindo isolamento seguro do dorsal.'
  },
  {
    id: 'ex-pulldown-corda',
    name: 'Pulldown na Polia Alta com Corda / Barra',
    muscle_group: 'Costas',
    secondary_muscles: ['Tríceps (Cabeça Longa)', 'Serrátil'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Em pé com tronco inclinado 30 graus e braços quase estendidos, puxe a barra ou corda em arco até encostar nas coxas.',
    technical_notes: 'Excelente isolamento do grande dorsal sem fadiga prematura do bíceps.'
  },
  {
    id: 'ex-barra-fixa-pronada',
    name: 'Barra Fixa (Pull-up) Pegada Pronada',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps', 'Antebraços', 'Abdômen/Core'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'avancado',
    instructions: 'Suspenso na barra com pegada pronada aberta, puxe o corpo para cima até que o queixo ultrapasse a barra.',
    technical_notes: 'Controle a descida excêntrica sem despencar para proteger a articulação glenoumeral.'
  },
  {
    id: 'ex-barra-fixa-supinada',
    name: 'Barra Fixa (Chin-up) Pegada Supinada',
    muscle_group: 'Costas',
    secondary_muscles: ['Bíceps (Braquial)', 'Antebraços'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'intermediario',
    instructions: 'Suspenso na barra com pegada supinada na largura dos ombros, puxe o peito em direção à barra.',
    technical_notes: 'Combina alto estímulo no grande dorsal e na hipertrofia dos flexores de cotovelo.'
  },

  // ==========================================
  // 3. OMBROS (12 variações)
  // ==========================================
  {
    id: 'ex-desenvolvimento-halteres',
    name: 'Desenvolvimento com Halteres Sentado',
    muscle_group: 'Ombros',
    secondary_muscles: ['Tríceps', 'Trapézio'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Sentado em banco com encosto a 80-85 graus, empurre os halteres para cima até a extensão controlada dos cotovelos.',
    technical_notes: 'Mantenha os cotovelos ligeiramente à frente do plano coronal para proteger o manguito.'
  },
  {
    id: 'ex-desenvolvimento-militar',
    name: 'Desenvolvimento Militar com Barra em Pé (Overhead Press)',
    muscle_group: 'Ombros',
    secondary_muscles: ['Tríceps', 'Abdômen/Core', 'Glúteos'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'avancado',
    instructions: 'Em pé com pés na largura dos ombros e glúteos contraídos, empurre a barra da clavícula até acima da cabeça com bloqueio articular controlado.',
    technical_notes: 'Encaixe a cabeça ligeiramente à frente no topo do movimento.'
  },
  {
    id: 'ex-desenvolvimento-smith',
    name: 'Desenvolvimento no Smith Machine',
    muscle_group: 'Ombros',
    secondary_muscles: ['Tríceps'],
    body_region: 'Membros Superiores',
    equipment: 'Smith',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Sentado com a barra guiada descendo à frente do queixo até a altura das orelhas, empurrando verticalmente.',
    technical_notes: 'Permite cargas mais elevadas com segurança devido aos trilhos fixos.'
  },
  {
    id: 'ex-desenvolvimento-articulado',
    name: 'Desenvolvimento na Máquina Articulada',
    muscle_group: 'Ombros',
    secondary_muscles: ['Tríceps'],
    body_region: 'Membros Superiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Ajuste a altura do banco para que as manoplas fiquem na linha das orelhas. Empurre estendendo os braços.',
    technical_notes: 'Ótima opção para iniciantes ou séries de exaustão/drop-set.'
  },
  {
    id: 'ex-elevacao-lateral-halteres',
    name: 'Elevação Lateral com Halteres',
    muscle_group: 'Ombros',
    secondary_muscles: ['Trapézio Superior'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Em pé ou sentado, eleve os braços lateralmente no plano escapular até a linha dos ombros com cotovelos levemente flexionados.',
    technical_notes: 'Não gire os polegares para baixo (pour the water); mantenha punho neutro para evitar impacto subacromial.'
  },
  {
    id: 'ex-elevacao-lateral-polia',
    name: 'Elevação Lateral Unilateral na Polia',
    muscle_group: 'Ombros',
    secondary_muscles: ['Trapézio'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'cabo/polia',
    level: 'intermediario',
    instructions: 'Posicione a polia baixa atrás ou à frente do corpo, eleve o braço lateralmente até 90 graus com tensão desde o início.',
    technical_notes: 'A polia garante torque no deltoide lateral logo no ponto inicial do movimento.'
  },
  {
    id: 'ex-elevacao-lateral-inclinado',
    name: 'Elevação Lateral no Banco 45°',
    muscle_group: 'Ombros',
    secondary_muscles: ['Deltoide Lateral'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Deitado de lado no banco inclinado a 45 graus, eleve o halter lateralmente até a linha do ombro.',
    technical_notes: 'Muda a curva de resistência do halter, gerando pico de tensão nos primeiros graus de abdução.'
  },
  {
    id: 'ex-elevacao-frontal-halteres',
    name: 'Elevação Frontal Alternada com Halteres',
    muscle_group: 'Ombros',
    secondary_muscles: ['Peitoral Superior'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Em pé com halteres nas coxas, eleve um braço à frente até a linha dos olhos com subida controlada.',
    technical_notes: 'Foco exclusivo na porção anterior do deltoide.'
  },
  {
    id: 'ex-crucifixo-inverso-halteres',
    name: 'Crucifixo Inverso com Halteres (Deltoide Posterior)',
    muscle_group: 'Ombros',
    secondary_muscles: ['Romboides', 'Trapézio'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Tronco inclinado paralelo ao solo ou apoiado em banco inclinado, eleve os braços lateralmente para trás focando na parte posterior dos ombros.',
    technical_notes: 'Não una as escápulas precocemente; inicie o movimento pelo deltoide posterior.'
  },
  {
    id: 'ex-crucifixo-inverso-peckdeck',
    name: 'Crucifixo Inverso no Peck Deck / Voador Inverso',
    muscle_group: 'Ombros',
    secondary_muscles: ['Romboides', 'Trapézio'],
    body_region: 'Membros Superiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Sentado de frente para o encosto da máquina, segure as manoplas na altura dos ombros e empurre para trás.',
    technical_notes: 'Excelente estabilidade e isolamento do deltoide posterior.'
  },
  {
    id: 'ex-face-pull',
    name: 'Face Pull na Polia Alta com Corda',
    muscle_group: 'Ombros',
    secondary_muscles: ['Manguito Rotador', 'Trapézio', 'Deltoide Posterior'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Puxe a corda em direção aos olhos e orelhas realizando rotação externa com os polegares apontando para trás.',
    technical_notes: 'Exercício fundamental para saúde postural dos ombros e fortalecimento do infraespinhal e redondo menor.'
  },
  {
    id: 'ex-remada-alta-barra',
    name: 'Remada Alta com Barra W',
    muscle_group: 'Ombros',
    secondary_muscles: ['Trapézio Superior', 'Bíceps'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Pegada na largura dos ombros, puxe a barra verticalmente até a altura do peito conduzindo pelos cotovelos.',
    technical_notes: 'Não utilize pegada excessivamente fechada para evitar pinçamento subacromial.'
  },

  // ==========================================
  // 4. BÍCEPS (8 variações)
  // ==========================================
  {
    id: 'ex-rosca-direta-barra',
    name: 'Rosca Direta com Barra Reta / W',
    muscle_group: 'Bíceps',
    secondary_muscles: ['Antebraços (Braquiorradial)'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Em pé com pés firmes e cotovelos alinhados ao lado do tronco, flexione os cotovelos elevando a barra sem balançar o quadril.',
    technical_notes: 'A barra W reduz a tensão torsional sobre os punhos em relação à barra reta.'
  },
  {
    id: 'ex-rosca-alternada-halteres',
    name: 'Rosca Alternada com Halteres com Supinação',
    muscle_group: 'Bíceps',
    secondary_muscles: ['Antebraços'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Inicie com pegada neutra e realize a supinação (girar a palma da mão para cima) durante a flexão do braço.',
    technical_notes: 'O bíceps braquial é o mais potente supinador do antebraço; potencialize essa rotação no topo.'
  },
  {
    id: 'ex-rosca-martelo-halteres',
    name: 'Rosca Martelo com Halteres',
    muscle_group: 'Bíceps',
    secondary_muscles: ['Braquial', 'Braquiorradial (Antebraço)'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Mantenha os polegares apontados para cima (pegada neutra) durante toda a flexão e extensão do cotovelo.',
    technical_notes: 'Excelente para desenvolvimento do músculo braquial, dando espessura ao braço.'
  },
  {
    id: 'ex-rosca-martelo-corda',
    name: 'Rosca Martelo na Polia Baixa com Corda',
    muscle_group: 'Bíceps',
    secondary_muscles: ['Braquial', 'Antebraços'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Com a corda acoplada na polia baixa, flexione os cotovelos mantendo tensão constante.',
    technical_notes: 'Tensão ininterrupta mesmo no ponto de flexão máxima.'
  },
  {
    id: 'ex-rosca-scott-barra',
    name: 'Rosca Scott com Barra W',
    muscle_group: 'Bíceps',
    secondary_muscles: ['Antebraços'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Braços completamente apoiados no banco Scott, flexione a barra até 90 graus e desça controlando.',
    technical_notes: 'Evite estender os cotovelos a 100% de forma brusca embaixo para proteger o tendão distal do bíceps.'
  },
  {
    id: 'ex-rosca-concentrada',
    name: 'Rosca Concentrada Unilateral com Halter',
    muscle_group: 'Bíceps',
    secondary_muscles: ['Braquial'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Sentado com o cotovelo apoiado na parte interna da coxa, flexione o halter focando no pico de contração.',
    technical_notes: 'Isolamento estrito sem qualquer auxílio de impulso corporal.'
  },
  {
    id: 'ex-rosca-inclinada-45',
    name: 'Rosca Inclinada no Banco 45° com Halteres',
    muscle_group: 'Bíceps',
    secondary_muscles: ['Cabeça Longa do Bíceps'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Deitado em banco a 45 graus com braços pendurados para trás, flexione os halteres.',
    technical_notes: 'Alongamento passivo potente da cabeça longa do bíceps antes do início da contração concêntrica.'
  },
  {
    id: 'ex-rosca-spider',
    name: 'Rosca Spider no Banco Inclinado com Barra W',
    muscle_group: 'Bíceps',
    secondary_muscles: ['Braquial'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Peito apoiado no lado reto do banco inclinado, braços verticais para o chão, flexione a barra para cima.',
    technical_notes: 'Tensão máxima no topo do movimento.'
  },

  // ==========================================
  // 5. TRÍCEPS (7 variações)
  // ==========================================
  {
    id: 'ex-triceps-corda',
    name: 'Tríceps na Polia com Corda',
    muscle_group: 'Tríceps',
    secondary_muscles: ['Antebraços'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Cotovelos firmes ao lado das costelas, empurre a corda para baixo afastando as pontas no final da extensão.',
    technical_notes: 'Foco na cabeça lateral e medial do tríceps.'
  },
  {
    id: 'ex-triceps-pulley-barra',
    name: 'Tríceps na Polia com Barra Reta / V',
    muscle_group: 'Tríceps',
    secondary_muscles: ['Antebraços'],
    body_region: 'Membros Superiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Com pegada pronada na barra, empurre até a extensão completa dos cotovelos sem movimentar os ombros.',
    technical_notes: 'Permite utilização de cargas mais elevadas com estabilidade.'
  },
  {
    id: 'ex-triceps-testa-barra',
    name: 'Tríceps Testa Deitado com Barra W',
    muscle_group: 'Tríceps',
    secondary_muscles: ['Tríceps (Cabeça Longa)'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Deitado no banco plano, desça a barra W em direção à testa ou ligeiramente atrás da cabeça e empurre estendendo.',
    technical_notes: 'Descer ligeiramente atrás do topo da cabeça mantém a cabeça longa do tríceps sob tensão contínua.'
  },
  {
    id: 'ex-triceps-frances-halter',
    name: 'Tríceps Francês Sentado com Halter',
    muscle_group: 'Tríceps',
    secondary_muscles: ['Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Sentado segurando um halter pesado com as duas mãos acima da cabeça, flexione os cotovelos para trás e empurre para cima.',
    technical_notes: 'Com o úmero em flexão máxima, a cabeça longa do tríceps trabalha em sua amplitude máxima de alongamento.'
  },
  {
    id: 'ex-triceps-coice-halteres',
    name: 'Tríceps Coice (Kickback) com Halteres',
    muscle_group: 'Tríceps',
    secondary_muscles: ['Deltoide Posterior'],
    body_region: 'Membros Superiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Tronco inclinado, cotovelo erguido na linha do tronco, estenda o antebraço para trás segurando 1 segundo no pico.',
    technical_notes: 'Não abaixe o cotovelo durante a execução.'
  },
  {
    id: 'ex-triceps-banco',
    name: 'Mergulho no Banco (Tríceps Dips)',
    muscle_group: 'Tríceps',
    secondary_muscles: ['Peitoral', 'Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'iniciante',
    instructions: 'Mãos apoiadas na borda do banco e pernas estendidas à frente, desça o quadril próximo ao banco e empurre com os braços.',
    technical_notes: 'Mantenha as costas próximas ao banco para evitar estresse excessivo na cápsula anterior do ombro.'
  },
  {
    id: 'ex-flexao-diamante',
    name: 'Flexão Fechada no Solo (Diamante)',
    muscle_group: 'Tríceps',
    secondary_muscles: ['Peitoral', 'Ombros', 'Abdômen/Core'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'intermediario',
    instructions: 'Posição de flexão com polegares e indicadores unidos formando um triângulo/diamante, desça o peito e empurre.',
    technical_notes: 'Grande ativação mecânica do tríceps em cadeia cinética fechada.'
  },

  // ==========================================
  // 6. ANTEBRAÇOS (3 variações)
  // ==========================================
  {
    id: 'ex-rosca-punho-barra',
    name: 'Rosca Punho (Flexão de Punho) com Barra',
    muscle_group: 'Antebraços',
    secondary_muscles: ['Flexores dos Dedos'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Antebraços apoiados sobre as coxas ou banco com palmas para cima, flexione os punhos para cima de forma controlada.',
    technical_notes: 'Fortalecimento dos flexores do carpo e pegada.'
  },
  {
    id: 'ex-rosca-punho-invertida',
    name: 'Rosca Punho Inversa (Extensão de Punho) com Barra',
    muscle_group: 'Antebraços',
    secondary_muscles: ['Extensores do Carpo'],
    body_region: 'Membros Superiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Antebraços apoiados com palmas para baixo, estenda os punhos elevando a barra.',
    technical_notes: 'Prevenção de epicondilite lateral e equilíbrio muscular do antebraço.'
  },
  {
    id: 'ex-farmers-walk',
    name: 'Caminhada do Fazendeiro (Farmer\'s Walk)',
    muscle_group: 'Antebraços',
    secondary_muscles: ['Trapézio', 'Abdômen/Core', 'Glúteos'],
    body_region: 'Corpo Inteiro',
    equipment: 'Halteres',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'composto',
    level: 'intermediario',
    instructions: 'Segurando dois halteres pesados ao lado do corpo, caminhe mantendo postura ereta e abdômen firme.',
    technical_notes: 'Excelente para força isométrica de preensão manual e estabilidade de core.'
  },

  // ==========================================
  // 7. ABDÔMEN / CORE (9 variações)
  // ==========================================
  {
    id: 'ex-crunch-solo',
    name: 'Abdominal Tradicional (Crunch) no Solo',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Reto Abdominal'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'iniciante',
    instructions: 'Deitado com joelhos flexionados, eleve as escápulas do chão flexionando a coluna torácica e soltando o ar.',
    technical_notes: 'Não puxe a cabeça com as mãos; o esforço deve ser de aproximação das costelas ao quadril.'
  },
  {
    id: 'ex-abdominal-infra-solo',
    name: 'Abdominal Infra no Solo com Elevação de Pernas',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Iliopsoas', 'Reto Femoral'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'iniciante',
    instructions: 'Deitado com pernas estendidas, eleve as pernas e finalize tirando levemente o quadril do solo.',
    technical_notes: 'Mantenha a lombar apoiada no solo ao descer as pernas.'
  },
  {
    id: 'ex-abdominal-infra-barra',
    name: 'Abdominal Infra Pendurado na Barra Fixa (Hanging Leg Raise)',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Flexores de Quadril', 'Antebraços'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'avancado',
    instructions: 'Suspenso na barra, eleve os joelhos ou pernas retas até a linha do quadril realizando retroversão pélvica.',
    technical_notes: 'Não balance o corpo; inicie a subida a partir do core.'
  },
  {
    id: 'ex-abdominal-obliquo-solo',
    name: 'Abdominal Oblíquo Cruzado no Solo',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Oblíquos Interno e Externo'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'unilateral',
    mechanics: 'peso corporal',
    level: 'iniciante',
    instructions: 'Com uma perna cruzada sobre o joelho oposto, eleve o tronco direcionando o cotovelo ao joelho contrário.',
    technical_notes: 'Foco na rotação do tronco sem puxar a cervical.'
  },
  {
    id: 'ex-prancha-isometrica',
    name: 'Prancha Ventral Isométrica no Solo',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Transverso do Abdômen', 'Glúteos', 'Lombar'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'isométrico',
    level: 'iniciante',
    instructions: 'Apoie antebraços e pontas dos pés no solo, mantendo linha reta dos tornozelos aos ombros com abdômen contraído.',
    technical_notes: 'Não deixe o quadril ceder ou subir em excesso.'
  },
  {
    id: 'ex-prancha-lateral',
    name: 'Prancha Lateral Isométrica',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Quadrado Lombar', 'Glúteo Médio'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'unilateral',
    mechanics: 'isométrico',
    level: 'iniciante',
    instructions: 'De lado com apoio no antebraço e lateral do pé, eleve o quadril mantendo alinhamento de coluna.',
    technical_notes: 'Fundamental para estabilização da coluna lombar no plano frontal.'
  },
  {
    id: 'ex-roda-abdominal',
    name: 'Abdominal com Roda / Rolinho (Ab Wheel Rollout)',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Grande Dorsal', 'Tríceps', 'Ombros'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'avancado',
    instructions: 'De joelhos, role a roda para frente estendendo o corpo e retorne contraindo o abdômen.',
    technical_notes: 'Não permita extensão lombar excessiva durante o retorno.'
  },
  {
    id: 'ex-abdominal-polia-corda',
    name: 'Abdominal na Polia Alta com Corda (Cable Crunch)',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Reto Abdominal'],
    body_region: 'Tronco / Core',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'cabo/polia',
    level: 'intermediario',
    instructions: 'Ajoelhado de frente para a polia com a corda atrás da cabeça, flexione a coluna levando os cotovelos aos joelhos.',
    technical_notes: 'Mantenha o quadril fixo; o movimento deve vir da coluna vertebral.'
  },
  {
    id: 'ex-dead-bug',
    name: 'Deadbug (Inseto Morto) para Ativação de Core',
    muscle_group: 'Abdômen/Core',
    secondary_muscles: ['Transverso do Abdômen', 'Psoas'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'iniciante',
    instructions: 'Deitado de barriga para cima, estenda braço e perna opostos mantendo a lombar colada ao solo.',
    technical_notes: 'Excelente reeducação proprioceptiva do transverso abdominal.'
  },

  // ==========================================
  // 8. LOMBAR (3 variações)
  // ==========================================
  {
    id: 'ex-hiperextensao-lombar',
    name: 'Hiperextensão Lombar no Banco Romano 45°',
    muscle_group: 'Lombar',
    secondary_muscles: ['Glúteos', 'Posteriores de coxa'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'iniciante',
    instructions: 'Com a crista ilíaca apoiada na almofada, flexione o tronco para baixo e estenda até alinhar com as pernas.',
    technical_notes: 'Não hiperestenda excessivamente a coluna no topo.'
  },
  {
    id: 'ex-bom-dia-barra',
    name: 'Bom Dia (Good Morning) com Barra',
    muscle_group: 'Lombar',
    secondary_muscles: ['Posteriores de coxa', 'Glúteos'],
    body_region: 'Tronco / Core',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'avancado',
    instructions: 'Barra no trapézio, flexione o quadril para trás com joelhos destravados e tronco reto, depois retorne estendendo.',
    technical_notes: 'Carga leve a moderada mantendo curvatura neutra em toda a descida.'
  },
  {
    id: 'ex-superman-solo',
    name: 'Superman Isométrico no Solo',
    muscle_group: 'Lombar',
    secondary_muscles: ['Glúteos', 'Deltoides'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'isométrico',
    level: 'iniciante',
    instructions: 'Deitado de barriga para baixo, eleve simultaneamente braços e pernas do chão segurando a posição.',
    technical_notes: 'Fortalecimento seguro da cadeia posterior sem cargas compressivas axiais.'
  },

  // ==========================================
  // 9. QUADRÍCEPS (10 variações)
  // ==========================================
  {
    id: 'ex-agachamento-livre-barra',
    name: 'Agachamento Livre com Barra Costas (Back Squat)',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Glúteos', 'Lombar', 'Adutores'],
    body_region: 'Membros Inferiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Barra no trapézio, pés na largura dos ombros apontando levemente para fora. Agache descendo o quadril abaixo dos joelhos e suba com força.',
    technical_notes: 'Mantenha os joelhos alinhados com a ponta dos pés e calcanhares colados no chão.'
  },
  {
    id: 'ex-agachamento-frontal-barra',
    name: 'Agachamento Frontal com Barra (Front Squat)',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Abdômen/Core', 'Glúteos'],
    body_region: 'Membros Inferiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'avancado',
    instructions: 'Barra apoiada na clavícula/deltoide anterior com cotovelos altos, agache mantendo o tronco estritamente vertical.',
    technical_notes: 'Maior ênfase no reto femoral e vastos com menor estresse de cisalhamento na coluna lombar.'
  },
  {
    id: 'ex-agachamento-smith',
    name: 'Agachamento no Smith Machine',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Glúteos'],
    body_region: 'Membros Inferiores',
    equipment: 'Smith',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Pés ligeiramente à frente da barra guiada, desça até 90 graus de flexão mantendo a postura.',
    technical_notes: 'Permite isolamento de quadríceps com segurança contra falhas.'
  },
  {
    id: 'ex-leg-press-45',
    name: 'Leg Press 45°',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Glúteos', 'Adutores'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Pés no meio da plataforma na largura dos ombros, empurre a plataforma e desça em amplitude completa sem descolar o quadril do banco.',
    technical_notes: 'Nunca bloqueie a articulação dos joelhos (evite hiperextensão) no topo.'
  },
  {
    id: 'ex-leg-press-horizontal',
    name: 'Leg Press Horizontal',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Glúteos'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Sentado com as costas firmes no encosto, empurre o carrinho estendendo os joelhos com controle.',
    technical_notes: 'Excelente para idosos, reabilitação ou iniciantes.'
  },
  {
    id: 'ex-hack-machine',
    name: 'Agachamento Hack Machine',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Glúteos'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'intermediario',
    instructions: 'Costas e ombros apoiados nos suportes do carrinho, agache com amplitude máxima e empurre pelos calcanhares.',
    technical_notes: 'Foco tremendo no vasto lateral e reto femoral.'
  },
  {
    id: 'ex-cadeira-extensora',
    name: 'Cadeira Extensora',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Reto Femoral'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Ajuste o eixo da máquina com a linha do joelho. Estenda os joelhos até a contração máxima com pausa de 1s no topo.',
    technical_notes: 'Único exercício que isola o quadríceps sem participação de glúteos ou isquiotibiais.'
  },
  {
    id: 'ex-agachamento-bulgaro',
    name: 'Agachamento Búlgaro com Halteres',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Glúteos', 'Posteriores de coxa'],
    body_region: 'Membros Inferiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Um pé apoiado atrás no banco e a outra perna à frente. Desça até o joelho de trás quase tocar o chão e suba.',
    technical_notes: 'Excelente correção de assimetrias de força e mobilidade entre os membros.'
  },
  {
    id: 'ex-avanco-passada',
    name: 'Avanço / Passada Caminhando com Halteres',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Glúteos', 'Posteriores de coxa'],
    body_region: 'Membros Inferiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Dê passos longos à frente flexionando ambos os joelhos a 90 graus de forma alternada.',
    technical_notes: 'Mantenha o tronco estável sem oscilar para os lados.'
  },
  {
    id: 'ex-agachamento-sissy',
    name: 'Agachamento Sissy (Sissy Squat) no Banco',
    muscle_group: 'Quadríceps',
    secondary_muscles: ['Reto Femoral'],
    body_region: 'Membros Inferiores',
    equipment: 'Peso Corporal',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'avancado',
    instructions: 'Com os tornozelos travados no banco sissy, incline o tronco para trás flexionando os joelhos e empurre estendendo.',
    technical_notes: 'Intensidade extrema no reto femoral com alongamento profundo.'
  },

  // ==========================================
  // 10. POSTERIORES DE COXA (7 variações)
  // ==========================================
  {
    id: 'ex-mesa-flexora',
    name: 'Mesa Flexora Deitada',
    muscle_group: 'Posteriores de coxa',
    secondary_muscles: ['Panturrilhas (Gastrocnêmio)'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Deitado de bruços com o rolo acima dos calcanhares, flexione os joelhos aproximando os calcanhares dos glúteos.',
    technical_notes: 'Não eleve o quadril do banco durante a fase concêntrica.'
  },
  {
    id: 'ex-cadeira-flexora',
    name: 'Cadeira Flexora Sentada',
    muscle_group: 'Posteriores de coxa',
    secondary_muscles: ['Gastrocnêmio'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Sentado com a trava acima das coxas e rolo nos calcanhares, flexione os joelhos empurrando para baixo.',
    technical_notes: 'Com o quadril a 90 graus de flexão, os isquiotibiais já iniciam sob maior alongamento passivo.'
  },
  {
    id: 'ex-flexora-em-pe',
    name: 'Flexora em Pé Unilateral na Máquina / Cabo',
    muscle_group: 'Posteriores de coxa',
    secondary_muscles: ['Glúteos'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Apoiado de frente para a máquina, flexione um joelho levando o calcanhar ao glúteo.',
    technical_notes: 'Ideal para corrigir assimetrias de força muscular nos isquiotibiais.'
  },
  {
    id: 'ex-stiff-barra',
    name: 'Stiff com Barra Reta',
    muscle_group: 'Posteriores de coxa',
    secondary_muscles: ['Glúteos', 'Lombar'],
    body_region: 'Membros Inferiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Pés na largura do quadril, joelhos semi-flexionados em ângulo fixo. Empurre o quadril para trás descendo a barra rente às pernas.',
    technical_notes: 'Mantenha a coluna vertebral neutra; o movimento é uma dobradiça de quadril (hip hinge).'
  },
  {
    id: 'ex-stiff-halteres',
    name: 'Stiff com Halteres',
    muscle_group: 'Posteriores de coxa',
    secondary_muscles: ['Glúteos', 'Lombar'],
    body_region: 'Membros Inferiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Mesmo princípio do stiff com barra, permitindo trajetórias mais naturais ao lado das pernas.',
    technical_notes: 'Excelente para quem sente desconforto no punho com a barra.'
  },
  {
    id: 'ex-rdl-halteres',
    name: 'Levantamento Terra Romeno (RDL) com Halteres',
    muscle_group: 'Posteriores de coxa',
    secondary_muscles: ['Glúteos', 'Eretores da Espinha'],
    body_region: 'Membros Inferiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Inicie de cima para baixo, flexionando o quadril mantendo as canelas estritamente verticais.',
    technical_notes: 'Foque na desaceleração excêntrica para recrutar fibras em alongamento ativo.'
  },
  {
    id: 'ex-nordic-hamstring',
    name: 'Flexão Nórdica Excêntrica (Nordic Hamstring Curl)',
    muscle_group: 'Posteriores de coxa',
    secondary_muscles: ['Glúteos', 'Abdômen/Core'],
    body_region: 'Membros Inferiores',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'avancado',
    instructions: 'De joelhos com tornozelos travados, desça o corpo para frente controlando a descida apenas com os posteriores de coxa.',
    technical_notes: 'Padrão ouro científico para prevenção de lesões musculares em esportes e sprints.'
  },

  // ==========================================
  // 11. GLÚTEOS (5 variações)
  // ==========================================
  {
    id: 'ex-elevacao-pelvica-barra',
    name: 'Elevação Pélvica com Barra no Banco (Hip Thrust)',
    muscle_group: 'Glúteos',
    secondary_muscles: ['Posteriores de coxa', 'Abdômen/Core'],
    body_region: 'Membros Inferiores',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Escápulas apoiadas no banco, barra sobre o quadril com almofada protetora. Empurre os calcanhares no chão e eleve o quadril até travar no topo com 1s de contração.',
    technical_notes: 'No topo, mantenha queixo apontado para o peito e costelas abaixadas para não hiperextender a lombar.'
  },
  {
    id: 'ex-elevacao-pelvica-unilateral',
    name: 'Elevação Pélvica Unilateral no Solo / Banco',
    muscle_group: 'Glúteos',
    secondary_muscles: ['Posteriores de coxa', 'Core'],
    body_region: 'Membros Inferiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Apoie um pé no solo e a outra perna elevada, empurre o quadril para cima com a perna de apoio.',
    technical_notes: 'Excelente para ativação isolada e nivelamento de força unilateral do glúteo máximo.'
  },
  {
    id: 'ex-cadeira-abdutora',
    name: 'Cadeira Abdutora na Máquina',
    muscle_group: 'Glúteos',
    secondary_muscles: ['Glúteo Médio', 'Glúteo Mínimo', 'Tensor da Fáscia Lata'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Sentado com o tronco ereto ou levemente inclinado à frente, abra as pernas afastando as almofadas.',
    technical_notes: 'Inclinar o tronco para frente aumenta a ativação das fibras superiores do glúteo máximo e médio.'
  },
  {
    id: 'ex-gluteo-cabo-coice',
    name: 'Glúteo Coice na Polia Baixa (Cable Kickback)',
    muscle_group: 'Glúteos',
    secondary_muscles: ['Posteriores de coxa'],
    body_region: 'Membros Inferiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Com tornozeleira acoplada na polia baixa, estenda a perna para trás e ligeiramente para fora em 30 graus.',
    technical_notes: 'A leve rotação externa alinha com as fibras oblíquas do glúteo máximo.'
  },
  {
    id: 'ex-gluteo-caneleira-4-apoios',
    name: 'Glúteo 4 Apoios com Caneleira no Solo',
    muscle_group: 'Glúteos',
    secondary_muscles: ['Posteriores de coxa'],
    body_region: 'Membros Inferiores',
    equipment: 'Peso Corporal',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Em 4 apoios com cotovelos apoiados, eleve o calcanhar em direção ao teto mantendo o joelho a 90 graus.',
    technical_notes: 'Mantenha a pelve alinhada sem girar o quadril para os lados.'
  },

  // ==========================================
  // 12. ADUTORES (3 variações)
  // ==========================================
  {
    id: 'ex-cadeira-adutora',
    name: 'Cadeira Adutora na Máquina',
    muscle_group: 'Adutores',
    secondary_muscles: ['Grácil', 'Pectíneo'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Com as almofadas na parte interna das coxas, feche as pernas até encostar e retorne controlando a abertura.',
    technical_notes: 'Movimento fundamental para estabilidade pélvica e medial do joelho.'
  },
  {
    id: 'ex-aducao-polia-caneleira',
    name: 'Adução de Quadril na Polia Baixa com Caneleira',
    muscle_group: 'Adutores',
    secondary_muscles: ['Grácil'],
    body_region: 'Membros Inferiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'Em pé ao lado da polia com o cabo preso na perna proximal, puxe a perna para dentro cruzando à frente.',
    technical_notes: 'Mantenha o tronco ereto segurando no suporte.'
  },
  {
    id: 'ex-agachamento-sumo',
    name: 'Agachamento Sumô com Halter no Step',
    muscle_group: 'Adutores',
    secondary_muscles: ['Glúteos', 'Quadríceps'],
    body_region: 'Membros Inferiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'intermediario',
    instructions: 'Pés bem afastados apontando para fora em 45 graus, segure o halter entre as pernas e agache profundo.',
    technical_notes: 'Os steps aumentam a amplitude de descida sem bater o halter no chão.'
  },

  // ==========================================
  // 13. ABDUTORES (2 variações)
  // ==========================================
  {
    id: 'ex-abducao-polia-baixa',
    name: 'Abdução de Quadril na Polia Baixa',
    muscle_group: 'Abdutores',
    secondary_muscles: ['Glúteo Médio', 'Tensor da Fáscia Lata'],
    body_region: 'Membros Inferiores',
    equipment: 'Cabo / Polia',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'cabo/polia',
    level: 'iniciante',
    instructions: 'De lado para a polia com o cabo na perna distal, afaste a perna lateralmente com o pé apontando para frente.',
    technical_notes: 'Não gire a ponta do pé para fora para manter a ativação no glúteo médio.'
  },
  {
    id: 'ex-abducao-solo-elastico',
    name: 'Abdução de Quadril no Solo com Mini-Band (Clamshell / Ostra)',
    muscle_group: 'Abdutores',
    secondary_muscles: ['Glúteo Médio', 'Rotadores Externos'],
    body_region: 'Membros Inferiores',
    equipment: 'Elástico',
    category: 'Funcional',
    execution_type: 'unilateral',
    mechanics: 'elástico',
    level: 'iniciante',
    instructions: 'Deitado de lado com joelhos a 90 graus e elástico nas coxas, abra o joelho de cima mantendo pés unidos.',
    technical_notes: 'Exercício chave para estabilidade do joelho contra o valgo dinâmico.'
  },

  // ==========================================
  // 14. PANTURRILHAS (4 variações)
  // ==========================================
  {
    id: 'ex-gemeos-smith',
    name: 'Gêmeos em Pé no Smith Machine sobre Degrau',
    muscle_group: 'Panturrilhas',
    secondary_muscles: ['Gastrocnêmio'],
    body_region: 'Membros Inferiores',
    equipment: 'Smith',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Pontas dos pés sobre o degrau/bloco com barra nos ombros, desça o calcanhar até alongar ao máximo e suba ficando na ponta dos pés.',
    technical_notes: 'Faça uma pausa de 1 segundo embaixo para dissipar a energia elástica do tendão de Aquiles.'
  },
  {
    id: 'ex-gemeos-sentado-soleo',
    name: 'Gêmeos Sentado na Máquina (Foco no Sóleo)',
    muscle_group: 'Panturrilhas',
    secondary_muscles: ['Sóleo'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Sentado com joelhos a 90 graus sob as almofadas, realize a flexão plantar completa.',
    technical_notes: 'Com o joelho flexionado, o gastrocnêmio fica em insuficiência ativa, isolando o músculo sóleo.'
  },
  {
    id: 'ex-panturrilha-legpress',
    name: 'Panturrilha no Leg Press 45°',
    muscle_group: 'Panturrilhas',
    secondary_muscles: ['Gastrocnêmio'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'máquina',
    level: 'iniciante',
    instructions: 'Pontas dos pés na borda inferior da plataforma com joelhos quase estendidos, realize a flexão plantar.',
    technical_notes: 'Mantenha as travas de segurança acionadas para evitar riscos de deslizamento dos pés.'
  },
  {
    id: 'ex-panturrilha-unilateral-halter',
    name: 'Panturrilha Unilateral em Pé com Halter',
    muscle_group: 'Panturrilhas',
    secondary_muscles: ['Gastrocnêmio', 'Sóleo'],
    body_region: 'Membros Inferiores',
    equipment: 'Halteres',
    category: 'Musculação',
    execution_type: 'unilateral',
    mechanics: 'peso livre',
    level: 'iniciante',
    instructions: 'Apoie um pé no degrau segurando um halter do mesmo lado e a outra mão em suporte para equilíbrio.',
    technical_notes: 'Excelente para equalizar força entre as duas panturrilhas.'
  },

  // ==========================================
  // 15. CORPO INTEIRO & COMPOSTOS (4 variações)
  // ==========================================
  {
    id: 'ex-levantamento-terra-convencional',
    name: 'Levantamento Terra Convencional com Barra',
    muscle_group: 'Corpo inteiro',
    secondary_muscles: ['Costas', 'Glúteos', 'Posteriores de coxa', 'Quadríceps', 'Trapézio', 'Antebraços'],
    body_region: 'Corpo Inteiro',
    equipment: 'Barra',
    category: 'Musculação',
    execution_type: 'bilateral',
    mechanics: 'peso livre',
    level: 'avancado',
    instructions: 'Barra sobre o meio dos pés, pegada fora das pernas, peito erguido e escápulas travadas. Puxe a barra do solo estendendo joelhos e quadril simultaneamente.',
    technical_notes: 'A barra deve subir raspando nas canelas e coxas; não arredonde a coluna lombar.'
  },
  {
    id: 'ex-kettlebell-swing',
    name: 'Kettlebell Swing (Balanço de Quadril)',
    muscle_group: 'Corpo inteiro',
    secondary_muscles: ['Glúteos', 'Posteriores de coxa', 'Ombros', 'Abdômen/Core'],
    body_region: 'Corpo Inteiro',
    equipment: 'Kettlebell',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'composto',
    level: 'intermediario',
    instructions: 'Incline o quadril para trás com o kettlebell entre as pernas e use a explosão de extensão do quadril para arremessar o peso até a linha dos ombros.',
    technical_notes: 'O movimento é impulsionado pelo quadril, não pelos braços.'
  },
  {
    id: 'ex-burpee',
    name: 'Burpee Completo com Salto',
    muscle_group: 'Corpo inteiro',
    secondary_muscles: ['Peitoral', 'Pernas', 'Core', 'Cardiorrespiratório'],
    body_region: 'Corpo Inteiro',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'peso corporal',
    level: 'intermediario',
    instructions: 'Do apoio em pé, agache, jogue os pés para trás em prancha, toque o peito no chão, puxe os pés e salte estendendo os braços acima.',
    technical_notes: 'Exercício metabólico de alta demanda cardiorrespiratória e de potência.'
  },
  {
    id: 'ex-thruster-halteres',
    name: 'Thruster (Agachamento + Desenvolvimento) com Halteres',
    muscle_group: 'Corpo inteiro',
    secondary_muscles: ['Quadríceps', 'Glúteos', 'Ombros', 'Tríceps'],
    body_region: 'Corpo Inteiro',
    equipment: 'Halteres',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'composto',
    level: 'intermediario',
    instructions: 'Segure os halteres nos ombros, realize um agachamento completo e utilize o impulso da subida para empurrar os pesos acima da cabeça.',
    technical_notes: 'Transição fluida entre agachamento e desenvolvimento em um único tempo.'
  },

  // ==========================================
  // 16. CARDIORRESPIRATÓRIOS (7 variações)
  // ==========================================
  {
    id: 'ex-esteira-hiit',
    name: 'Corrida / Caminhada Inclinada na Esteira',
    muscle_group: 'Cardiorrespiratórios',
    secondary_muscles: ['Membros Inferiores', 'Sistema Cardiovascular'],
    body_region: 'Corpo Inteiro',
    equipment: 'Máquina',
    category: 'Cardiorrespiratório',
    execution_type: 'bilateral',
    mechanics: 'aeróbico',
    level: 'todos',
    instructions: 'Protocolo contínuo ou intervalado (HIIT) com velocidade e inclinação programadas conforme VO2 máx alvo.',
    technical_notes: 'Excelente controle preciso de zonas de frequência cardíaca.'
  },
  {
    id: 'ex-bike-spinning',
    name: 'Bicicleta Ergométrica / Spinning',
    muscle_group: 'Cardiorrespiratórios',
    secondary_muscles: ['Quadríceps', 'Glúteos', 'Panturrilhas'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Cardiorrespiratório',
    execution_type: 'bilateral',
    mechanics: 'aeróbico',
    level: 'todos',
    instructions: 'Ajuste a altura do selim para que o joelho fique levemente flexionado no ponto mais baixo do pedal.',
    technical_notes: 'Baixo impacto articular ideal para recuperação e sobrepeso.'
  },
  {
    id: 'ex-eliptico',
    name: 'Elíptico / Transport',
    muscle_group: 'Cardiorrespiratórios',
    secondary_muscles: ['Membros Superiores', 'Membros Inferiores'],
    body_region: 'Corpo Inteiro',
    equipment: 'Máquina',
    category: 'Cardiorrespiratório',
    execution_type: 'bilateral',
    mechanics: 'aeróbico',
    level: 'todos',
    instructions: 'Mantenha os calcanhares apoiados na plataforma movimentando braços e pernas em sincronia.',
    technical_notes: 'Impacto zero nas articulações de joelho e tornozelo.'
  },
  {
    id: 'ex-simulador-escada',
    name: 'Simulador de Escada (Stairmaster)',
    muscle_group: 'Cardiorrespiratórios',
    secondary_muscles: ['Glúteos', 'Quadríceps', 'Panturrilhas'],
    body_region: 'Membros Inferiores',
    equipment: 'Máquina',
    category: 'Cardiorrespiratório',
    execution_type: 'bilateral',
    mechanics: 'aeróbico',
    level: 'intermediario',
    instructions: 'Suba degraus apoiando o pé inteiro, mantendo tronco ereto sem se pendurar nos corrimãos.',
    technical_notes: 'Altíssimo gasto calórico e estímulo metabólico muscular para glúteos.'
  },
  {
    id: 'ex-corda-naval',
    name: 'Corda Naval (Battle Rope) Ondulações',
    muscle_group: 'Cardiorrespiratórios',
    secondary_muscles: ['Ombros', 'Braços', 'Abdômen/Core'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Funcional',
    execution_type: 'bilateral',
    mechanics: 'aeróbico',
    level: 'intermediario',
    instructions: 'Posição de base atlética semi-agachada, execute ondas alternadas ou simultâneas com potência máxima por tiros de 20-30 segundos.',
    technical_notes: 'Excelente condicionamento anaeróbico lático para membros superiores.'
  },
  {
    id: 'ex-pular-corda',
    name: 'Pular Corda (Jump Rope)',
    muscle_group: 'Cardiorrespiratórios',
    secondary_muscles: ['Panturrilhas', 'Coordenação Motora'],
    body_region: 'Corpo Inteiro',
    equipment: 'Peso Corporal',
    category: 'Cardiorrespiratório',
    execution_type: 'bilateral',
    mechanics: 'aeróbico',
    level: 'intermediario',
    instructions: 'Salte nas pontas dos pés com rotação rápida dos punhos.',
    technical_notes: 'Aprimora rigidez tendínea do tornozelo e ritmo cardiorrespiratório.'
  },
  {
    id: 'ex-remo-indoor',
    name: 'Remo Indoor (Ergômetro)',
    muscle_group: 'Cardiorrespiratórios',
    secondary_muscles: ['Costas', 'Pernas', 'Bíceps', 'Core'],
    body_region: 'Corpo Inteiro',
    equipment: 'Máquina',
    category: 'Cardiorrespiratório',
    execution_type: 'bilateral',
    mechanics: 'aeróbico',
    level: 'intermediario',
    instructions: 'Inicie pela empurrada das pernas, incline o tronco e finalize puxando com os braços.',
    technical_notes: 'Recruta mais de 80% da massa muscular do corpo em um único ciclo de remada.'
  },

  // ==========================================
  // 17. MOBILIDADE (5 variações)
  // ==========================================
  {
    id: 'ex-mobilidade-quadril-9090',
    name: 'Mobilidade de Quadril 90/90',
    muscle_group: 'Mobilidade',
    secondary_muscles: ['Rotadores Internos e Externos do Quadril'],
    body_region: 'Membros Inferiores',
    equipment: 'Peso Corporal',
    category: 'Mobilidade',
    execution_type: 'bilateral',
    mechanics: 'mobilidade',
    level: 'todos',
    instructions: 'Sentado no chão com ambas as pernas flexionadas a 90 graus (uma na frente e outra ao lado), alterne os lados girando o quadril.',
    technical_notes: 'Melhora amplitude de agachamento profundo e previne dores lombares.'
  },
  {
    id: 'ex-mobilidade-tornozelo-parede',
    name: 'Mobilidade de Tornozelo contra a Parede (Dorsiflexão)',
    muscle_group: 'Mobilidade',
    secondary_muscles: ['Sóleo', 'Tendão de Aquiles'],
    body_region: 'Membros Inferiores',
    equipment: 'Peso Corporal',
    category: 'Mobilidade',
    execution_type: 'unilateral',
    mechanics: 'mobilidade',
    level: 'todos',
    instructions: 'Pé a alguns centímetros da parede, avance o joelho em direção à parede sem tirar o calcanhar do chão.',
    technical_notes: 'Dorsiflexão adequada é pré-requisito indispensável para agachamento seguro.'
  },
  {
    id: 'ex-mobilidade-toracica-4apoios',
    name: 'Rotação Torácica em 4 Apoios',
    muscle_group: 'Mobilidade',
    secondary_muscles: ['Coluna Torácica', 'Romboides'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Mobilidade',
    execution_type: 'unilateral',
    mechanics: 'mobilidade',
    level: 'todos',
    instructions: 'Em 4 apoios com uma mão atrás da cabeça, gire o tronco apontando o cotovelo para o teto e depois para baixo.',
    technical_notes: 'Libera rigidez da coluna dorsal causada pelo sedentarismo postural.'
  },
  {
    id: 'ex-gato-camelo',
    name: 'Gato-Camelo (Cat-Cow) Mobilidade da Coluna',
    muscle_group: 'Mobilidade',
    secondary_muscles: ['Toda a Coluna Vertebral'],
    body_region: 'Tronco / Core',
    equipment: 'Peso Corporal',
    category: 'Mobilidade',
    execution_type: 'bilateral',
    mechanics: 'mobilidade',
    level: 'todos',
    instructions: 'Em 4 apoios, alterne suavemente entre arquear as costas para cima e empurrar o abdômen para o chão com elevação da cabeça.',
    technical_notes: 'Mobilização articular suave indicada para aquecimento e alívio de tensões axiais.'
  },
  {
    id: 'ex-passagem-bacao-elastico',
    name: 'Passagem de Bastão / Elástico para Ombros (Dislocates)',
    muscle_group: 'Mobilidade',
    secondary_muscles: ['Cintura Escapular', 'Peitoral'],
    body_region: 'Membros Superiores',
    equipment: 'Elástico',
    category: 'Mobilidade',
    execution_type: 'bilateral',
    mechanics: 'mobilidade',
    level: 'todos',
    instructions: 'Segurando um bastão ou elástico com pegada aberta, passe os braços estendidos da frente para trás do corpo e retorne.',
    technical_notes: 'Aumenta flexibilidade da cápsula anterior e peitoral sem forçar o manguito.'
  },

  // ==========================================
  // 18. ALONGAMENTOS (5 variações)
  // ==========================================
  {
    id: 'ex-alongamento-isquiotibiais',
    name: 'Alongamento Estático de Isquiotibiais (Posteriores)',
    muscle_group: 'Alongamentos',
    secondary_muscles: ['Posteriores de coxa'],
    body_region: 'Membros Inferiores',
    equipment: 'Peso Corporal',
    category: 'Alongamento',
    execution_type: 'bilateral',
    mechanics: 'flexibilidade',
    level: 'todos',
    instructions: 'Sentado com pernas estendidas à frente, incline o tronco em direção aos pés até sentir tensão confortável nos posteriores, segurando por 30 segundos.',
    technical_notes: 'Mantenha respiração profunda e evite puxões bruscos.'
  },
  {
    id: 'ex-alongamento-quadriceps',
    name: 'Alongamento em Pé de Quadríceps',
    muscle_group: 'Alongamentos',
    secondary_muscles: ['Quadríceps', 'Psoas'],
    body_region: 'Membros Inferiores',
    equipment: 'Peso Corporal',
    category: 'Alongamento',
    execution_type: 'unilateral',
    mechanics: 'flexibilidade',
    level: 'todos',
    instructions: 'Em pé, flexione um joelho segurando o tornozelo atrás e aproxime o calcanhar do glúteo mantendo os joelhos alinhados.',
    technical_notes: 'Projete levemente a pelve para frente para alongar o reto femoral.'
  },
  {
    id: 'ex-alongamento-peitoral-parede',
    name: 'Alongamento de Peitoral no Batente / Parede',
    muscle_group: 'Alongamentos',
    secondary_muscles: ['Peitoral', 'Bíceps'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Alongamento',
    execution_type: 'unilateral',
    mechanics: 'flexibilidade',
    level: 'todos',
    instructions: 'Apoie o antebraço a 90 graus na parede ou batente e gire o tronco para o lado oposto suavemente.',
    technical_notes: 'Alivia retração peitoral típica de postura cifótica de escritório.'
  },
  {
    id: 'ex-alongamento-gluteo-piriforme',
    name: 'Alongamento de Glúteo e Piriforme Deitado (Figura 4)',
    muscle_group: 'Alongamentos',
    secondary_muscles: ['Glúteos', 'Piriforme'],
    body_region: 'Membros Inferiores',
    equipment: 'Peso Corporal',
    category: 'Alongamento',
    execution_type: 'unilateral',
    mechanics: 'flexibilidade',
    level: 'todos',
    instructions: 'Deitado de barriga para cima, cruze um tornozelo sobre o joelho oposto e puxe a coxa em direção ao peito.',
    technical_notes: 'Essencial para descompressão do nervo ciático e alívio do piriforme.'
  },
  {
    id: 'ex-alongamento-dorsal-barra',
    name: 'Alongamento Suspenso de Grande Dorsal na Barra',
    muscle_group: 'Alongamentos',
    secondary_muscles: ['Grande Dorsal', 'Redondo Maior', 'Ombros'],
    body_region: 'Membros Superiores',
    equipment: 'Peso Corporal',
    category: 'Alongamento',
    execution_type: 'bilateral',
    mechanics: 'flexibilidade',
    level: 'todos',
    instructions: 'Segure na barra fixa e relaxe o peso do corpo deixando a gravidade descomprimir as escápulas e a coluna toracolombar.',
    technical_notes: 'Descompressão espinhal poderosa pós-treino.'
  }
];

// Garante identificador persistente e único de anexo R2 para cada um dos 119 exercícios do catálogo global
for (const ex of DEFAULT_EXERCISE_LIBRARY) {
  if (!ex.exercise_file_id) {
    ex.exercise_file_id = `att-${ex.id}`;
  }
}

export function seedExerciseLibrary(rawDb: any): void {
  try {
    // Garante que todas as colunas necessárias existam
    const pExCols = rawDb.prepare('PRAGMA table_info(personal_exercises)').all().map((c: any) => c.name);
    if (!pExCols.includes('body_region')) rawDb.exec('ALTER TABLE personal_exercises ADD COLUMN body_region TEXT');
    if (!pExCols.includes('equipment')) rawDb.exec('ALTER TABLE personal_exercises ADD COLUMN equipment TEXT');
    if (!pExCols.includes('category')) rawDb.exec("ALTER TABLE personal_exercises ADD COLUMN category TEXT DEFAULT 'Musculação'");
    if (!pExCols.includes('execution_type')) rawDb.exec("ALTER TABLE personal_exercises ADD COLUMN execution_type TEXT DEFAULT 'bilateral'");
    if (!pExCols.includes('mechanics')) rawDb.exec('ALTER TABLE personal_exercises ADD COLUMN mechanics TEXT');
    if (!pExCols.includes('level')) rawDb.exec("ALTER TABLE personal_exercises ADD COLUMN level TEXT DEFAULT 'todos'");
    if (!pExCols.includes('technical_notes')) rawDb.exec('ALTER TABLE personal_exercises ADD COLUMN technical_notes TEXT');
    if (!pExCols.includes('exercise_file_id')) rawDb.exec('ALTER TABLE personal_exercises ADD COLUMN exercise_file_id TEXT');
    if (!pExCols.includes('is_active')) rawDb.exec('ALTER TABLE personal_exercises ADD COLUMN is_active INTEGER DEFAULT 1');

    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS file_attachments (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        patient_id TEXT,
        appointment_id TEXT,
        assessment_id TEXT,
        exercise_id TEXT,
        professional_id TEXT,
        module_type TEXT,
        test_id TEXT,
        uploaded_by TEXT NOT NULL,
        storage_provider TEXT NOT NULL DEFAULT 'cloudflare_r2',
        object_key TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    try {
      const attachCols = rawDb.prepare('PRAGMA table_info(file_attachments)').all().map((c: any) => c.name);
      if (!attachCols.includes('exercise_id')) rawDb.exec('ALTER TABLE file_attachments ADD COLUMN exercise_id TEXT');
      if (!attachCols.includes('professional_id')) rawDb.exec('ALTER TABLE file_attachments ADD COLUMN professional_id TEXT');
      if (!attachCols.includes('module_type')) rawDb.exec('ALTER TABLE file_attachments ADD COLUMN module_type TEXT');
      if (!attachCols.includes('test_id')) rawDb.exec('ALTER TABLE file_attachments ADD COLUMN test_id TEXT');
    } catch (_) {}

    const stmt = rawDb.prepare(`
      INSERT INTO personal_exercises (
        id, tenant_id, name, muscle_group, secondary_muscles_json,
        body_region, equipment, category, execution_type, mechanics, level,
        instructions, technical_notes, photo_url, exercise_file_id, is_custom, is_active,
        created_at, updated_at
      ) VALUES (
        ?, 'global', ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, null, ?, 0, 1,
        datetime('now'), datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        muscle_group = excluded.muscle_group,
        secondary_muscles_json = excluded.secondary_muscles_json,
        body_region = excluded.body_region,
        equipment = excluded.equipment,
        category = excluded.category,
        execution_type = excluded.execution_type,
        mechanics = excluded.mechanics,
        level = excluded.level,
        instructions = excluded.instructions,
        technical_notes = excluded.technical_notes,
        photo_url = null,
        exercise_file_id = excluded.exercise_file_id,
        is_active = 1,
        updated_at = datetime('now')
      WHERE personal_exercises.is_custom = 0
    `);

    rawDb.exec('BEGIN IMMEDIATE;');
    try {
      // Limpeza de quaisquer anexos fake gerados anteriormente sem arquivo real no R2
      rawDb.exec(`
        DELETE FROM file_attachments 
        WHERE id LIKE 'att-ex-%' OR object_key LIKE 'exercises/global/%'
      `);

      for (const ex of DEFAULT_EXERCISE_LIBRARY) {
        // Preserva anexo real já cadastrado no banco para o exercício, se houver
        const currentExercise = rawDb.prepare(`
          SELECT pe.exercise_file_id, fa.id as verified_file_id
          FROM personal_exercises pe
          LEFT JOIN file_attachments fa ON fa.id = pe.exercise_file_id AND fa.storage_provider = 'cloudflare_r2'
          WHERE pe.id = ?
        `).get(ex.id) as any;

        const validFileId = currentExercise?.verified_file_id || null;

        stmt.run(
          ex.id,
          ex.name,
          ex.muscle_group,
          JSON.stringify(ex.secondary_muscles || []),
          ex.body_region,
          ex.equipment,
          ex.category,
          ex.execution_type,
          ex.mechanics,
          ex.level,
          ex.instructions,
          ex.technical_notes || null,
          validFileId
        );
      }
      rawDb.exec('COMMIT;');
    } catch (txErr) {
      try { rawDb.exec('ROLLBACK;'); } catch (_) {}
      throw txErr;
    }
    console.log(`[Database] Biblioteca expandida de exercícios semeada com sucesso: ${DEFAULT_EXERCISE_LIBRARY.length} exercícios preservados com integridade estrita de anexos R2.`);
  } catch (err) {
    console.error('[Database] Erro ao semear biblioteca expandida de exercícios:', err);
  }
}
