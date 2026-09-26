# Complementação de GIFs — ZemdaPersonal

Revisão de 2026-09-26 sobre `67b7d9037a89804e80a62378470dddd60c9d51e6`. Fonte: `JahelCuadrado/ExerciseGymGifsDB` no commit `f6d16e977fbee3c04295311c44cb8374ca8ff182`.

| Medida | Quantidade |
|---|---:|
| Exercícios existentes | 268 |
| GIFs anteriores preservados | 60 |
| Registros candidatos do JSON analisados | 208 |
| Arquivos GIF distintos inspecionados, incluindo alternativas | 271 |
| Novos GIFs aprovados | 68 |
| Registros rejeitados | 124 |
| Pendentes / em revisão | 16 |
| Total com GIF | 128 |
| Exercícios que continuam sem GIF | 140 |
| Novas miniaturas WEBP | 67 |

As decisões se referem aos 208 exercícios sem GIF no início desta revisão. Rejeitado significa que os candidatos inspecionados são incompatíveis; pendente significa que um detalhe da variante não pôde ser confirmado. Ambos permanecem sem associação. O relatório anterior permanece como histórico das primeiras 60 aprovações.

## Critério e preservação

Comparação manual com o catálogo real (nome, instruções, músculos, equipamento, posição, pegada, lateralidade e trajetória); inspeção de quatro fases de cada GIF. Níveis automáticos strong/probable/review não foram usados como aprovação. Decodificação integral de todos os quadros para detectar arquivos inválidos. Metadados do dataset não substituem o movimento observado.

Clone já existente em ./ExerciseGymGifsDB; ../ExerciseGymGifsDB ausente. O clone não foi movido, alterado, incluído no Git nem convertido em submodule. Apenas mídias aprovadas foram copiadas.

As 60 entradas anteriores do manifesto foram mantidas integralmente. IDs, nomes, instruções, grupos, equipamentos e demais campos do catálogo foram comparados com o estado anterior em teste automatizado. Nenhum exercício externo foi importado. Fotos manuais e mídias previamente validadas mantêm prioridade. Os 67 WEBPs substituem somente o placeholder conhecido; o polichinelo recebe apenas GIF porque a miniatura de origem tem artefatos visuais.

Só o manifesto existente é usado em execução. Novos GIFs estão em `/exercise-media/<zemda_id>.gif`; miniaturas aprovadas em `/exercise-media/<zemda_id>.webp`. Fonte, caminho, commit e SHA-256 são registrados. Os 135 arquivos copiados correspondem aos blobs do commit de origem. O relatório JSON inclui a fotografia do catálogo/manifesto anteriores e a lista de evidências por arquivo, mas não é lido pela aplicação.

## Interface

GIFs são montados apenas após hover com mouse ou toque em “Ver movimento”. Ao sair do cartão ou tocar em “Voltar à imagem”, a imagem estática retorna. A capacidade de hover é detectada por media query de entrada, sem depender da largura da tela. Apenas um cartão anima; filtragem, saída da área visível, abertura de detalhes/formulário e ocultação da página encerram a animação. A imagem estática fica montada durante o carregamento e volta automaticamente em falhas, sem repetição de requisições. URLs estáveis permitem reutilização do cache do navegador. “Ver animação do exercício” permanece nos detalhes.

## Testes e evidências

- **passou** — `npm run test:exercises` em `backend`: Build TypeScript; integridade das 128 associações e metadados do catálogo; 55 checks da biblioteca; 37 checks expansão/alunos. Banco temporário e chave de teste local.
- **passou** — `npm run build` em `frontend`: Build de produção Vite. Aviso preexistente de importação estática/dinâmica de PersonalAssessmentFormModal.
- **passou** — `node tests/exercise-media-browser.cjs` em `frontend`: 255 arquivos (128 GIFs + 127 imagens) decodificados via HTTP sem 404; catálogo, detalhes, carregamento sob demanda, falhas de JPG/GIF e nova tentativa.
- **passou** — `node tests/exercise-library-browser.cjs` em `frontend`: Catálogo, filtros, busca, recarga, upload/substituição simulados, seleção para treino, duração/lado, persistência e PDF com/sem imagens. Seletor de detalhes tornado exato para distinguir a miniatura clicável.
- **passou** — `node tests/exercise-card-animation-browser.cjs` em `frontend`: Desktop 1440px; touch 390px e tablet 1024px, com viewport real. Sem pré-carregamento; hover/mouseleave; reprodução/retorno; apenas um GIF; parada ao sair da área visível; modal; item sem GIF; falhas HTTP 404 de GIF/WEBP; cache nativo em contexto sem interceptação.
- **passou** — `Verificação dos arquivos de origem e revisão visual`: 271 GIFs distintos com todos os quadros decodificados e quatro fases inspecionadas. 135 arquivos copiados (68 GIFs e 67 WEBPs) correspondem byte a byte aos blobs do commit de origem; 60 associações anteriores e seus hashes preservados. Capturas desktop/touch inspecionadas.
- **passou** — `git diff --check`: Sem erros de whitespace.

Testes locais em Chromium/Chrome, com componentes reais, API usando fixtures do catálogo e helpers reais do backend; upload/Worker simulados. Não houve implantação em produção, acesso a dados clínicos nem teste físico em dispositivo iOS/Android.

Capturas: [desktop](exercisegymgifs-evidence/gym-desktop-hover.png), [celular](exercisegymgifs-evidence/gym-touch-390.png), [tablet](exercisegymgifs-evidence/gym-touch-1024.png), [detalhes](exercisegymgifs-evidence/media-details.png), [falhas](exercisegymgifs-evidence/media-failures.png).

Para repetir: execute `npm run test:exercises` em `backend`, definindo uma chave local fictícia em `ZEMDA_FILES_SIGNING_SECRET`; execute `npm run build` em `frontend`; inicie o Vite e execute os três testes de navegador. Disponibilize Playwright (ou `PLAYWRIGHT_MODULE`) e Chromium (`CHROME_PATH`, se necessário). `TEST_BASE_URL` e `TEST_OUTPUT_DIR` são opcionais.

## Decisão por exercício analisado

| zemda_id | Exercício | Resultado | dataset_id escolhido | Motivo |
|---|---|---|---|---|
| `ex-supino-inclinado-halteres` | Supino Inclinado com Halteres | pendente | — | Não foi possível confirmar banco a 30 graus e rotação neutra-pronada prescritos; a execução mostra inclinação maior e pegada estável. |
| `ex-crucifixo-inclinado` | Crucifixo Inclinado com Halteres | aprovado | `pectorals/dumbbell-incline-fly` | Crucifixo bilateral com halteres, banco inclinado e cotovelos semiflexionados; adução em arco para peitoral superior. |
| `ex-peck-deck-voador` | Voador / Peck Deck na Máquina | aprovado | `pectorals/lever-seated-fly` | Voador sentado, manoplas na linha do peito e adução dos braços. O chest press sugerido foi descartado. |
| `ex-crossover-alta` | Crossover na Polia Alta | aprovado | `pectorals/cable-standing-fly` | Crossover em pé, tronco inclinado e polias altas; manoplas convergem para frente e para baixo. |
| `ex-crossover-media` | Crossover na Polia Média | rejeitado | — | Os candidatos mostram supino/deitado e crucifixo declinado, sem adução horizontal em pé com polias na altura do peito. |
| `ex-crossover-baixa` | Crossover na Polia Baixa | pendente | — | A adução com polia baixa é semelhante, mas não confirma a chegada das mãos à linha dos olhos prescrita. |
| `ex-paralelas-peito` | Mergulho nas Barras Paralelas (Foco Peitoral) | aprovado | `pectorals/chest-dip` | Mergulho nas paralelas sem assistência, tronco inclinado e cotovelos flexionados; foco peitoral. |
| `ex-puxada-supinada` | Puxada Frontal com Pegada Supinada | aprovado | `lats/cable-underhand-pulldown` | Puxada sentada com barra em pegada supinada e flexão bilateral dos cotovelos para dorsais. |
| `ex-puxada-triangulo` | Puxada Frontal com Triângulo (Pegada Neutra) | aprovado | `lats/cable-lateral-pulldown-with-v-bar` | Puxada sentada na polia alta com triângulo/V e pegada neutra; cotovelos descem ao lado do tronco. |
| `ex-remada-serrote-halteres` | Remada Unilateral com Halter (Serrote) | aprovado | `upper-back/dumbbell-one-arm-bent-over-row` | Uma mão e um joelho apoiados no banco; remada unilateral com halter ao lado do quadril. |
| `ex-remada-baixa-triangulo` | Remada Baixa na Polia com Triângulo | aprovado | `upper-back/cable-low-seated-row` | Remada sentada na polia baixa, pegada neutra fechada no triângulo e tração ao abdômen com tronco estável. |
| `ex-remada-cavalinho` | Remada Cavalinho (Barra T) | aprovado | `upper-back/lever-bent-over-row-with-v-bar` | Barra ancorada por uma extremidade e puxada pela alça V; remada cavalinho com tronco inclinado, sem apoio torácico. |
| `ex-pulldown-corda` | Pulldown na Polia Alta com Corda / Barra | pendente | — | A sugestão principal é uma puxada com flexão dos cotovelos. A alternativa de braços estendidos não confirma a inclinação do tronco a 30 graus. |
| `ex-barra-fixa-pronada` | Barra Fixa (Pull-up) Pegada Pronada | aprovado | `lats/pull-up` | Barra fixa sem assistência, pegada pronada aberta e elevação do corpo até a barra. |
| `ex-desenvolvimento-militar` | Desenvolvimento Militar com Barra em Pé (Overhead Press) | aprovado | `delts/barbell-standing-wide-military-press` | Press bilateral com barra em pé, trajetória à frente da cabeça a partir da clavícula; candidato sentado descartado. |
| `ex-elevacao-lateral-inclinado` | Elevação Lateral no Banco 45° | aprovado | `delts/dumbbell-incline-one-arm-lateral-raise` | Decúbito lateral sobre banco inclinado, elevação unilateral do halter no plano lateral. |
| `ex-elevacao-frontal-halteres` | Elevação Frontal Alternada com Halteres | aprovado | `delts/dumbbell-front-raise-v-2` | Elevação frontal alternada em pé, um halter de cada vez; variante simultânea do candidato principal descartada. |
| `ex-crucifixo-inverso-halteres` | Crucifixo Inverso com Halteres (Deltoide Posterior) | aprovado | `delts/dumbbell-reverse-fly` | Crucifixo inverso bilateral com halteres, peito apoiado no banco inclinado; opção de apoio prevista nas instruções. |
| `ex-crucifixo-inverso-peckdeck` | Crucifixo Inverso no Peck Deck / Voador Inverso | aprovado | `delts/lever-seated-reverse-fly` | Sentado de frente para o encosto do peck deck, abertura bilateral dos braços para trás na altura dos ombros. |
| `ex-face-pull` | Face Pull na Polia Alta com Corda | aprovado | `delts/cable-rear-delt-row-with-rope` | Polia alta com corda, tração bilateral em direção ao rosto com afastamento das mãos e rotação externa. |
| `ex-remada-alta-barra` | Remada Alta com Barra W | rejeitado | — | As remadas altas inspecionadas usam barra reta; a prescrição exige barra W. |
| `ex-rosca-alternada-halteres` | Rosca Alternada com Halteres com Supinação | aprovado | `biceps/dumbbell-alternate-biceps-curl` | Rosca alternada em pé, halteres saem em pegada neutra e supinam durante a flexão de cotovelo. |
| `ex-rosca-martelo-halteres` | Rosca Martelo com Halteres | aprovado | `biceps/dumbbell-hammer-curl-v-2` | Rosca martelo bilateral simultânea em pé, pegada neutra mantida; candidato principal alternado descartado. |
| `ex-rosca-scott-barra` | Rosca Scott com Barra W | aprovado | `biceps/ez-barbell-close-grip-preacher-curl` | Banco Scott, braços apoiados e flexão bilateral com barra EZ/W; candidato de barra reta descartado. |
| `ex-rosca-concentrada` | Rosca Concentrada Unilateral com Halter | aprovado | `biceps/dumbbell-concentration-curl` | Rosca concentrada sentada com halter, cotovelo apoiado na face interna da coxa; execução unilateral. |
| `ex-triceps-corda` | Tríceps na Polia com Corda | aprovado | `triceps/cable-pushdown-with-rope-attachment` | Extensão bilateral de cotovelos para baixo com corda na polia alta, braços junto às costelas; candidato acima da cabeça descartado. |
| `ex-triceps-testa-barra` | Tríceps Testa Deitado com Barra W | rejeitado | — | O tríceps testa inspecionado utiliza barra reta; a prescrição exige barra W. |
| `ex-triceps-frances-halter` | Tríceps Francês Sentado com Halter | aprovado | `triceps/dumbbell-seated-triceps-extension` | Sentado, um halter sustentado por duas mãos atrás/acima da cabeça e extensão bilateral dos cotovelos. |
| `ex-triceps-banco` | Mergulho no Banco (Tríceps Dips) | aprovado | `triceps/bench-dip-on-floor` | Mãos na borda do banco, pernas estendidas à frente e descida do quadril; candidatos em paralelas e no chão descartados. |
| `ex-flexao-diamante` | Flexão Fechada no Solo (Diamante) | aprovado | `triceps/diamond-push-up` | Flexão no solo com polegares e indicadores unidos em diamante; corpo alinhado e apoio nos pés. |
| `ex-rosca-punho-barra` | Rosca Punho (Flexão de Punho) com Barra | aprovado | `forearms/barbell-wrist-curl` | Antebraços apoiados no banco, barra com palmas para cima e flexão bilateral dos punhos. |
| `ex-rosca-punho-invertida` | Rosca Punho Inversa (Extensão de Punho) com Barra | aprovado | `forearms/barbell-reverse-wrist-curl` | Antebraços apoiados, barra com palmas para baixo e extensão bilateral dos punhos; candidato de flexão descartado. |
| `ex-farmers-walk` | Caminhada do Fazendeiro (Farmer's Walk) | rejeitado | — | Os candidatos mostram movimentos de punho/antebraço, sem caminhada carregando halteres. |
| `ex-crunch-solo` | Abdominal Tradicional (Crunch) no Solo | aprovado | `abs/crunch-floor` | Crunch no solo com joelhos dobrados e elevação das escápulas por flexão do tronco. |
| `ex-abdominal-infra-solo` | Abdominal Infra no Solo com Elevação de Pernas | rejeitado | — | Os candidatos mostram crunch reverso com joelhos dobrados ou elevação suspensa; não a elevação de pernas estendidas deitado no solo. |
| `ex-abdominal-obliquo-solo` | Abdominal Oblíquo Cruzado no Solo | rejeitado | — | Não há a posição prescrita de uma perna cruzada sobre o joelho oposto; a alternativa alterna a elevação dos joelhos. |
| `ex-prancha-isometrica` | Prancha Ventral Isométrica no Solo | rejeitado | — | Os candidatos mostram prancha dinâmica ou com carga adicional, diferentes da prancha isométrica sem carga. |
| `ex-prancha-lateral` | Prancha Lateral Isométrica | pendente | — | Há apoio lateral, mas as alternativas mostram elevação dinâmica da pelve ou transição, sem confirmar a sustentação isométrica prescrita. |
| `ex-roda-abdominal` | Abdominal com Roda / Rolinho (Ab Wheel Rollout) | aprovado | `abs/wheel-rollerout` | Ab wheel ajoelhado, roda avança com extensão do corpo e retorna; candidato suspenso descartado. |
| `ex-abdominal-polia-corda` | Abdominal na Polia Alta com Corda (Cable Crunch) | aprovado | `abs/cable-kneeling-crunch` | Crunch ajoelhado frente à polia alta, corda próxima à cabeça e flexão do tronco aproximando cotovelos e joelhos. |
| `ex-dead-bug` | Deadbug (Inseto Morto) para Ativação de Core | aprovado | `abs/dead-bug` | Decúbito dorsal, extensão de braço e perna contralaterais com retorno alternado; dead bug sem carga. |
| `ex-superman-solo` | Superman Isométrico no Solo | rejeitado | — | As extensões inspecionadas utilizam bola/apoio; não há Superman isométrico no solo com braços e pernas elevados. |
| `ex-agachamento-smith` | Agachamento no Smith Machine | aprovado | `quads/smith-chair-squat` | Agachamento bilateral no Smith com pés à frente da barra guiada e descida até aproximadamente 90 graus. |
| `ex-leg-press-horizontal` | Leg Press Horizontal | rejeitado | — | O leg press mostrado tem plataforma inclinada e alternância das pernas; não o horizontal bilateral prescrito. |
| `ex-agachamento-bulgaro` | Agachamento Búlgaro com Halteres | aprovado | `quads/dumbbell-single-leg-split-squat` | Agachamento búlgaro com halteres, pé posterior no banco e flexão predominante da perna dianteira. |
| `ex-avanco-passada` | Avanço / Passada Caminhando com Halteres | rejeitado | — | As sugestões mostram subida em banco ou agachamento, sem passada caminhando com halteres. |
| `ex-agachamento-sissy` | Agachamento Sissy (Sissy Squat) no Banco | rejeitado | — | O sissy squat mostrado não possui o banco com fixação dos tornozelos prescrito. |
| `ex-cadeira-flexora` | Cadeira Flexora Sentada | aprovado | `hamstrings/lever-seated-leg-curl` | Flexora sentada com apoio sobre as coxas e rolo posterior; flexão bilateral dos joelhos. |
| `ex-flexora-em-pe` | Flexora em Pé Unilateral na Máquina / Cabo | rejeitado | — | A máquina inspecionada sustenta um joelho ajoelhado; não a posição em pé da cadeira flexora vertical prescrita. |
| `ex-nordic-hamstring` | Flexão Nórdica Excêntrica (Nordic Hamstring Curl) | pendente | — | As sugestões são alongamentos. A alternativa Nordic/inverse curl não permite confirmar a assistência e o controle exigidos nesta variante. |
| `ex-elevacao-pelvica-barra` | Elevação Pélvica com Barra no Banco (Hip Thrust) | rejeitado | — | Levantamento terra, avanço e ponte no chão não representam hip thrust com barra e escápulas no banco. |
| `ex-elevacao-pelvica-unilateral` | Elevação Pélvica Unilateral no Solo / Banco | rejeitado | — | As sugestões são snatch/terra; a ponte unilateral adicional não usa o halter previsto no equipamento do Zemda. |
| `ex-gluteo-cabo-coice` | Glúteo Coice na Polia Baixa (Cable Kickback) | pendente | — | A sugestão é levantamento terra. Na extensão de quadril adicional não foi confirmada a trajetória de 30 graus para fora prescrita. |
| `ex-gluteo-caneleira-4-apoios` | Glúteo 4 Apoios com Caneleira no Solo | rejeitado | — | Ponte e alongamento sentado não representam coice em quatro apoios com caneleira. |
| `ex-aducao-polia-caneleira` | Adução de Quadril na Polia Baixa com Caneleira | aprovado | `adductors/cable-hip-adduction` | Adução unilateral do quadril em pé junto à polia baixa, cabo na perna proximal e cruzamento à frente. |
| `ex-agachamento-sumo` | Agachamento Sumô com Halter no Step | rejeitado | — | Os candidatos são alongamentos de adutores, sem agachamento sumô com halter entre plataformas. |
| `ex-abducao-polia-baixa` | Abdução de Quadril na Polia Baixa | rejeitado | — | Máquina sentada e abdução deitado não correspondem à abdução em pé na polia. |
| `ex-abducao-solo-elastico` | Abdução de Quadril no Solo com Mini-Band (Clamshell / Ostra) | rejeitado | — | Abdução sentada com banda ou com perna estendida difere da concha deitada com joelhos flexionados. |
| `ex-gemeos-smith` | Gêmeos em Pé no Smith Machine sobre Degrau | rejeitado | — | Os candidatos mostram dorsiflexão ou panturrilha sentada; a alternativa no Smith segura a barra nas mãos, diferente da barra nos ombros e apoio no degrau. |
| `ex-gemeos-sentado-soleo` | Gêmeos Sentado na Máquina (Foco no Sóleo) | aprovado | `calves/lever-seated-calf-raise` | Máquina de panturrilha sentada com joelhos a 90 graus e almofadas sobre as coxas; flexão plantar bilateral. |
| `ex-panturrilha-unilateral-halter` | Panturrilha Unilateral em Pé com Halter | pendente | — | A elevação unilateral é semelhante, mas não confirma o degrau, a mão de apoio e o halter do mesmo lado da perna de trabalho. |
| `ex-thruster-halteres` | Thruster (Agachamento + Desenvolvimento) com Halteres | rejeitado | — | Os candidatos mostram agachamento e desenvolvimento separados, sem a sequência combinada do thruster. |
| `ex-esteira-hiit` | Corrida / Caminhada Inclinada na Esteira | aprovado | `cardio/walking-on-incline-treadmill` | Caminhada em esteira inclinada, conforme variante permitida no nome do exercício; velocidade e protocolo continuam definidos pelas instruções. |
| `ex-bike-spinning` | Bicicleta Ergométrica / Spinning | aprovado | `cardio/stationary-bike-run-v-3` | Bicicleta estacionária/spinning, pessoa sentada e pedalada cíclica; máquina correta e apoio no guidão. |
| `ex-simulador-escada` | Simulador de Escada (Stairmaster) | rejeitado | — | Bicicleta e elíptico não representam subida na máquina de escada. |
| `ex-corda-naval` | Corda Naval (Battle Rope) Ondulações | rejeitado | — | Pular corda e polichinelo não representam ondas com corda naval. |
| `ex-remo-indoor` | Remo Indoor (Ergômetro) | rejeitado | — | Bicicleta e elíptico não representam remada no ergômetro. |
| `ex-mobilidade-quadril-9090` | Mobilidade de Quadril 90/90 | rejeitado | — | O GIF mostra liberação com rolo, sem transições de quadril 90/90. |
| `ex-mobilidade-tornozelo-parede` | Mobilidade de Tornozelo contra a Parede (Dorsiflexão) | rejeitado | — | Círculos do tornozelo e alongamento de quadríceps não mostram joelho avançando até a parede com calcanhar apoiado. |
| `ex-mobilidade-toracica-4apoios` | Rotação Torácica em 4 Apoios | rejeitado | — | Crunch e rotação na bola não representam rotação torácica em quatro apoios. |
| `ex-gato-camelo` | Gato-Camelo (Cat-Cow) Mobilidade da Coluna | rejeitado | — | Alongamento assistido/rolo não representa flexão e extensão da coluna em quatro apoios (gato-camelo). |
| `ex-passagem-bacao-elastico` | Passagem de Bastão / Elástico para Ombros (Dislocates) | rejeitado | — | Desenvolvimento com elástico não representa passagem do bastão por cima e atrás da cabeça. |
| `ex-alongamento-isquiotibiais` | Alongamento Estático de Isquiotibiais (Posteriores) | rejeitado | — | Alongamento de uma perna em decúbito dorsal difere da flexão do tronco sentado com ambas as pernas estendidas. |
| `ex-alongamento-quadriceps` | Alongamento em Pé de Quadríceps | rejeitado | — | Alongamento em prono/quatro apoios difere do alongamento de quadríceps em pé. |
| `ex-alongamento-peitoral-parede` | Alongamento de Peitoral no Batente / Parede | rejeitado | — | Alongamento assistido e abertura dinâmica dos braços não reproduzem o apoio unilateral do braço na parede. |
| `ex-alongamento-gluteo-piriforme` | Alongamento de Glúteo e Piriforme Deitado (Figura 4) | rejeitado | — | O candidato mostra alongamento sentado, enquanto o exercício exige decúbito dorsal em figura quatro. |
| `ex-alongamento-dorsal-barra` | Alongamento Suspenso de Grande Dorsal na Barra | rejeitado | — | Apoio no banco e alongamento ajoelhado não representam suspensão na barra. |
| `ex-supino-maquina` | Supino na Máquina Convergente | aprovado | `pectorals/lever-chest-press` | Máquina convergente de supino, costas apoiadas e empurrada bilateral das manoplas à frente do peito. |
| `ex-supino-neutro-halteres` | Supino com Halteres em Pegada Neutra | rejeitado | — | A pegada mostrada no supino é pronada; o exercício exige pegada neutra. |
| `ex-supino-solo-halteres` | Supino no Solo com Halteres (Floor Press) | rejeitado | — | O supino é realizado no banco; o floor press exige braços encontrando o chão. |
| `ex-flexao-inclinada` | Flexão com Mãos Elevadas | aprovado | `pectorals/incline-push-up` | Flexão inclinada com mãos em apoio firme elevado e pés no chão; corpo alinhado. Apoio em plataforma firme equivalente ao banco. |
| `ex-flexao-declinada` | Flexão com Pés Elevados | aprovado | `pectorals/decline-push-up` | Flexão declinada com pés no banco e mãos no solo; descida do peito e extensão dos braços. |
| `ex-supino-elastico` | Press de Peito com Elástico | rejeitado | — | Os candidatos estão deitados/sentados, diferentes do chest press em pé com elástico. |
| `ex-crucifixo-unilateral-cabo` | Crucifixo Unilateral no Cabo | rejeitado | — | Crucifixo unilateral deitado em banco declinado difere do crucifixo unilateral em pé na polia. |
| `ex-remada-peito-apoiado` | Remada com Halteres e Peito Apoiado | aprovado | `upper-back/dumbbell-incline-row` | Remada com dois halteres e peito apoiado em banco inclinado; cotovelos tracionam para as costelas. |
| `ex-remada-unilateral-cabo` | Remada Unilateral na Polia | aprovado | `upper-back/cable-seated-one-arm-alternate-row` | Sentado de frente para a polia, manopla unilateral tracionada à lateral do tronco; corpo sem rotação acentuada. |
| `ex-remada-elastico` | Remada Sentada com Elástico | aprovado | `upper-back/resistance-band-seated-straight-back-row` | Remada bilateral com elástico, sentado com encosto e resistência fixada junto aos pés; tronco estável. |
| `ex-puxada-unilateral` | Puxada Unilateral na Polia Alta | rejeitado | — | A puxada unilateral mostrada é em pé; não confirma a posição sentada/ajoelhada prescrita. |
| `ex-barra-fixa-assistida` | Barra Fixa na Máquina Assistida | aprovado | `lats/lever-assisted-chin-up` | Máquina de barra fixa assistida, joelhos apoiados na plataforma móvel e tração bilateral do corpo. |
| `ex-desenvolvimento-arnold` | Desenvolvimento Arnold | aprovado | `delts/dumbbell-arnold-press` | Arnold press sentado: halteres à frente, rotação das palmas durante elevação bilateral e retorno. |
| `ex-landmine-press` | Press Unilateral no Landmine | rejeitado | — | Snatch e desenvolvimento com halteres não representam pressão landmine em meio ajoelhado. |
| `ex-crucifixo-inverso-cabo` | Crucifixo Inverso no Cabo | aprovado | `delts/cable-cross-over-revers-fly` | Crucifixo inverso com cabos cruzados e tronco inclinado; abertura bilateral com cotovelos semiflexionados. |
| `ex-rotacao-externa-elastico` | Rotação Externa de Ombro com Elástico | rejeitado | — | Desenvolvimento com banda não representa rotação externa com cotovelo junto ao tronco. |
| `ex-rotacao-interna-cabo` | Rotação Interna de Ombro na Polia | pendente | — | A rotação interna mostrada é unilateral sentada; não foi possível confirmar os apoios e a execução previstos no registro do Zemda. |
| `ex-elevacao-y-banco` | Elevação em Y no Banco Inclinado | aprovado | `upper-back/dumbbell-incline-y-raise` | Peito apoiado no banco inclinado, polegares elevados e braços sobem em Y; não confundir com elevação frontal ou em T. |
| `ex-serratus-punch` | Protração Escapular com Halteres | rejeitado | — | Elevação e Arnold press não representam protração escapular em decúbito dorsal (serratus punch). |
| `ex-rosca-scott-maquina` | Rosca Scott na Máquina | aprovado | `biceps/lever-preacher-curl` | Rosca Scott na máquina com braços apoiados e flexão bilateral dos cotovelos. |
| `ex-rosca-bayesian` | Rosca Unilateral no Cabo Atrás do Corpo | pendente | — | O cabo do curl inspecionado fica à frente/ao lado; não foi confirmada a posição atrás do tronco da rosca Bayesian. |
| `ex-rosca-elastico` | Rosca com Elástico | rejeitado | — | As sugestões são curl concentrado ou alternado; não o curl bilateral simultâneo com elástico. |
| `ex-rosca-inversa-barra` | Rosca Inversa com Barra | aprovado | `biceps/barbell-reverse-curl` | Rosca inversa em pé com barra pronada, movimento dos cotovelos; candidatos de punho descartados. |
| `ex-pronacao-supinacao` | Pronação e Supinação com Halter | rejeitado | — | Flexão dos dedos e pronação deitado não correspondem à pronação/supinação sentado com antebraço apoiado. |
| `ex-desvio-radial` | Desvio Radial do Punho com Halter | rejeitado | — | Os candidatos fazem flexão/extensão de punho, sem desvio radial com antebraço neutro. |
| `ex-triceps-unilateral-cabo` | Extensão Unilateral de Tríceps na Polia | aprovado | `triceps/cable-one-arm-tricep-pushdown` | Extensão unilateral para baixo na polia alta com cotovelo junto ao tronco; variante acima da cabeça descartada. |
| `ex-triceps-acima-cabo` | Extensão de Tríceps Acima da Cabeça no Cabo | aprovado | `triceps/cable-overhead-triceps-extension-rope-attachment` | De costas à polia, corda sustentada pelas duas mãos e braços elevados; extensão bilateral acima da cabeça. |
| `ex-supino-fechado` | Supino com Pegada Fechada | aprovado | `triceps/barbell-close-grip-bench-press` | Supino reto com barra e pegada fechada aproximadamente na largura dos ombros; cotovelos próximos ao corpo. |
| `ex-triceps-elastico` | Extensão de Tríceps com Elástico Alto | rejeitado | — | A extensão com elástico mostrada tem ancoragem horizontal, diferente da ancoragem alta para pushdown. |
| `ex-pallof-press` | Pallof Press na Polia | rejeitado | — | Há rotação ativa do tronco ou uso de elástico; não a anti-rotação estática no cabo do Pallof press. |
| `ex-woodchop-cabo` | Rotação Diagonal no Cabo (Woodchop) | rejeitado | — | Rotação horizontal e judo flip não correspondem à trajetória diagonal de cima para baixo do wood chop. |
| `ex-bird-dog` | Bird Dog em Quatro Apoios | rejeitado | — | Crunch e inclinação lateral não representam extensão contralateral em quatro apoios (bird dog). |
| `ex-prancha-toque-ombro` | Prancha com Toque nos Ombros | aprovado | `abs/shoulder-tap` | Prancha alta, pés afastados e toques alternados das mãos nos ombros opostos; joelhos sem apoio. |
| `ex-hollow-hold` | Hollow Hold | rejeitado | — | Crunch e inclinação lateral não representam a sustentação de hollow body. |
| `ex-reverse-crunch` | Crunch Reverso com Elevação da Pelve | aprovado | `abs/reverse-crunch` | Crunch reverso no solo com joelhos dobrados e enrolamento da pelve sem carga. |
| `ex-suitcase-carry` | Caminhada com Carga Unilateral | rejeitado | — | Abdominal e slam não representam caminhada unilateral carregando kettlebell. |
| `ex-stir-pot` | Prancha Circular na Bola | rejeitado | — | Prancha sem bola não representa círculos dos antebraços sobre bola suíça. |
| `ex-extensao-quadril-banco` | Extensão de Quadril no Banco Romano | rejeitado | — | Máquina de extensão lombar/bola não representa a extensão de quadril no banco romano. |
| `ex-hip-hinge-bastao` | Dobradiça de Quadril com Bastão | rejeitado | — | Bola e terra com banda não mostram o treino de dobradiça do quadril com bastão de referência. |
| `ex-agachamento-caixa` | Agachamento na Caixa | aprovado | `quads/barbell-bench-squat` | Agachamento com barra nas costas e contato controlado em apoio firme; o banco faz o papel de apoio da caixa sem alterar o movimento. |
| `ex-step-up` | Subida no Banco com Halteres | aprovado | `glutes/dumbbell-step-up` | Subida no banco com halteres, um pé inteiro apoiado, extensão da perna e descida controlada; sem avanço adicional. |
| `ex-avanco-reverso` | Avanço Reverso com Halteres | rejeitado | — | Subida no banco e agachamento não representam avanço para trás. |
| `ex-extensora-unilateral` | Cadeira Extensora Unilateral | rejeitado | — | A extensão mostrada é bilateral ou um leg press; não a cadeira extensora unilateral. |
| `ex-legpress-unilateral` | Leg Press Unilateral | rejeitado | — | O leg press alternado mantém os dois pés na plataforma; não a execução contínua de uma perna prescrita. |
| `ex-agachamento-peso-corporal` | Agachamento com Peso Corporal | aprovado | `abs/potty-squat` | Agachamento livre sem carga, flexão bilateral de quadril e joelhos com pés apoiados; encontrado entre candidatos de mobilidade. |
| `ex-wall-sit` | Agachamento Isométrico na Parede | rejeitado | — | Sissy squat e squat jerk não representam agachamento isométrico com costas na parede. |
| `ex-rdl-unilateral` | Terra Romeno Unilateral com Halter | aprovado | `glutes/dumbbell-single-leg-deadlift` | Terra romeno em apoio unipodal com halteres; perna livre estende para trás e tronco inclina pelo quadril. |
| `ex-flexora-bola` | Flexão de Joelhos na Bola Suíça | rejeitado | — | Alongamento e flexão em pé não representam flexão dos joelhos com calcanhares na bola suíça. |
| `ex-flexora-deslizante` | Flexão de Joelhos com Discos Deslizantes | rejeitado | — | Alongamento e Nordic não representam flexão dos joelhos deitado com discos deslizantes. |
| `ex-flexora-elastico` | Flexão de Joelhos com Elástico | rejeitado | — | Alongamento e Nordic não representam flexão dos joelhos em prono com elástico. |
| `ex-ponte-gluteos-solo` | Ponte de Glúteos no Solo | aprovado | `glutes/low-glute-bridge-on-floor` | Ponte bilateral no solo sem carga, joelhos dobrados, elevação e retorno da pelve; marcha e barra descartadas. |
| `ex-hip-thrust-maquina` | Elevação Pélvica na Máquina | rejeitado | — | Terra na máquina e extensão unilateral de quadril diferem do hip thrust na máquina. |
| `ex-abducao-decubito` | Abdução de Quadril em Decúbito Lateral | aprovado | `abductors/side-hip-abduction` | Abdução de quadril em decúbito lateral, elevação da perna superior e pelve apoiada. Instruções reais prevalecem sobre campo bilateral genérico. |
| `ex-caminhada-lateral-elastico` | Caminhada Lateral com Miniband | rejeitado | — | Abdução sentada/deitada não representa passos laterais mantendo tensão na miniband. |
| `ex-clam-shell` | Concha Lateral com Miniband | rejeitado | — | As sugestões não mostram concha lateral com joelhos flexionados e miniband. |
| `ex-aducao-decubito` | Adução de Quadril em Decúbito Lateral | aprovado | `adductors/side-lying-hip-adduction-male` | Adução em decúbito lateral, perna superior cruzada à frente e elevação da perna inferior estendida. |
| `ex-copenhagen-curto` | Prancha Copenhagen com Joelho Apoiado | rejeitado | — | O Copenhagen mostrado apoia o pé com perna estendida; o Zemda prescreve apoio do joelho (alavanca curta). |
| `ex-panturrilha-em-pe-maquina` | Panturrilha em Pé na Máquina | aprovado | `calves/lever-standing-calf-raise` | Panturrilha na máquina em pé, ombros sob almofadas, antepés na plataforma e flexão plantar bilateral. |
| `ex-panturrilha-sentado-halter` | Panturrilha Sentado com Halter | aprovado | `calves/dumbbell-seated-calf-raise` | Panturrilha sentada com dois halteres sobre as coxas e joelhos dobrados; flexão plantar bilateral. |
| `ex-tibial-anterior-parede` | Elevação dos Antepés na Parede | rejeitado | — | As sugestões fazem flexão plantar, movimento oposto à dorsiflexão do tibial anterior encostado na parede. |
| `ex-turkish-getup` | Levantamento Turco com Kettlebell | rejeitado | — | O Turkish get-up mostrado passa por agachamento; não confirma a sequência até meio ajoelhado prescrita. |
| `ex-caminhada-livre` | Caminhada em Solo | rejeitado | — | Bicicletas não representam caminhada livre. |
| `ex-air-bike` | Bicicleta de Ar (Air Bike) | pendente | — | As bicicletas sugeridas não confirmam o trabalho coordenado de braços em alavancas móveis e pernas de uma air bike. |
| `ex-marcha-estacionaria` | Marcha Estacionária | rejeitado | — | Saltos afastando pernas e passos para frente/trás não representam marcha estacionária. |
| `ex-polichinelo` | Polichinelo | aprovado | `cardio/astride-jumps-male` | Polichinelo com pequenos saltos, abertura das pernas e elevação simultânea dos braços; jack burpee e salto explosivo descartados. |
| `ex-step-jack` | Polichinelo sem Salto (Step Jack) | rejeitado | — | Burpee e saltos de esqui para frente/trás não representam step jack lateral sem salto. |
| `ex-bear-crawl` | Deslocamento em Urso (Bear Crawl) | pendente | — | O bear crawl mostrado tem quadril alto e pernas mais estendidas; não confirma a marcha curta com joelhos próximos ao chão prescrita. |
| `ex-slam-ball` | Arremesso de Medicine Ball ao Solo | aprovado | `upper-back/medicine-ball-overhead-slam` | Medicine ball elevada com ambas as mãos e arremessada ao solo à frente com flexão do quadril/joelhos. |
| `ex-sled-push` | Empurrada de Trenó | rejeitado | — | Flexões e corrida livre não representam empurrar trenó com carga. |
| `ex-aquecimento-marcha-bracos` | Aquecimento com Marcha e Círculos de Braços | rejeitado | — | Ponte e marcha com apoio na parede não incluem a marcha livre combinada a círculos dos braços. |
| `ex-aquecimento-agachamento-alcance` | Aquecimento com Agachamento e Alcance | rejeitado | — | Os agachamentos mostrados não incluem o alcance dos braços acima da cabeça. |
| `ex-aquecimento-step-toque` | Aquecimento com Passo Lateral e Toque | rejeitado | — | Puxada e alongamento lateral não representam passos laterais de aquecimento (step touch). |
| `ex-along-cervical-lateral` | Alongamento Cervical Lateral | rejeitado | — | O alongamento cervical mostrado é em pé; o exercício prescreve posição sentada. |
| `ex-along-trapezio-superior` | Alongamento de Trapézio Superior com Apoio | rejeitado | — | O candidato em pé não reproduz posição sentada com a mão prendendo a borda da cadeira. |
| `ex-along-elevador-escapula` | Alongamento do Elevador da Escápula | rejeitado | — | A inclinação lateral do pescoço não mostra a rotação para a axila prescrita para o levantador da escápula. |
| `ex-along-cervical-rotacao` | Rotação Cervical Leve Sustentada | rejeitado | — | Desenvolvimento e rotação na bola não representam rotação cervical sustentada. |
| `ex-along-biceps-parede` | Alongamento de Bíceps na Parede | rejeitado | — | Puxada para bíceps e flexão de pernas não representam alongamento de bíceps apoiado na parede. |
| `ex-along-flexores-punho` | Alongamento de Flexores de Punho | pendente | — | O apoio e a orientação da palma no alongamento lateral do punho não confirmam extensão assistida com palma para cima. |
| `ex-along-extensores-punho` | Alongamento de Extensores de Punho | pendente | — | O alongamento lateral do punho não confirma flexão assistida com palma para baixo para os extensores. |
| `ex-along-peitoral-batente-bilateral` | Alongamento Bilateral de Peitoral no Batente | rejeitado | — | Alongamento assistido e abertura dinâmica dos braços não mostram apoio bilateral no batente da porta. |
| `ex-along-abertura-toracica-rolo` | Abertura Torácica Deitado sobre Rolo Longitudinal | rejeitado | — | Alongamento assistido/bola não representa abertura peitoral deitado sobre rolo longitudinal. |
| `ex-along-dorsal-banco` | Alongamento de Grande Dorsal no Banco | rejeitado | — | O apoio no banco é em pé com pernas estendidas, ou há quatro apoios sem banco; não a posição ajoelhada com cotovelos no banco. |
| `ex-along-crianca` | Posição da Criança | rejeitado | — | Apoio em pé no banco e bola não mostram a posição da criança com quadril próximo aos calcanhares. |
| `ex-along-thread-needle` | Alongamento Thread the Needle | rejeitado | — | As sugestões não passam um braço por baixo do outro em quatro apoios (agulha). |
| `ex-along-flexor-quadril-avanco` | Alongamento de Iliopsoas em Avanço Ajoelhado | rejeitado | — | Avanço com carga e alongamento do tornozelo não representam alongamento do flexor do quadril em meio ajoelhado sem carga. |
| `ex-along-flexor-quadril-banco` | Alongamento de Flexores do Quadril na Borda do Banco | rejeitado | — | Liberação com rolo/bola não representa alongamento Thomas na borda do banco. |
| `ex-along-gluteo-sentado` | Alongamento de Glúteo Sentado | aprovado | `glutes/seated-piriformis-stretch` | Sentado com tornozelo sobre a coxa oposta, inclinação anterior do tronco; glúteo/piriforme em figura quatro. |
| `ex-along-joelho-peito` | Alongamento com Joelho ao Peito | rejeitado | — | Rotação iron cross e frog dinâmico não representam puxar um joelho ao peito em decúbito dorsal. |
| `ex-along-quadril-9090-estatico` | Alongamento de Quadril 90/90 Estático | rejeitado | — | Liberação com rolo não representa a posição estática do quadril 90/90. |
| `ex-along-posterior-em-pe` | Alongamento de Posteriores em Pé com Apoio | rejeitado | — | Alongamento deitado não representa alongamento em pé com calcanhar elevado numa plataforma. |
| `ex-along-posterior-unilateral-sentado` | Alongamento Unilateral de Posteriores Sentado | rejeitado | — | Alongamento deitado difere do alongamento unilateral sentado. |
| `ex-along-posterior-faixa` | Alongamento de Posteriores Deitado com Faixa | rejeitado | — | A mobilização da perna com as mãos não usa a faixa prescrita para o alongamento posterior em decúbito dorsal. |
| `ex-along-quadriceps-lateral` | Alongamento de Quadríceps em Decúbito Lateral | pendente | — | A sequência inspecionada alterna prono/lateral, sem confirmar a sustentação lateral e a pegada no tornozelo prescritas. |
| `ex-along-quadriceps-ajoelhado` | Alongamento de Quadríceps Ajoelhado com Apoio | rejeitado | — | Prono/quatro apoios não representam a posição ajoelhada com o pé posterior apoiado no banco. |
| `ex-along-adutores-borboleta` | Alongamento de Adutores Borboleta | aprovado | `adductors/butterfly-yoga-pose` | Borboleta sentada com plantas dos pés unidas e joelhos abertos, mãos nos pés; sem pressão manual nos joelhos. |
| `ex-along-adutores-abertura` | Alongamento de Adutores Sentado em Abertura | pendente | — | A alternativa sentada com pernas afastadas inclui deslocamentos laterais; não foi confirmada a sustentação central prescrita. |
| `ex-along-adutores-frog` | Alongamento de Adutores Frog Stretch | rejeitado | — | Alongamento assistido, borboleta e rocking frog dinâmico não representam a sustentação do frog stretch estático. |
| `ex-along-soleo-parede` | Alongamento de Sóleo na Parede | rejeitado | — | Alongamento fibular e círculos do joelho não mostram alongamento do sóleo com joelho flexionado junto à parede. |
| `ex-along-panturrilha-degrau` | Alongamento de Panturrilha no Degrau | rejeitado | — | Elevações dinâmicas e alongamento deitado com faixa não representam sustentação do calcanhar abaixo do degrau. |
| `ex-along-tornozelo-dorsiflexao` | Alongamento de Tornozelo em Dorsiflexão Sustentada | rejeitado | — | Alongamento fibular e círculos do joelho não representam dorsiflexão ajoelhado com calcanhar apoiado. |
| `ex-along-tronco-extensao` | Alongamento de Tronco em Apoio nos Antebraços | rejeitado | — | Flexão de coluna sentada e rolo não representam esfinge em prono apoiada nos antebraços. |
| `ex-along-tronco-flexao` | Alongamento de Tronco com Joelhos ao Peito | rejeitado | — | Flexão sentada e rolo não representam puxar ambos os joelhos ao peito em decúbito dorsal. |
| `ex-along-rotacao-deitado` | Alongamento em Rotação de Tronco Deitado | rejeitado | — | Flexão sentada, rolo e iron cross com pernas estendidas não reproduzem rotação supina com ambos os joelhos flexionados. |
| `ex-along-global-parede` | Alongamento Global com Mãos na Parede | rejeitado | — | Alongamento isolado posterior/corredor não representa alongamento global com pernas apoiadas na parede. |
| `ex-along-sequencia-pos-treino` | Sequência Global de Alongamentos Pós-Treino | rejeitado | — | Alongamentos assistidos isolados não reproduzem a sequência global posterior prescrita. |
| `ex-along-balanco-perna-frontal` | Alongamento Dinâmico com Balanço Frontal de Perna | rejeitado | — | Alongamentos estáticos não representam balanço anterior/posterior da perna. |
| `ex-along-balanco-perna-lateral` | Alongamento Dinâmico com Balanço Lateral de Perna | rejeitado | — | Alongamentos assistidos/prancha não representam balanço lateral da perna. |
| `ex-along-avanco-braco-alto` | Alongamento Dinâmico em Avanço com Braço Elevado | rejeitado | — | Avanço com carga e alongamento peitoral não representam avanço dinâmico com braço elevado. |
| `ex-along-inchworm` | Alongamento Dinâmico Inchworm | rejeitado | — | Alongamentos estáticos posteriores não incluem caminhada das mãos até a prancha (inchworm). |
| `ex-along-abraco-abertura` | Alongamento Dinâmico de Peitoral com Abertura de Braços | aprovado | `pectorals/dynamic-chest-stretch-male` | Em pé, abertura e cruzamento dinâmico dos braços à frente do peito sem carga. |
| `ex-along-calcanhar-gluteo` | Alongamento Dinâmico de Quadríceps em Marcha | rejeitado | — | Alongamentos em prono/quatro apoios não mostram caminhada dinâmica aproximando calcanhar do glúteo. |
| `ex-mob-cervical-rotacoes` | Mobilidade Cervical em Rotações | rejeitado | — | Desenvolvimento/alongamento de quadríceps não representam rotação cervical ativa. |
| `ex-mob-cervical-flexao` | Mobilidade Cervical em Flexão e Extensão | rejeitado | — | Flexões de braços não representam flexão e extensão cervical. |
| `ex-mob-open-book` | Open Book (Abertura Torácica) | rejeitado | — | Alongamento assistido/rolo não mostra abertura torácica deitado de lado com joelhos flexionados (open book). |
| `ex-mob-extensao-toracica-rolo` | Extensão Torácica sobre Rolo | rejeitado | — | Máquina de extensão e bola não representam extensão torácica sobre rolo. |
| `ex-mob-wall-slides` | Wall Slides (Deslizamento na Parede) | rejeitado | — | Alongamento de deltoide/boxe não representa deslizamento de braços apoiados na parede. |
| `ex-mob-shoulder-cars` | Shoulder CARs (Círculos Controlados de Ombro) | rejeitado | — | Alongamento de deltoide/desenvolvimento com banda não representa círculos articulares controlados do ombro. |
| `ex-mob-scapular-cars` | Círculos Controlados de Escápula | rejeitado | — | Alongamentos de quadríceps/adutores não representam círculos articulares controlados das escápulas. |
| `ex-mob-scapular-pushup` | Flexão Escapular em Quatro Apoios | rejeitado | — | O push-up escapular inspecionado é em prancha alta; não reproduz a posição com joelhos no solo em quatro apoios. |
| `ex-mob-hip-cars` | Hip CARs (Círculos Controlados de Quadril) | rejeitado | — | Liberação com rolo não representa círculos articulares controlados do quadril. |
| `ex-mob-quadril-rotacao-prono` | Rotações de Quadril em Decúbito Ventral | rejeitado | — | Liberação com rolo não representa rotação do quadril em decúbito ventral. |
| `ex-mob-adutor-rockback` | Mobilidade de Adutores em Rock Back | rejeitado | — | Alongamentos assistidos, borboleta e frog com ambos os joelhos dobrados não mostram rockback com uma perna estendida lateralmente. |
| `ex-mob-cossack-mobilidade` | Cossack Squat de Mobilidade com Apoio | rejeitado | — | Agachamento convencional/curtsey não representa Cossack lateral com apoio. |
| `ex-mob-deep-squat-hold` | Deep Squat Hold com Apoio | pendente | — | As sugestões mostram agachamentos dinâmicos; não confirmam a sustentação profunda com apoio prescrita. |
| `ex-mob-worlds-greatest` | World's Greatest Stretch | rejeitado | — | A sequência sugerida não inclui a rotação torácica e elevação do braço do World's Greatest Stretch. |
| `ex-mob-hip-flexor-mobilization` | Mobilização de Flexores do Quadril | rejeitado | — | Bola e alongamento de quadríceps em prono não representam mobilização dinâmica do flexor do quadril ajoelhado. |
| `ex-mob-tornozelo-circulos` | Círculos de Tornozelo | rejeitado | — | Os círculos do tornozelo mostrados são em pé com ponta do pé tocando o solo; o Zemda prescreve sentado com pé suspenso. |
| `ex-mob-joelho-flexao-deslizante` | Flexão e Extensão de Joelho com Deslizamento | rejeitado | — | Flexões de braços não representam deslizamento do calcanhar para mobilidade do joelho. |
| `ex-mob-cadeia-posterior-dinamica` | Dobradiça de Quadril Dinâmica sem Carga | rejeitado | — | Alongamento estático sentado/na bola não representa dobradiça dinâmica de quadril em pé sem carga. |
| `ex-mob-punho-quatro-apoios` | Mobilidade de Punhos em Quatro Apoios | rejeitado | — | Alongamentos assistidos de quadríceps/adutores não representam mobilidade de punhos em quatro apoios. |
| `ex-mob-transicao-ajoelhado-agachamento` | Transição de Meio-Ajoelhado para Agachamento | rejeitado | — | Agachamento convencional/curtsey não representa transição de meio ajoelhado para agachamento com apoio. |

## Lista completa dos 140 exercícios que continuam sem GIF

| zemda_id | Exercício | Resultado |
|---|---|---|
| `ex-supino-inclinado-halteres` | Supino Inclinado com Halteres | pendente |
| `ex-crossover-media` | Crossover na Polia Média | rejeitado |
| `ex-crossover-baixa` | Crossover na Polia Baixa | pendente |
| `ex-pulldown-corda` | Pulldown na Polia Alta com Corda / Barra | pendente |
| `ex-remada-alta-barra` | Remada Alta com Barra W | rejeitado |
| `ex-triceps-testa-barra` | Tríceps Testa Deitado com Barra W | rejeitado |
| `ex-farmers-walk` | Caminhada do Fazendeiro (Farmer's Walk) | rejeitado |
| `ex-abdominal-infra-solo` | Abdominal Infra no Solo com Elevação de Pernas | rejeitado |
| `ex-abdominal-obliquo-solo` | Abdominal Oblíquo Cruzado no Solo | rejeitado |
| `ex-prancha-isometrica` | Prancha Ventral Isométrica no Solo | rejeitado |
| `ex-prancha-lateral` | Prancha Lateral Isométrica | pendente |
| `ex-superman-solo` | Superman Isométrico no Solo | rejeitado |
| `ex-leg-press-horizontal` | Leg Press Horizontal | rejeitado |
| `ex-avanco-passada` | Avanço / Passada Caminhando com Halteres | rejeitado |
| `ex-agachamento-sissy` | Agachamento Sissy (Sissy Squat) no Banco | rejeitado |
| `ex-flexora-em-pe` | Flexora em Pé Unilateral na Máquina / Cabo | rejeitado |
| `ex-nordic-hamstring` | Flexão Nórdica Excêntrica (Nordic Hamstring Curl) | pendente |
| `ex-elevacao-pelvica-barra` | Elevação Pélvica com Barra no Banco (Hip Thrust) | rejeitado |
| `ex-elevacao-pelvica-unilateral` | Elevação Pélvica Unilateral no Solo / Banco | rejeitado |
| `ex-gluteo-cabo-coice` | Glúteo Coice na Polia Baixa (Cable Kickback) | pendente |
| `ex-gluteo-caneleira-4-apoios` | Glúteo 4 Apoios com Caneleira no Solo | rejeitado |
| `ex-agachamento-sumo` | Agachamento Sumô com Halter no Step | rejeitado |
| `ex-abducao-polia-baixa` | Abdução de Quadril na Polia Baixa | rejeitado |
| `ex-abducao-solo-elastico` | Abdução de Quadril no Solo com Mini-Band (Clamshell / Ostra) | rejeitado |
| `ex-gemeos-smith` | Gêmeos em Pé no Smith Machine sobre Degrau | rejeitado |
| `ex-panturrilha-unilateral-halter` | Panturrilha Unilateral em Pé com Halter | pendente |
| `ex-thruster-halteres` | Thruster (Agachamento + Desenvolvimento) com Halteres | rejeitado |
| `ex-simulador-escada` | Simulador de Escada (Stairmaster) | rejeitado |
| `ex-corda-naval` | Corda Naval (Battle Rope) Ondulações | rejeitado |
| `ex-remo-indoor` | Remo Indoor (Ergômetro) | rejeitado |
| `ex-mobilidade-quadril-9090` | Mobilidade de Quadril 90/90 | rejeitado |
| `ex-mobilidade-tornozelo-parede` | Mobilidade de Tornozelo contra a Parede (Dorsiflexão) | rejeitado |
| `ex-mobilidade-toracica-4apoios` | Rotação Torácica em 4 Apoios | rejeitado |
| `ex-gato-camelo` | Gato-Camelo (Cat-Cow) Mobilidade da Coluna | rejeitado |
| `ex-passagem-bacao-elastico` | Passagem de Bastão / Elástico para Ombros (Dislocates) | rejeitado |
| `ex-alongamento-isquiotibiais` | Alongamento Estático de Isquiotibiais (Posteriores) | rejeitado |
| `ex-alongamento-quadriceps` | Alongamento em Pé de Quadríceps | rejeitado |
| `ex-alongamento-peitoral-parede` | Alongamento de Peitoral no Batente / Parede | rejeitado |
| `ex-alongamento-gluteo-piriforme` | Alongamento de Glúteo e Piriforme Deitado (Figura 4) | rejeitado |
| `ex-alongamento-dorsal-barra` | Alongamento Suspenso de Grande Dorsal na Barra | rejeitado |
| `ex-supino-neutro-halteres` | Supino com Halteres em Pegada Neutra | rejeitado |
| `ex-supino-solo-halteres` | Supino no Solo com Halteres (Floor Press) | rejeitado |
| `ex-supino-elastico` | Press de Peito com Elástico | rejeitado |
| `ex-crucifixo-unilateral-cabo` | Crucifixo Unilateral no Cabo | rejeitado |
| `ex-puxada-unilateral` | Puxada Unilateral na Polia Alta | rejeitado |
| `ex-landmine-press` | Press Unilateral no Landmine | rejeitado |
| `ex-rotacao-externa-elastico` | Rotação Externa de Ombro com Elástico | rejeitado |
| `ex-rotacao-interna-cabo` | Rotação Interna de Ombro na Polia | pendente |
| `ex-serratus-punch` | Protração Escapular com Halteres | rejeitado |
| `ex-rosca-bayesian` | Rosca Unilateral no Cabo Atrás do Corpo | pendente |
| `ex-rosca-elastico` | Rosca com Elástico | rejeitado |
| `ex-pronacao-supinacao` | Pronação e Supinação com Halter | rejeitado |
| `ex-desvio-radial` | Desvio Radial do Punho com Halter | rejeitado |
| `ex-triceps-elastico` | Extensão de Tríceps com Elástico Alto | rejeitado |
| `ex-pallof-press` | Pallof Press na Polia | rejeitado |
| `ex-woodchop-cabo` | Rotação Diagonal no Cabo (Woodchop) | rejeitado |
| `ex-bird-dog` | Bird Dog em Quatro Apoios | rejeitado |
| `ex-hollow-hold` | Hollow Hold | rejeitado |
| `ex-suitcase-carry` | Caminhada com Carga Unilateral | rejeitado |
| `ex-stir-pot` | Prancha Circular na Bola | rejeitado |
| `ex-extensao-quadril-banco` | Extensão de Quadril no Banco Romano | rejeitado |
| `ex-hip-hinge-bastao` | Dobradiça de Quadril com Bastão | rejeitado |
| `ex-avanco-reverso` | Avanço Reverso com Halteres | rejeitado |
| `ex-extensora-unilateral` | Cadeira Extensora Unilateral | rejeitado |
| `ex-legpress-unilateral` | Leg Press Unilateral | rejeitado |
| `ex-wall-sit` | Agachamento Isométrico na Parede | rejeitado |
| `ex-flexora-bola` | Flexão de Joelhos na Bola Suíça | rejeitado |
| `ex-flexora-deslizante` | Flexão de Joelhos com Discos Deslizantes | rejeitado |
| `ex-flexora-elastico` | Flexão de Joelhos com Elástico | rejeitado |
| `ex-hip-thrust-maquina` | Elevação Pélvica na Máquina | rejeitado |
| `ex-caminhada-lateral-elastico` | Caminhada Lateral com Miniband | rejeitado |
| `ex-clam-shell` | Concha Lateral com Miniband | rejeitado |
| `ex-copenhagen-curto` | Prancha Copenhagen com Joelho Apoiado | rejeitado |
| `ex-tibial-anterior-parede` | Elevação dos Antepés na Parede | rejeitado |
| `ex-turkish-getup` | Levantamento Turco com Kettlebell | rejeitado |
| `ex-caminhada-livre` | Caminhada em Solo | rejeitado |
| `ex-air-bike` | Bicicleta de Ar (Air Bike) | pendente |
| `ex-marcha-estacionaria` | Marcha Estacionária | rejeitado |
| `ex-step-jack` | Polichinelo sem Salto (Step Jack) | rejeitado |
| `ex-bear-crawl` | Deslocamento em Urso (Bear Crawl) | pendente |
| `ex-sled-push` | Empurrada de Trenó | rejeitado |
| `ex-aquecimento-marcha-bracos` | Aquecimento com Marcha e Círculos de Braços | rejeitado |
| `ex-aquecimento-agachamento-alcance` | Aquecimento com Agachamento e Alcance | rejeitado |
| `ex-aquecimento-step-toque` | Aquecimento com Passo Lateral e Toque | rejeitado |
| `ex-along-cervical-lateral` | Alongamento Cervical Lateral | rejeitado |
| `ex-along-trapezio-superior` | Alongamento de Trapézio Superior com Apoio | rejeitado |
| `ex-along-elevador-escapula` | Alongamento do Elevador da Escápula | rejeitado |
| `ex-along-cervical-rotacao` | Rotação Cervical Leve Sustentada | rejeitado |
| `ex-along-biceps-parede` | Alongamento de Bíceps na Parede | rejeitado |
| `ex-along-flexores-punho` | Alongamento de Flexores de Punho | pendente |
| `ex-along-extensores-punho` | Alongamento de Extensores de Punho | pendente |
| `ex-along-peitoral-batente-bilateral` | Alongamento Bilateral de Peitoral no Batente | rejeitado |
| `ex-along-abertura-toracica-rolo` | Abertura Torácica Deitado sobre Rolo Longitudinal | rejeitado |
| `ex-along-dorsal-banco` | Alongamento de Grande Dorsal no Banco | rejeitado |
| `ex-along-crianca` | Posição da Criança | rejeitado |
| `ex-along-thread-needle` | Alongamento Thread the Needle | rejeitado |
| `ex-along-flexor-quadril-avanco` | Alongamento de Iliopsoas em Avanço Ajoelhado | rejeitado |
| `ex-along-flexor-quadril-banco` | Alongamento de Flexores do Quadril na Borda do Banco | rejeitado |
| `ex-along-joelho-peito` | Alongamento com Joelho ao Peito | rejeitado |
| `ex-along-quadril-9090-estatico` | Alongamento de Quadril 90/90 Estático | rejeitado |
| `ex-along-posterior-em-pe` | Alongamento de Posteriores em Pé com Apoio | rejeitado |
| `ex-along-posterior-unilateral-sentado` | Alongamento Unilateral de Posteriores Sentado | rejeitado |
| `ex-along-posterior-faixa` | Alongamento de Posteriores Deitado com Faixa | rejeitado |
| `ex-along-quadriceps-lateral` | Alongamento de Quadríceps em Decúbito Lateral | pendente |
| `ex-along-quadriceps-ajoelhado` | Alongamento de Quadríceps Ajoelhado com Apoio | rejeitado |
| `ex-along-adutores-abertura` | Alongamento de Adutores Sentado em Abertura | pendente |
| `ex-along-adutores-frog` | Alongamento de Adutores Frog Stretch | rejeitado |
| `ex-along-soleo-parede` | Alongamento de Sóleo na Parede | rejeitado |
| `ex-along-panturrilha-degrau` | Alongamento de Panturrilha no Degrau | rejeitado |
| `ex-along-tornozelo-dorsiflexao` | Alongamento de Tornozelo em Dorsiflexão Sustentada | rejeitado |
| `ex-along-tronco-extensao` | Alongamento de Tronco em Apoio nos Antebraços | rejeitado |
| `ex-along-tronco-flexao` | Alongamento de Tronco com Joelhos ao Peito | rejeitado |
| `ex-along-rotacao-deitado` | Alongamento em Rotação de Tronco Deitado | rejeitado |
| `ex-along-global-parede` | Alongamento Global com Mãos na Parede | rejeitado |
| `ex-along-sequencia-pos-treino` | Sequência Global de Alongamentos Pós-Treino | rejeitado |
| `ex-along-balanco-perna-frontal` | Alongamento Dinâmico com Balanço Frontal de Perna | rejeitado |
| `ex-along-balanco-perna-lateral` | Alongamento Dinâmico com Balanço Lateral de Perna | rejeitado |
| `ex-along-avanco-braco-alto` | Alongamento Dinâmico em Avanço com Braço Elevado | rejeitado |
| `ex-along-inchworm` | Alongamento Dinâmico Inchworm | rejeitado |
| `ex-along-calcanhar-gluteo` | Alongamento Dinâmico de Quadríceps em Marcha | rejeitado |
| `ex-mob-cervical-rotacoes` | Mobilidade Cervical em Rotações | rejeitado |
| `ex-mob-cervical-flexao` | Mobilidade Cervical em Flexão e Extensão | rejeitado |
| `ex-mob-open-book` | Open Book (Abertura Torácica) | rejeitado |
| `ex-mob-extensao-toracica-rolo` | Extensão Torácica sobre Rolo | rejeitado |
| `ex-mob-wall-slides` | Wall Slides (Deslizamento na Parede) | rejeitado |
| `ex-mob-shoulder-cars` | Shoulder CARs (Círculos Controlados de Ombro) | rejeitado |
| `ex-mob-scapular-cars` | Círculos Controlados de Escápula | rejeitado |
| `ex-mob-scapular-pushup` | Flexão Escapular em Quatro Apoios | rejeitado |
| `ex-mob-hip-cars` | Hip CARs (Círculos Controlados de Quadril) | rejeitado |
| `ex-mob-quadril-rotacao-prono` | Rotações de Quadril em Decúbito Ventral | rejeitado |
| `ex-mob-adutor-rockback` | Mobilidade de Adutores em Rock Back | rejeitado |
| `ex-mob-cossack-mobilidade` | Cossack Squat de Mobilidade com Apoio | rejeitado |
| `ex-mob-deep-squat-hold` | Deep Squat Hold com Apoio | pendente |
| `ex-mob-worlds-greatest` | World's Greatest Stretch | rejeitado |
| `ex-mob-hip-flexor-mobilization` | Mobilização de Flexores do Quadril | rejeitado |
| `ex-mob-tornozelo-circulos` | Círculos de Tornozelo | rejeitado |
| `ex-mob-joelho-flexao-deslizante` | Flexão e Extensão de Joelho com Deslizamento | rejeitado |
| `ex-mob-cadeia-posterior-dinamica` | Dobradiça de Quadril Dinâmica sem Carga | rejeitado |
| `ex-mob-punho-quatro-apoios` | Mobilidade de Punhos em Quatro Apoios | rejeitado |
| `ex-mob-transicao-ajoelhado-agachamento` | Transição de Meio-Ajoelhado para Agachamento | rejeitado |

## Arquivos modificados

- `backend/audit-and-sync-exercise-images.cjs`
- `backend/src/config/exercise-library.media.json`
- `backend/src/config/exercise-library.seed.ts`
- `backend/src/services/exercise-media.ts`
- `backend/test-exercise-library.cjs`
- `backend/test-exercise-media.cjs`
- `docs/exercise-media/README.md`
- `frontend/src/components/personal/ExerciseCardThumbnail.tsx`
- `frontend/src/components/personal/PersonalExerciseLibraryModal.tsx`
- `frontend/tests/exercise-library-browser.cjs`
- `frontend/tests/exercise-library.html`
- `frontend/tests/exercise-media-browser.cjs`

## Arquivos adicionados

- `docs/exercise-media/exercisegymgifs-evidence/gym-desktop-hover.png`
- `docs/exercise-media/exercisegymgifs-evidence/gym-touch-1024.png`
- `docs/exercise-media/exercisegymgifs-evidence/gym-touch-390.png`
- `docs/exercise-media/exercisegymgifs-evidence/media-details.png`
- `docs/exercise-media/exercisegymgifs-evidence/media-failures.png`
- `docs/exercise-media/exercisegymgifs-validation.json`
- `docs/exercise-media/exercisegymgifs-validation.md`
- `docs/exercise-media/zemda_exercisegymgifs_mapping_for_codex.json`
- `frontend/public/exercise-media/ex-abdominal-polia-corda.gif`
- `frontend/public/exercise-media/ex-abdominal-polia-corda.webp`
- `frontend/public/exercise-media/ex-abducao-decubito.gif`
- `frontend/public/exercise-media/ex-abducao-decubito.webp`
- `frontend/public/exercise-media/ex-aducao-decubito.gif`
- `frontend/public/exercise-media/ex-aducao-decubito.webp`
- `frontend/public/exercise-media/ex-aducao-polia-caneleira.gif`
- `frontend/public/exercise-media/ex-aducao-polia-caneleira.webp`
- `frontend/public/exercise-media/ex-agachamento-bulgaro.gif`
- `frontend/public/exercise-media/ex-agachamento-bulgaro.webp`
- `frontend/public/exercise-media/ex-agachamento-caixa.gif`
- `frontend/public/exercise-media/ex-agachamento-caixa.webp`
- `frontend/public/exercise-media/ex-agachamento-peso-corporal.gif`
- `frontend/public/exercise-media/ex-agachamento-peso-corporal.webp`
- `frontend/public/exercise-media/ex-agachamento-smith.gif`
- `frontend/public/exercise-media/ex-agachamento-smith.webp`
- `frontend/public/exercise-media/ex-along-abraco-abertura.gif`
- `frontend/public/exercise-media/ex-along-abraco-abertura.webp`
- `frontend/public/exercise-media/ex-along-adutores-borboleta.gif`
- `frontend/public/exercise-media/ex-along-adutores-borboleta.webp`
- `frontend/public/exercise-media/ex-along-gluteo-sentado.gif`
- `frontend/public/exercise-media/ex-along-gluteo-sentado.webp`
- `frontend/public/exercise-media/ex-barra-fixa-assistida.gif`
- `frontend/public/exercise-media/ex-barra-fixa-assistida.webp`
- `frontend/public/exercise-media/ex-barra-fixa-pronada.gif`
- `frontend/public/exercise-media/ex-barra-fixa-pronada.webp`
- `frontend/public/exercise-media/ex-bike-spinning.gif`
- `frontend/public/exercise-media/ex-bike-spinning.webp`
- `frontend/public/exercise-media/ex-cadeira-flexora.gif`
- `frontend/public/exercise-media/ex-cadeira-flexora.webp`
- `frontend/public/exercise-media/ex-crossover-alta.gif`
- `frontend/public/exercise-media/ex-crossover-alta.webp`
- `frontend/public/exercise-media/ex-crucifixo-inclinado.gif`
- `frontend/public/exercise-media/ex-crucifixo-inclinado.webp`
- `frontend/public/exercise-media/ex-crucifixo-inverso-cabo.gif`
- `frontend/public/exercise-media/ex-crucifixo-inverso-cabo.webp`
- `frontend/public/exercise-media/ex-crucifixo-inverso-halteres.gif`
- `frontend/public/exercise-media/ex-crucifixo-inverso-halteres.webp`
- `frontend/public/exercise-media/ex-crucifixo-inverso-peckdeck.gif`
- `frontend/public/exercise-media/ex-crucifixo-inverso-peckdeck.webp`
- `frontend/public/exercise-media/ex-crunch-solo.gif`
- `frontend/public/exercise-media/ex-crunch-solo.webp`
- `frontend/public/exercise-media/ex-dead-bug.gif`
- `frontend/public/exercise-media/ex-dead-bug.webp`
- `frontend/public/exercise-media/ex-desenvolvimento-arnold.gif`
- `frontend/public/exercise-media/ex-desenvolvimento-arnold.webp`
- `frontend/public/exercise-media/ex-desenvolvimento-militar.gif`
- `frontend/public/exercise-media/ex-desenvolvimento-militar.webp`
- `frontend/public/exercise-media/ex-elevacao-frontal-halteres.gif`
- `frontend/public/exercise-media/ex-elevacao-frontal-halteres.webp`
- `frontend/public/exercise-media/ex-elevacao-lateral-inclinado.gif`
- `frontend/public/exercise-media/ex-elevacao-lateral-inclinado.webp`
- `frontend/public/exercise-media/ex-elevacao-y-banco.gif`
- `frontend/public/exercise-media/ex-elevacao-y-banco.webp`
- `frontend/public/exercise-media/ex-esteira-hiit.gif`
- `frontend/public/exercise-media/ex-esteira-hiit.webp`
- `frontend/public/exercise-media/ex-face-pull.gif`
- `frontend/public/exercise-media/ex-face-pull.webp`
- `frontend/public/exercise-media/ex-flexao-declinada.gif`
- `frontend/public/exercise-media/ex-flexao-declinada.webp`
- `frontend/public/exercise-media/ex-flexao-diamante.gif`
- `frontend/public/exercise-media/ex-flexao-diamante.webp`
- `frontend/public/exercise-media/ex-flexao-inclinada.gif`
- `frontend/public/exercise-media/ex-flexao-inclinada.webp`
- `frontend/public/exercise-media/ex-gemeos-sentado-soleo.gif`
- `frontend/public/exercise-media/ex-gemeos-sentado-soleo.webp`
- `frontend/public/exercise-media/ex-panturrilha-em-pe-maquina.gif`
- `frontend/public/exercise-media/ex-panturrilha-em-pe-maquina.webp`
- `frontend/public/exercise-media/ex-panturrilha-sentado-halter.gif`
- `frontend/public/exercise-media/ex-panturrilha-sentado-halter.webp`
- `frontend/public/exercise-media/ex-paralelas-peito.gif`
- `frontend/public/exercise-media/ex-paralelas-peito.webp`
- `frontend/public/exercise-media/ex-peck-deck-voador.gif`
- `frontend/public/exercise-media/ex-peck-deck-voador.webp`
- `frontend/public/exercise-media/ex-polichinelo.gif`
- `frontend/public/exercise-media/ex-ponte-gluteos-solo.gif`
- `frontend/public/exercise-media/ex-ponte-gluteos-solo.webp`
- `frontend/public/exercise-media/ex-prancha-toque-ombro.gif`
- `frontend/public/exercise-media/ex-prancha-toque-ombro.webp`
- `frontend/public/exercise-media/ex-puxada-supinada.gif`
- `frontend/public/exercise-media/ex-puxada-supinada.webp`
- `frontend/public/exercise-media/ex-puxada-triangulo.gif`
- `frontend/public/exercise-media/ex-puxada-triangulo.webp`
- `frontend/public/exercise-media/ex-rdl-unilateral.gif`
- `frontend/public/exercise-media/ex-rdl-unilateral.webp`
- `frontend/public/exercise-media/ex-remada-baixa-triangulo.gif`
- `frontend/public/exercise-media/ex-remada-baixa-triangulo.webp`
- `frontend/public/exercise-media/ex-remada-cavalinho.gif`
- `frontend/public/exercise-media/ex-remada-cavalinho.webp`
- `frontend/public/exercise-media/ex-remada-elastico.gif`
- `frontend/public/exercise-media/ex-remada-elastico.webp`
- `frontend/public/exercise-media/ex-remada-peito-apoiado.gif`
- `frontend/public/exercise-media/ex-remada-peito-apoiado.webp`
- `frontend/public/exercise-media/ex-remada-serrote-halteres.gif`
- `frontend/public/exercise-media/ex-remada-serrote-halteres.webp`
- `frontend/public/exercise-media/ex-remada-unilateral-cabo.gif`
- `frontend/public/exercise-media/ex-remada-unilateral-cabo.webp`
- `frontend/public/exercise-media/ex-reverse-crunch.gif`
- `frontend/public/exercise-media/ex-reverse-crunch.webp`
- `frontend/public/exercise-media/ex-roda-abdominal.gif`
- `frontend/public/exercise-media/ex-roda-abdominal.webp`
- `frontend/public/exercise-media/ex-rosca-alternada-halteres.gif`
- `frontend/public/exercise-media/ex-rosca-alternada-halteres.webp`
- `frontend/public/exercise-media/ex-rosca-concentrada.gif`
- `frontend/public/exercise-media/ex-rosca-concentrada.webp`
- `frontend/public/exercise-media/ex-rosca-inversa-barra.gif`
- `frontend/public/exercise-media/ex-rosca-inversa-barra.webp`
- `frontend/public/exercise-media/ex-rosca-martelo-halteres.gif`
- `frontend/public/exercise-media/ex-rosca-martelo-halteres.webp`
- `frontend/public/exercise-media/ex-rosca-punho-barra.gif`
- `frontend/public/exercise-media/ex-rosca-punho-barra.webp`
- `frontend/public/exercise-media/ex-rosca-punho-invertida.gif`
- `frontend/public/exercise-media/ex-rosca-punho-invertida.webp`
- `frontend/public/exercise-media/ex-rosca-scott-barra.gif`
- `frontend/public/exercise-media/ex-rosca-scott-barra.webp`
- `frontend/public/exercise-media/ex-rosca-scott-maquina.gif`
- `frontend/public/exercise-media/ex-rosca-scott-maquina.webp`
- `frontend/public/exercise-media/ex-slam-ball.gif`
- `frontend/public/exercise-media/ex-slam-ball.webp`
- `frontend/public/exercise-media/ex-step-up.gif`
- `frontend/public/exercise-media/ex-step-up.webp`
- `frontend/public/exercise-media/ex-supino-fechado.gif`
- `frontend/public/exercise-media/ex-supino-fechado.webp`
- `frontend/public/exercise-media/ex-supino-maquina.gif`
- `frontend/public/exercise-media/ex-supino-maquina.webp`
- `frontend/public/exercise-media/ex-triceps-acima-cabo.gif`
- `frontend/public/exercise-media/ex-triceps-acima-cabo.webp`
- `frontend/public/exercise-media/ex-triceps-banco.gif`
- `frontend/public/exercise-media/ex-triceps-banco.webp`
- `frontend/public/exercise-media/ex-triceps-corda.gif`
- `frontend/public/exercise-media/ex-triceps-corda.webp`
- `frontend/public/exercise-media/ex-triceps-frances-halter.gif`
- `frontend/public/exercise-media/ex-triceps-frances-halter.webp`
- `frontend/public/exercise-media/ex-triceps-unilateral-cabo.gif`
- `frontend/public/exercise-media/ex-triceps-unilateral-cabo.webp`
- `frontend/tests/exercise-card-animation-browser.cjs`

[Relatório estruturado com evidências e snapshots](exercisegymgifs-validation.json) · [Manifesto aplicado](../../backend/src/config/exercise-library.media.json).

Validação concluída antes do commit e push. Entrega na branch `codex/complete-exercise-gifs`, sem merge.
