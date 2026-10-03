# Atualização vigente — TAV simplificado (personal-calc-2026.4)

Esta seção substitui o estado da entrega anterior registrado abaixo. O cálculo novo utiliza **Bonora et al. (1995)**, referência já presente na seção 6 de ZemdaPersonal_REFERENCIAS_TECNICAS.md. As equações e coeficientes foram conferidos na tabela 4 e no texto de validação do artigo primário [Liu et al. 2022](https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2022.916124/full#T4). O [estudo original](https://pubmed.ncbi.nlm.nih.gov/8786733/) define área visceral transversal por MRI e relata precisão limitada e grande erro na validação cruzada. Portanto, o resultado é uma estimativa antropométrica de área, não uma medição direta ou diagnóstico.

- Homem: TAV estimado (cm²) = 6,37 × cintura (cm) − 453,7.
- Mulher: TAV estimado (cm²) = 4,04 × cintura (cm) + 2,62 × idade (anos) − 370,5.
- O coeficiente feminino é **4,04**, não 4,4; a transcrição divergente encontrada em um trabalho de 2018 foi descartada em favor da fórmula reproduzida explicitamente na validação primária de 2022.
- Campos existentes utilizados: sexo antropométrico, idade na data da avaliação e cintura. Na fórmula masculina a idade serve à restrição adulta, não ao valor numérico. Não se substitui cintura por abdômen, pois o ponto anatômico é distinto.
- Peso, altura, IMC, quadril, pescoço, TG e demais exames não são exigidos por esse protocolo. Permanecem disponíveis para outros cálculos do sistema.
- Regra clínica preservada: não calcular em menores de 20 anos ou sem idade/sexo de referência. Isso é uma restrição de uso do sistema, não uma alegação de faixa etária validada por Bonora.
- Resultado negativo, zero ou não finito não é convertido em zero fictício: fica null/Não calculado. Valores positivos são arredondados a quatro casas no backend.
- Nenhum cutoff de equipamento ou faixa clínica universal foi aplicado à estimativa. A limitação científica fica documentada na metadata e no relatório; o cartão de entrada mostra valor/unidade e Método: Equação preditiva. Classificação só aparece quando há referência válida configurada.

Foram retirados da interface os campos introduzidos exclusivamente para Cavalcanti: raça/cor do protocolo, HbA1c, ácido úrico e confirmação de jejum. Glicose já existente permanece opcional na avaliação geral e não participa do TAV. Dados antigos dessas colunas não foram excluídos. Nenhum campo novo ou migration nova foi criado nesta correção.

O cartão de TAV foi simplificado: TAV estimado, resultado em cm² e Método: Equação preditiva. Quando faltam dados existentes, exibe somente “Preencha as medidas necessárias para calcular o TAV.” Não imprime a lista de variáveis nem referências longas na tela de preenchimento. TAV medido continua recolhido e opcional; VAI continua um índice separado.

O serviço central permanece a fonte única. O endpoint de preview atualiza o resultado conforme a cintura é preenchida, sem salvar nada. Leituras e relatórios históricos não preenchem retroativamente estimativas ausentes. Protocolos antigos e valores salvos são preservados mesmo em uma edição manual; o novo protocolo não substitui automaticamente a equação de uma avaliação anterior. Não houve escrita no banco real: as avaliações de Évilyn Piva Lobo e Gabriel Kuiawinski Zapello não foram apagadas nem sobrescritas.

Validação desta atualização: backend build e frontend build passaram; 51 testes de cálculo, 131 verificações API/relatório, 243 verificações SSR, testes de navegador/preview e seleção de impressão passaram. A fixture completa agora possui 15 páginas A4, todas com cabeçalho/rodapé; o aumento corresponde à série independente de TAV estimado. git diff --check passou. Nenhum commit ou push.

Arquivos editados nesta atualização:

- backend/src/services/personal-assessment-calculation.service.ts
- backend/src/controllers/personal.controller.ts
- backend/test-personal-calculation.cjs
- backend/test-personal-report.cjs
- frontend/src/components/personal/PersonalAssessmentIndicator.tsx
- frontend/src/components/personal/PersonalAssessmentModal.tsx
- frontend/src/components/personal/PersonalTechnicalFields.tsx
- frontend/src/components/personal/PersonalAssessmentReport.tsx
- frontend/tests/personal-visceral-browser.cjs
- docs/zemda-personal-visceral-correction.md

As outras alterações pendentes listadas no Git já existiam antes desta atualização e foram preservadas, incluindo a migration aditiva anterior e os scripts de testes.

---

# Histórico da entrega anterior — substituído pela atualização acima

# Entrega — correção prioritária TAV / ZemdaPersonal

## Resultado e pendência científica

Alterações aplicadas ao código existente. Arquitetura, componentes, cores e identidade visual Zemda preservados. Sem módulo paralelo, commit ou push.

A versão atual é personal-calc-2026.3. A prioridade é TAV estimado por equação preditiva, seguida da seção manual opcional fechada e do VAI identificado como indicador indireto. O preview continua usando o motor central com debounce de 250 ms e descarte de respostas antigas.

**A equação numérica de Cavalcanti NÃO está habilitada.** A solicitação determina conferir o artigo original completo antes de codificar os coeficientes. Foi acessada a página original [Cavalcanti et al., RBONE 14(91), 1259–1269](https://www.rbone.com.br/index.php/rbone/article/view/1462), mas as rotas do PDF retornaram indisponibilidade e o visualizador não carregou páginas. O resumo é insuficiente para confirmar unidades, codificação da variável raça, coeficiente feminino de CP, unidade do desfecho e critérios/metodologia completos. Não se assumiu cm², mL, conversões, raça numérica, 118 ou 11,8. Não foi codificada nenhuma das duas equações de Cavalcanti.

O resumo informa amostra de 160 participantes de 20 a 80 anos, ambos os sexos e medida por tomografia. Isso identifica o intervalo da amostra; não confirma validade externa. Fora desse intervalo, a interface explicita a não aplicabilidade. Abaixo de 20 anos e sem sexo de referência não há cálculo. Dentro do intervalo o protocolo continua indisponível até a verificação integral da fonte. A conclusão depende do PDF original completo acessível; não depende de uma simples flag de configuração.

## Auditoria e arquitetura

Foram auditados serviço central, criação/edição/preview, migração, tipos, formulário, campos bioquímicos, classificações, comparação, evolução e relatório. O relatório antigo continua sendo normalizado somente para leitura. Valores persistidos e snapshots demográficos históricos têm precedência, sem recalcular a partir do perfil atual.

O código anterior tratava o TAV como medição de equipamento, preenchia unidade/protocolo automaticamente e comparava medições de métodos diferentes. Foram removidos esses preenchimentos presumidos. A compatibilidade histórica com tav_value/tav_unit/tav_method/tav_equipment permanece: colunas novas nulas não apagam o valor antigo na projeção de leitura. Campos novos são aliases separados, sincronizados em gravações explicitamente solicitadas. Uma medição manual não sobrescreve uma estimativa histórica; a indisponibilidade atual do protocolo também não apaga estimativas já armazenadas. Não há backfill de avaliações nem UPDATE em massa.

## Campos e comportamento

Dados necessários identificados a partir da nomenclatura do resumo, ainda sem conversão para a equação:

- Mulher: idade, referência antropométrica, peso, altura, quadril, pescoço e TG; o IMC deriva de peso/altura.
- Homem: idade, referência antropométrica, altura, pescoço, glicemia com jejum confirmado, HbA1c, ácido úrico e variável demográfica do protocolo.
- Unidades de entrada dos campos clínicos: kg, cm, TG/glicose/ácido úrico em mg/dL e HbA1c em %. São unidades de armazenamento/entrada, **não unidades confirmadas para substituir na equação de Cavalcanti**.
- Variável raça: não inferida, sem opções/codificação numérica inventadas. O seletor fica indisponível até conferência da metodologia original.
- Resultado estimado: null, unidade null, equação null, available=false, verificationStatus=pending_full_text; faltantes por sexo e motivo explícito.
- Medição manual: valor, unidade, método, equipamento e protocolo opcionais. mL, cm³, cm², nível, kg e escala direta permanecem distintos. Sem unidade presumida e sem faixa universal.
- VAI: cálculo independente, sem gravar em nenhum campo TAV; sem cutoff populacional presumido.
- Ausência exibida como Não calculado, Não informado ou —. Sem NaN/Infinity/#DIV/0! e sem zeros substitutos.

Metadata: visceralAdiposity.predictedTav, measuredTav e vai. O alias anterior visceralAdiposity.tav foi mantido por compatibilidade. A previsão inclui inputs, missingInputs, sex, protocol, reference, applicable, limitation e calculationVersion.

## Migration aditiva e idempotente

Arquivo: backend/src/config/personal-assessment.migration.ts. Usa PRAGMA table_info e ALTER TABLE ADD COLUMN somente para colunas ausentes; não altera tabelas ou registros antigos.

Colunas adicionadas nesta solicitação:

- REAL: tav_estimated_value, tav_measured_value, hba1c_pct, uric_acid_mg_dl.
- INTEGER: glucose_is_fasting.
- TEXT: tav_estimated_unit, tav_estimation_protocol, tav_estimation_reference, tav_estimation_classification, tav_measured_method, tav_measured_equipment, tav_measured_unit, tav_protocol_race_code.

A coluna aditiva vai_classification da correção anterior permanece. Nenhuma migration foi aplicada ao banco real durante esta tarefa; startup e testes usam SQLite temporário.

## Fórmulas existentes preservadas

Cavalcanti masculino e feminino: **não implementadas numericamente**, pelos requisitos de fonte integral acima. Nenhuma unidade do desfecho ou codificação de raça foi confirmada na fonte completa.

- IMC: kg / (cm/100)²; RCQ: cintura/quadril; RCE: cintura/estatura.
- VAI masculino: WC/(39,68+1,88×IMC) × (TG/1,03) × (1,31/HDL).
- VAI feminino: WC/(36,58+1,89×IMC) × (TG/0,81) × (1,52/HDL).
- VAI usa TG/HDL em mmol/L; entrada mg/dL convertida por TG÷88,57 e HDL÷38,67; Amato 2010. Sem referência antropométrica ou inputs suficientes, não calcula.
- Jackson-Pollock: BD=c0−c1×S+c2×S²−c3×idade; gordura Siri=495/BD−450.
- JP3 masculino: [1,10938; 0,0008267; 0,0000016; 0,0002574], peitoral/abdominal/coxa.
- JP3 feminino: [1,0994921; 0,0009929; 0,0000023; 0,0001392], tríceps/suprailíaca/coxa.
- JP7 masculino: [1,112; 0,00043499; 0,00000055; 0,00028826]; feminino: [1,097; 0,00046971; 0,00000056; 0,00012828]. Peitoral, axilar média, tríceps, subescapular, abdominal, suprailíaca e coxa.
- Dobras repetidas: média de duas aferições; terceira medida quando diferença relativa >5%; mediana de três. Inputs incompletos não viram zero.
- Massa adiposa=peso×gordura%/100; livre de gordura=peso−massa adiposa. Massa muscular somente documentada, sem estimativa arbitrária.
- Mifflin-St Jeor: 10×kg+6,25×cm−5×idade+(5 homem ou −161 mulher); valores informados documentados preservados. Sem idade/sexo, não estima.
- Heath-Carter: X=(tríceps+subescapular+supraespinale)×170,18/altura; endomorfia=max(0,1;−0,7182+0,1451X−0,00068X²+0,0000014X³); mesomorfia=max(0,1;0,858HB+0,601FB+0,188braço corrigido+0,161panturrilha corrigida−0,131altura+4,5). Correções de perímetros subtraem dobra em mm÷10. Ectomorfia por HWR=cm/raiz cúbica(kg): ≥40,75 usa 0,732HWR−28,58; >38,25 usa 0,463HWR−17,63; demais 0,1. Somatocarta X=ecto−endo, Y=2meso−endo−ecto.
- Classificações existentes: WHO para IMC/RCQ adulto, RCE 0,50 (Browning 2010), gordura por sexo/idade (Gallagher/Omron 20–79), TAV por equipamento/protocolo compatível. Método explicitamente incompatível impede emprestar tabela de bioimpedância.

## Relatórios e evolução

Relatório mostra TAV estimado, método/protocolo/referência/motivo, TAV medido/método/unidade/equipamento e VAI indireto separadamente, além de HbA1c/ácido úrico/jejum quando informados. Impressão permanece A4 com cabeçalho/rodapé Zemda e seleção da avaliação histórica.

Séries estimadas são separadas por protocolo e unidade; séries medidas por método, equipamento, protocolo e unidade. Unidade ausente não é presumida. Comparações incompatíveis retornam diff/pct_variation=null e comparable=false, inclusive no cartão manual. Uma redução numérica não é rotulada automaticamente como melhora clínica do risco metabólico.

## Testes e validação

- Build backend passou; startup do servidor compilado em banco temporário, /health HTTP 200, processo permaneceu vivo sem crash e foi encerrado depois.
- Build frontend passou. Aviso Vite de tamanho de chunk permanece, sem erro de build.
- Cinco suítes backend passaram: 58 testes de cálculo; 125 verificações relatório/API; 34 postura; 37 expansão/alunos; 74 personal/body. O teste relatório/API foi reexecutado após corrigir sua fixture que inicialmente omitia cintura para VAI.
- Frontend: 243 verificações SSR, 5 verificações A4, 5 seleção/impressão histórica e teste Chromium de digitação/preview/equipamento/unidade, TAV estimado em destaque e seção manual inicialmente fechada.
- Fixture A4: 14 páginas físicas, todas A4 com cabeçalho e rodapé; sem overflow horizontal ou valores não finitos.
- git diff --check passou.

Quanto aos 16 cenários solicitados: foram testados faltantes femininos/masculinos, mudanças de inputs, atualização de IMC, limites de idade/sexo, medição manual, proteção de estimativa histórica, VAI distinto e registros antigos. Os casos numéricos positivos 1 e 7, e o resultado numérico TAV nos casos 4/5/6, **não podem ser validados sem confirmar a fonte integral**. Os testes verificam que esses inputs são atualizados no motor e que a trava científica impede fabricar valores. Não foram apresentados como reprodução numérica da publicação.

## Proteção dos registros reais

**As avaliações de Évilyn Piva Lobo e Gabriel Kuiawinski Zapello, da Teste Clínica Completa e profissional Pedro Michielin, NÃO foram apagadas, recriadas ou sobrescritas nesta tarefa.** O banco real não foi aberto para escrita. Os registros com esses nomes usados nos testes são fixtures temporárias. Migration repetida e leituras de relatórios preservaram IDs, datas, medições e contagem dessas fixtures.

## Arquivos alterados no conjunto entregue

1. backend/src/config/personal-assessment.migration.ts
2. backend/src/controllers/personal.controller.ts
3. backend/src/services/personal-assessment-calculation.service.ts
4. backend/test-personal-calculation.cjs
5. backend/test-personal-report.cjs
6. frontend/package.json (script de teste da correção anterior, preservado)
7. frontend/src/components/personal/PersonalAssessmentComparisonModal.tsx
8. frontend/src/components/personal/PersonalAssessmentIndicator.tsx
9. frontend/src/components/personal/PersonalAssessmentModal.tsx
10. frontend/src/components/personal/PersonalAssessmentReport.tsx
11. frontend/src/components/personal/PersonalAssessmentReportCharts.tsx
12. frontend/src/components/personal/PersonalEvolutionCharts.tsx
13. frontend/src/components/personal/PersonalTechnicalFields.tsx
14. frontend/src/components/personal/types.ts
15. frontend/tests/personal-report.cjs
16. frontend/tests/personal-visceral-browser.cjs
17. frontend/tests/personal-visceral.tsx (fixture de navegador da correção anterior, preservada)
18. docs/zemda-personal-visceral-correction.md

Arquivos dist e artefatos tmp são saídas locais de build/teste e não foram adicionados ao Git. Não foi alterada a identidade visual nem copiado material visual do PDF da avaliação fornecido.
