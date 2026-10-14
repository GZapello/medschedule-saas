import type { SeedExercise } from './exercise-library.seed';

// Each row describes a distinct movement or equipment variation, not a renamed duplicate.
type Row = [string, string, string, string, string, string];
const strength: Row[] = [
  ['supino-maquina', 'Supino na Máquina Convergente', 'Peitoral', 'Máquina', 'Sentado com costas apoiadas e manoplas na altura do peito, empurre e retorne controladamente.', 'Tríceps|Ombros'],
  ['supino-neutro-halteres', 'Supino com Halteres em Pegada Neutra', 'Peitoral', 'Halteres', 'Deitado no banco, mantenha palmas voltadas uma para a outra; desça junto ao tronco e estenda os braços.', 'Tríceps|Ombros'],
  ['supino-smith', 'Supino Reto no Smith', 'Peitoral', 'Smith', 'Ajuste o banco sob a barra e as travas; desça a barra à linha do peito e empurre mantendo os pés apoiados.', 'Tríceps|Ombros'],
  ['flexao-inclinada', 'Flexão com Mãos Elevadas', 'Peitoral', 'Peso Corporal', 'Apoie as mãos em banco firme e mantenha corpo alinhado; flexione cotovelos aproximando peito do apoio e retorne.', 'Tríceps|Abdômen/Core'],
  ['flexao-declinada', 'Flexão com Pés Elevados', 'Peitoral', 'Peso Corporal', 'Com pés em apoio firme e mãos no solo, desça o peito entre as mãos e empurre sem deixar a pelve cair.', 'Ombros|Tríceps'],
  ['remada-peito-apoiado', 'Remada com Halteres e Peito Apoiado', 'Costas', 'Halteres', 'De bruços em banco inclinado, puxe halteres em direção às costelas e estenda os braços controladamente.', 'Bíceps|Deltoide posterior'],
  ['remada-unilateral-cabo', 'Remada Unilateral na Polia', 'Costas', 'Cabo / Polia', 'Sentado diante da polia, puxe uma manopla até a lateral do tronco mantendo ombros e pelve alinhados.', 'Bíceps|Abdômen/Core'],
  ['remada-elastico', 'Remada Sentada com Elástico', 'Costas', 'Elástico', 'Sentado com elástico em ponto de fixação firme, puxe cotovelos para trás e retorne sem inclinar a lombar.', 'Bíceps|Romboides'],
  ['remada-invertida', 'Remada Invertida na Barra', 'Costas', 'Peso Corporal', 'Sob barra fixada, apoie calcanhares e puxe o peito em direção à barra mantendo corpo alinhado.', 'Bíceps|Abdômen/Core'],
  ['puxada-unilateral', 'Puxada Unilateral na Polia Alta', 'Costas', 'Cabo / Polia', 'Sentado ou ajoelhado, puxe a manopla acima da cabeça até a lateral do peito sem inclinar o tronco.', 'Bíceps'],
  ['barra-fixa-assistida', 'Barra Fixa na Máquina Assistida', 'Costas', 'Máquina', 'Ajuste a assistência, apoie os joelhos e puxe o corpo até aproximar o peito das manoplas.', 'Bíceps|Antebraços'],
  ['pullover-halter', 'Pullover com Halter', 'Costas', 'Halteres', 'Deitado no banco, segure um halter acima do peito e leve-o atrás da cabeça em arco confortável, retornando.', 'Peitoral|Tríceps'],
  ['remada-alta-maquina', 'Remada Alta Articulada (High Row)', 'Costas', 'Máquina', 'Com peito apoiado, puxe as manoplas altas em direção às costelas e controle o retorno.', 'Bíceps|Deltoide posterior'],
  ['desenvolvimento-arnold', 'Desenvolvimento Arnold', 'Ombros', 'Halteres', 'Sentado com halteres à frente do rosto, gire palmas para frente enquanto eleva os braços; retorne controladamente.', 'Tríceps'],
  ['elevacao-lateral-maquina', 'Elevação Lateral na Máquina', 'Ombros', 'Máquina', 'Ajuste o assento e apoie braços nas almofadas; eleve lateralmente até amplitude confortável e retorne.', 'Trapézio'],
  ['crucifixo-inverso-cabo', 'Crucifixo Inverso no Cabo', 'Ombros', 'Cabo / Polia', 'Com cabos cruzados à frente, afaste os braços mantendo cotovelos levemente flexionados.', 'Romboides|Trapézio'],
  ['elevacao-y-banco', 'Elevação em Y no Banco Inclinado', 'Ombros', 'Halteres', 'Com peito apoiado e polegares voltados para cima, eleve os braços em Y sem arquear a lombar.', 'Trapézio inferior'],
  ['serratus-punch', 'Protração Escapular com Halteres', 'Ombros', 'Halteres', 'Deitado com braços verticais, leve as mãos em direção ao teto movendo as escápulas e retorne.', 'Serrátil anterior'],
  ['rosca-cabo-baixo', 'Rosca Direta na Polia Baixa', 'Bíceps', 'Cabo / Polia', 'Em pé diante da polia, flexione cotovelos com braços junto ao tronco e retorne sem balançar.', 'Braquial|Antebraços'],
  ['rosca-scott-maquina', 'Rosca Scott na Máquina', 'Bíceps', 'Máquina', 'Apoie a parte posterior dos braços no suporte e flexione cotovelos, controlando o retorno.', 'Braquial'],
  ['rosca-inversa-barra', 'Rosca Inversa com Barra', 'Antebraços', 'Barra', 'Segure a barra com palmas para baixo e flexione os cotovelos sem dobrar os punhos.', 'Braquiorradial|Bíceps'],
  ['pronacao-supinacao', 'Pronação e Supinação com Halter', 'Antebraços', 'Halteres', 'Sentado com antebraço apoiado, gire lentamente a palma para cima e para baixo segurando carga leve.', 'Pronadores|Supinador'],
  ['triceps-unilateral-cabo', 'Extensão Unilateral de Tríceps na Polia', 'Tríceps', 'Cabo / Polia', 'Mantenha um cotovelo junto ao tronco e estenda-o puxando a manopla para baixo.', 'Ancôneo'],
  ['triceps-acima-cabo', 'Extensão de Tríceps Acima da Cabeça no Cabo', 'Tríceps', 'Cabo / Polia', 'De costas à polia, braços elevados, estenda os cotovelos sem mover o tronco.', 'Abdômen/Core'],
  ['triceps-maquina', 'Extensão de Tríceps na Máquina', 'Tríceps', 'Máquina', 'Ajuste apoios e manoplas, estenda os cotovelos e retorne controladamente.', 'Ancôneo'],
  ['supino-fechado', 'Supino com Pegada Fechada', 'Tríceps', 'Barra', 'Deitado no banco, segure a barra aproximadamente na largura dos ombros e empurre com cotovelos próximos ao tronco.', 'Peitoral|Ombros'],
  ['prancha-toque-ombro', 'Prancha com Toque nos Ombros', 'Abdômen/Core', 'Peso Corporal', 'Em prancha alta com pés afastados, toque uma mão no ombro oposto sem girar o quadril.', 'Ombros|Glúteos'],
  ['reverse-crunch', 'Crunch Reverso com Elevação da Pelve', 'Abdômen/Core', 'Peso Corporal', 'Deitado com joelhos dobrados, enrole a pelve elevando-a levemente e retorne sem impulso.', 'Oblíquos'],
  ['extensao-quadril-banco', 'Extensão de Quadril no Banco Romano', 'Lombar', 'Banco Romano', 'Apoie a pelve no banco e faça flexão e extensão do quadril mantendo a coluna alinhada.', 'Glúteos|Posteriores de coxa'],
  ['agachamento-goblet', 'Agachamento Goblet', 'Quadríceps', 'Kettlebell', 'Segure kettlebell junto ao peito, flexione joelhos e quadril e retorne mantendo pés apoiados.', 'Glúteos|Abdômen/Core'],
  ['agachamento-caixa', 'Agachamento na Caixa', 'Quadríceps', 'Barra', 'Com barra apoiada nas costas, desça até tocar suavemente uma caixa firme e levante sem balanço.', 'Glúteos|Posteriores de coxa'],
  ['step-up', 'Subida no Banco com Halteres', 'Quadríceps', 'Halteres', 'Coloque um pé inteiro no banco firme e suba estendendo a perna apoiada; desça controladamente.', 'Glúteos|Panturrilhas'],
  ['avanco-reverso', 'Avanço Reverso com Halteres', 'Quadríceps', 'Halteres', 'Em pé, dê um passo para trás e flexione ambos os joelhos; retorne apoiando o pé da frente.', 'Glúteos'],
  ['legpress-unilateral', 'Leg Press Unilateral', 'Quadríceps', 'Máquina', 'Com um pé na plataforma, flexione o joelho até amplitude que preserve a pelve apoiada e empurre.', 'Glúteos'],
  ['agachamento-peso-corporal', 'Agachamento com Peso Corporal', 'Quadríceps', 'Peso Corporal', 'Com pés apoiados, flexione quadril e joelhos, desça na amplitude controlável e retorne.', 'Glúteos|Abdômen/Core'],
  ['rdl-unilateral', 'Terra Romeno Unilateral com Halter', 'Posteriores de coxa', 'Halteres', 'Apoiado em uma perna, incline o tronco pelo quadril e estenda a outra perna para trás; retorne.', 'Glúteos|Abdômen/Core'],
  ['ponte-gluteos-solo', 'Ponte de Glúteos no Solo', 'Glúteos', 'Peso Corporal', 'Deitado com joelhos dobrados e pés apoiados, eleve a pelve e retorne sem arquear a lombar.', 'Posteriores de coxa|Abdômen/Core'],
  ['pull-through', 'Pull Through na Polia', 'Glúteos', 'Cabo / Polia', 'De costas à polia baixa, segure a corda entre as pernas; leve quadril para trás e estenda-o.', 'Posteriores de coxa|Lombar'],
  ['abducao-decubito', 'Abdução de Quadril em Decúbito Lateral', 'Abdutores', 'Peso Corporal', 'De lado com pelve alinhada, eleve a perna de cima sem rodar o tronco e retorne.', 'Glúteo médio'],
  ['aducao-decubito', 'Adução de Quadril em Decúbito Lateral', 'Adutores', 'Peso Corporal', 'De lado, cruze a perna superior à frente e eleve a perna de baixo estendida.', 'Grácil'],
  ['panturrilha-em-pe-maquina', 'Panturrilha em Pé na Máquina', 'Panturrilhas', 'Máquina', 'Apoie antepés na plataforma e ombros sob almofadas; eleve calcanhares e desça controladamente.', 'Sóleo'],
  ['panturrilha-sentado-halter', 'Panturrilha Sentado com Halter', 'Panturrilhas', 'Halteres', 'Sentado com joelhos dobrados e carga sobre coxas, eleve e abaixe calcanhares sem impulso.', 'Sóleo'],
  ['terra-trap-bar', 'Levantamento Terra com Trap Bar', 'Corpo inteiro', 'Trap Bar', 'No centro da barra hexagonal, segure as alças e estenda joelhos e quadril mantendo coluna alinhada.', 'Quadríceps|Glúteos|Posteriores de coxa'],
  ['terra-sumo', 'Levantamento Terra Sumô com Barra', 'Corpo inteiro', 'Barra', 'Com base ampla e mãos entre as pernas, empurre o chão e estenda quadril e joelhos.', 'Adutores|Glúteos|Quadríceps'],
  ['clean-kettlebell', 'Clean Unilateral com Kettlebell', 'Corpo inteiro', 'Kettlebell', 'Partindo entre as pernas, estenda quadril e conduza o kettlebell próximo ao corpo até apoiar no antebraço.', 'Glúteos|Ombros|Abdômen/Core'],
  ['turkish-getup', 'Levantamento Turco com Kettlebell', 'Corpo inteiro', 'Kettlebell', 'Deitado com carga acima do ombro, passe pelo apoio no cotovelo, mão, meio-ajoelhado e posição em pé; reverta.', 'Ombros|Abdômen/Core|Glúteos'],
];

// id, name, anatomical target, start and execution. Static stretches have optional guidance only.
const stretches: [string, string, string, string][] = [
  ['cervical-lateral', 'Alongamento Cervical Lateral', 'Pescoço', 'Sentado ereto, incline suavemente a cabeça aproximando uma orelha do ombro, sem elevar o ombro.'],
  ['trapezio-superior', 'Alongamento de Trapézio Superior com Apoio', 'Trapézio superior', 'Sentado, segure o assento com uma mão e incline a cabeça para o lado oposto sem puxá-la.'],
  ['ombro-cruzado', 'Alongamento de Ombro Cruzado / Deltoide Posterior', 'Deltoide posterior', 'Em pé, leve um braço à frente do peito e aproxime-o com a outra mão acima do cotovelo.'],
  ['triceps-acima', 'Alongamento de Tríceps Acima da Cabeça', 'Tríceps', 'Sentado ou em pé, dobre um cotovelo acima da cabeça e apoie a mão oposta sem pressionar a articulação.'],
  ['tronco-lateral', 'Alongamento Lateral de Tronco em Pé', 'Oblíquos', 'Em pé com base estável, eleve um braço e incline suavemente o tronco para o lado oposto.'],
  ['gluteo-sentado', 'Alongamento de Glúteo Sentado', 'Glúteos', 'Sentado, cruze um tornozelo sobre a coxa oposta e incline o tronco pelo quadril sem pressionar o joelho.'],
  ['adutores-borboleta', 'Alongamento de Adutores Borboleta', 'Adutores', 'Sentado, una as plantas dos pés e deixe os joelhos se afastarem sem pressioná-los com as mãos.'],
  ['adutores-frog', 'Alongamento de Adutores Frog Stretch', 'Adutores', 'Em quatro apoios acolchoados, afaste os joelhos e desloque quadril para trás até tensão confortável.'],
  ['gastrocnemio-parede', 'Alongamento de Gastrocnêmio na Parede', 'Gastrocnêmio', 'Com mãos na parede, leve uma perna para trás e mantenha joelho estendido e calcanhar apoiado.'],
  ['panturrilha-degrau', 'Alongamento de Panturrilha no Degrau', 'Panturrilhas', 'Segure um apoio firme, coloque antepé no degrau e abaixe o calcanhar lentamente sem rebotes.'],
  ['tronco-extensao', 'Alongamento de Tronco em Apoio nos Antebraços', 'Abdômen/Core', 'De bruços, apoie os antebraços e eleve suavemente o peito mantendo a pelve no chão.'],
];
const mobility: [string, string, string, string][] = [
];
const dynamic: [string, string, string, string][] = [
  ['inchworm', 'Alongamento Dinâmico Inchworm', 'Cadeia posterior', 'Em pé, alcance o chão com joelhos destravados e caminhe com mãos até prancha; retorne com controle.'],
  ['abraco-abertura', 'Alongamento Dinâmico de Peitoral com Abertura de Braços', 'Peitoral', 'Em pé, alterne abrir os braços e cruzá-los à frente do peito sem impulsos bruscos.'],
];
const conditioning: Row[] = [
  ['ski-erg', 'Ski Ergômetro', 'Cardiorrespiratórios', 'Máquina', 'Com pés apoiados, puxe alças para baixo usando braços e leve flexão do quadril, retornando controladamente.', 'Costas|Tríceps|Abdômen/Core'],
  ['polichinelo', 'Polichinelo', 'Cardiorrespiratórios', 'Peso Corporal', 'Alterne abertura de pernas e elevação dos braços com pequenos saltos e aterrissagem controlada.', 'Panturrilhas|Ombros'],
  ['mountain-climber', 'Mountain Climber', 'Corpo inteiro', 'Peso Corporal', 'Em prancha alta, aproxime alternadamente os joelhos do peito mantendo ombros sobre as mãos.', 'Abdômen/Core|Ombros'],
  ['bear-crawl', 'Deslocamento em Urso (Bear Crawl)', 'Corpo inteiro', 'Peso Corporal', 'Em quatro apoios com joelhos elevados, avance mão e pé opostos em passos curtos.', 'Abdômen/Core|Ombros'],
  ['slam-ball', 'Arremesso de Medicine Ball ao Solo', 'Corpo inteiro', 'Medicine Ball', 'Eleve uma bola apropriada para arremesso e lance ao solo à frente, recolhendo com flexão de quadril e joelhos.', 'Abdômen/Core|Ombros'],
  ['aquecimento-agachamento-alcance', 'Aquecimento com Agachamento e Alcance', 'Corpo inteiro', 'Peso Corporal', 'Faça agachamento sem carga e, ao levantar, alcance as mãos acima da cabeça sem arquear a lombar.', 'Quadríceps|Ombros'],
];

function region(target: string): string {
  if (/Quadr|Posterior|Glúte|Adutor|Abdutor|Panturr|Sóleo|Gastro|quadril|tornozelo|Joelho|Tornozelo/.test(target) && !/Deltoide/i.test(target)) return 'Membros Inferiores';
  if (/Core|Lombar|torácica|Oblíquos|Cadeia|Costas/.test(target)) return 'Tronco / Core';
  if (/Ombro|Deltoide|Peitoral|Bíceps|Tríceps|Antebraço|Braço|Punho|Escápula|Cervical|Trapézio|Mão/.test(target)) return 'Membros Superiores';
  return target === 'Corpo inteiro' || target === 'Cardiorrespiratórios' ? 'Corpo Inteiro' : 'Membros Superiores';
}
function movement(row: Row, category: string): SeedExercise {
  const [id, name, muscle_group, equipment, instructions, muscles] = row;
  const resolvedCategory = id === 'suitcase-carry' ? 'Funcional' : category;
  const resolvedRegion = muscle_group === 'Costas' ? 'Membros Superiores' : region(muscle_group);
  return { id: `ex-${id}`, name, muscle_group, secondary_muscles: muscles.split('|'), body_region: resolvedRegion, equipment, category: resolvedCategory,
    execution_type: /Unilateral|Unipodal/.test(name) ? 'unilateral' : 'bilateral',
    mechanics: equipment === 'Máquina' ? 'máquina' : equipment === 'Cabo / Polia' ? 'cabo/polia' : equipment === 'Peso Corporal' ? 'peso corporal' : 'resistido',
    level: /Turco|Clean|Copenhagen|Trap Bar/.test(name) ? 'avancado' : 'intermediario', instructions,
    technical_notes: 'Controle a amplitude e o retorno. Ajuste apoio e resistência com o profissional; não use impulso para completar repetições.' };
}
function flexibility(rows: typeof stretches, category: string, dynamic = false): SeedExercise[] {
  return rows.map(([id, name, target, instructions]) => ({
    id: `ex-${category === 'Mobilidade' ? 'mob' : 'along'}-${id}`, name,
    muscle_group: category === 'Mobilidade' ? 'Mobilidade' : 'Alongamentos', secondary_muscles: [target],
    body_region: region(target), equipment: /Faixa/.test(name) ? 'Elástico' : /Rolo/.test(name) ? 'Rolo' : /Banco/.test(name) ? 'Banco' : 'Peso Corporal',
    category, execution_type: dynamic || category === 'Mobilidade' ? 'dinâmico' : 'estático', mechanics: category === 'Mobilidade' ? 'mobilidade' : 'flexibilidade',
    level: 'iniciante', instructions: `${instructions} Região trabalhada: ${target}.`,
    technical_notes: 'Use amplitude confortável, respire continuamente e evite rebotes ou pressão forçada. Ajuste com o profissional se houver desconforto.',
    suggested_duration: dynamic || category === 'Mobilidade' ? 'Movimentos lentos; repetições e tempo definidos pelo profissional.' : 'Referência opcional: 15–30 segundos por posição; o profissional define duração, lados e séries.'
  }));
}
export const EXPANDED_EXERCISES: SeedExercise[] = [
  ...strength.map(row => movement(row, 'Musculação')),
  ...flexibility(stretches, 'Alongamento'), ...flexibility(dynamic, 'Alongamento', true), ...flexibility(mobility, 'Mobilidade'),
  ...conditioning.map(row => movement(row, row[0].startsWith('aquecimento-') ? 'Aquecimento' : row[2] === 'Cardiorrespiratórios' ? 'Cardiorrespiratório' : 'Funcional')),
];
