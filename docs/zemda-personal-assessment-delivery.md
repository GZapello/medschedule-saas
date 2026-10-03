# ZemdaPersonal — auditoria e entrega

Data: 03/10/2026. Alterações implementadas no módulo existente, sem commit ou push.

## Auditoria antes da implementação

Foram examinados o controller Personal, o controller de pacientes, a inicialização SQLite, schema, rotas, cadastro rápido, cadastro geral, edição de aluno, modal de avaliação/autosave, perfil, comparação, evolução e impressão.

Problemas encontrados: backend assumia idade 30 e usava equação feminina na ausência de sexo; frontend assumia sexo masculino e idade 28; gordura era calculada com dobras ausentes substituídas por zero; massa muscular era inventada por massa livre de gordura × 0,52; fórmulas divergiam entre frontend/backend; relatório tratava qualquer gênero diferente de m como feminino e dependia da última avaliação; edição física persistia apenas parte dos campos; seed InBody atribuía cortes à WHO e DXA recebia limites universais inadequados.

A referência externa PDF foi usada exclusivamente para a organização funcional dos dados (perímetros, aferições, composição, bioquímica, somatotipo e evolução). Não foram copiados identidade, texto, layout, ilustrações ou gráficos. Os componentes novos utilizam classes Zemda e ClinicDocumentHeader/ClinicDocumentFooter; nenhum CSS global de identidade foi alterado.

## Persistência e integridade

Não foram apagadas, recriadas ou sobrescritas avaliações de Évilyn Piva Lobo ou Gabriel Kuiawinski Zapello. Nenhum banco de produção foi acessado. Na auditoria somente leitura, backend/saas_schedule.db tinha zero avaliações; o banco na raiz não tinha personal_assessments. Os nomes citados não estavam nesse banco local. Não foram criados registros fictícios no banco real.

Migrations e startup foram validados em bancos temporários. Uma fixture separada contém os dois nomes, Pedro Michielin e Teste Clínica Completa. A migration executada duas vezes preserva IDs, patient_id, professional_id, datas, valores e quantidade; a reinicialização completa preserva também todos os registros modernos da fixture. Nenhuma migration faz backfill de avaliações ou pacientes.

A nova migration adiciona campos por PRAGMA table_info + ALTER TABLE ADD COLUMN. Os protocolos globais Omron/Tanita/InBody recebem configuração corrigida; protocolos personalizados do tenant não são alterados. O protocolo DXA global sem referência validada é desativado; medições DXA/CT/MRI continuam registráveis e só classificam com referência configurada.

Avaliações novas armazenam snapshot de sexo/idade na data, versão personal-calc-2026.1 e metadata dos inputs, equações, fontes e indisponibilidade. Valores calculados são produzidos no backend; frontend usa o endpoint de prévia. O backend ignora snapshots enviados pelo cliente ao criar uma avaliação.

normalizeLegacyAssessmentForReport é somente leitura: valores históricos persistidos têm precedência, gordura histórica não é substituída, e massa adiposa/livre derivadas usam o percentual histórico quando necessário. A origem de sexo legado é identificada. Edições explícitas de avaliações modernas preservam snapshots e recalculam os derivados; não há regravação automática em massa. Fotos existentes são atualizadas pelo ID em edições, sem apagar e recriar todo o conjunto.

## Migration e campos

- Migration: backend/src/config/personal-assessment.migration.ts, integrada em initializeDatabase.
- patients.anthropometric_sex nullable, com male, female e not_informed.
- Campos adicionados em personal_assessments:

- `bmi_classification`
- `skinfold_sum`
- `skinfold_central_sum`
- `skinfold_peripheral_sum`
- `anthropometric_sex_at_assessment`
- `age_at_assessment`
- `calculation_version`
- `calculation_metadata_json`
- `body_fat_classification`
- `body_fat_reference`
- `whr_classification`
- `whtr_classification`
- `bmr_method`
- `vai_value`
- `vai_reference`
- `humerus_breadth_cm`
- `femur_breadth_cm`
- `fold_iliac_crest`
- `fold_supraspinale`
- `skinfold_measurements_json`
- `measurement_quality_json`
- `glucose_mg_dl`
- `triglycerides_mg_dl`
- `ldl_mg_dl`
- `hdl_mg_dl`
- `somatotype_endomorphy`
- `somatotype_mesomorphy`
- `somatotype_ectomorphy`
- `somatochart_x`
- `somatochart_y`
- `tav_source_type`
- `tav_reference_source`
- `tav_is_estimate`
- `muscle_mass_method`
- `muscle_mass_notes`
- `biochemical_source`
- `biochemical_exam_date`

## Cálculos e referências

- IMC = kg / (cm/100)²; classificação WHO adulta, sem aplicar cortes adultos quando idade não permite.
- RCQ = cintura/quadril; WHO 2011: acima de 0,90 para homem e 0,85 para mulher, como referência de triagem.
- RCE = cintura/estatura; boundary adulto 0,50, Browning 2010.
- JP7 homem: BD = 1,112 − 0,00043499Σ + 0,00000055Σ² − 0,00028826idade.
- JP7 mulher: BD = 1,097 − 0,00046971Σ + 0,00000056Σ² − 0,00012828idade.
- JP3 homem (peitoral, abdominal, coxa): BD = 1,10938 − 0,0008267Σ + 0,0000016Σ² − 0,0002574idade.
- JP3 mulher (tríceps, suprailíaca, coxa): BD = 1,0994921 − 0,0009929Σ + 0,0000023Σ² − 0,0001392idade.
- Siri = 495/BD − 450; somente com todas as dobras exigidas, idade válida e sexo de referência disponível. Resultados fora do domínio não são artificialmente truncados.
- Massa adiposa = peso × gordura/100; massa livre de gordura = peso − massa adiposa.
- Somatórios total, central e periférico dos pontos disponíveis, com inputs registrados; crista ilíaca e supraespinale são campos diferentes.
- Dupla aferição: média; três medidas: mediana; aviso de terceira aferição para diferença >5% (diferença relativa à média das primeiras duas). Entrada rápida preservada.
- Classificação de gordura Gallagher/Omron versionada, por sexo e faixas 20–39, 40–59, 60–79; fora desse escopo: sem classificação.
- VAI homem = WC/(39,68 + 1,88IMC) × TG/1,03 × 1,31/HDL.
- VAI mulher = WC/(36,58 + 1,89IMC) × TG/0,81 × 1,52/HDL.
- TG mg/dL ÷ 88,57 e HDL mg/dL ÷ 38,67 para mmol/L; inputs e conversões no metadata. VAI é indicador indireto e nunca ocupa tav_value.
- TAV equipamento: Omron HBF-511 1–9/10–14/15–30; Tanita 1–12/13–59; InBody referência selecionada de nível ≤10 ou área ≤100 cm². Ranges e fontes por equipamento, sem chamar isso de WHO.
- TMB Mifflin: 10kg + 6,25cm − 5idade + 5 (homem) ou −161 (mulher). Valores de equipamento/manuais são identificados separadamente.
- Heath-Carter: endomorfia com soma tríceps/subescapular/supraespinale corrigida pela estatura; mesomorfia com diâmetros úmero/fêmur e perímetros corrigidos; ectomorfia por razão estatura/raiz cúbica da massa; X = ecto−endo; Y = 2meso−endo−ecto. Somatocarta SVG original.
- Massa muscular: somente valor documentado manual/equipamento; nenhuma proporção da massa magra. Lee 2000 não é oferecido sem um protocolo completo de inputs validado.

As referências bibliográficas e os links oficiais estão em REFERENCES no serviço central e são registrados nos metadados. Não há diagnóstico automático baseado em índices.

Homem/Mulher alteram fórmulas e referências, nunca aparência. Prefere não informar mantém índices independentes de sexo e valores medidos; bloqueia JP, VAI, TMB sex-specific e classificações dependentes de sexo. Ausência de nascimento bloqueia fórmulas dependentes de idade; não há idade fictícia. Dados ausentes são nullable e renderizados como —, Não informado ou Não calculado.

## Relatórios, evolução e compatibilidade

GET /v1/personal/assessments/:id/report-data retorna original, aluno, profissional, clínica, cálculos derivados, fontes, avaliação anterior, fotos e histórico; respeita o tenant e as permissões existentes. POST /v1/personal/assessments/preview usa o mesmo motor.

O modal busca pelo ID da avaliação escolhida, bloqueia impressão até concluir a carga, suporta relatório selecionado/evolução/perfil e mantém PDFs de treino com/sem imagens. Evolução: primeira × atual, anterior × atual ou todas até a data selecionada. Gráficos SVG de peso, gordura, massa adiposa/livre/muscular, cintura, abdômen, quadril, RCQ, RCE, VAI, TAV e somatórios; TAV é separado por equipamento/unidade/protocolo. Tabelas mostram anterior/atual/diferença/% sem transformar variação numérica em diagnóstico.

Impressão A4 com páginas, cabeçalhos/rodapés Zemda, dados disponíveis, notas, testes e registro fotográfico. Seções opcionais sem dados são omitidas. Somatotipo insuficiente é explicado, sem gráfico vazio. Fotos, postura, autosave, treinos, recordes, frequência e histórico foram preservados nos testes existentes.

## Validação realizada

- Backend npm run build: passou.
- Backend npm start: iniciou sem crash, continua na porta 4137 com banco temporário; GET /health retornou status ok.
- Frontend npm run build: passou; apenas aviso do Vite sobre chunk maior que 500 kB.
- 30 testes do motor: passaram, abrangendo os cenários exigidos e tolerâncias numéricas explícitas.
- 99 verificações de integração do relatório: passaram.
- 34 verificações existentes de postura: passaram.
- 37 verificações existentes de alunos/exercícios: passaram.
- 74 verificações existentes de ZemdaPersonal/body/treinos/recordes/isolamento: passaram.
- Frontend: 181 casos de renderização + 5 verificações de impressão no Chromium + 5 verificações do modal histórico: passaram.
- PDF de fixture: 13 páginas A4, cabeçalho e rodapé presentes em todas as páginas, nenhum NaN/Infinity/#DIV/0!, sem overflow horizontal; revisão visual realizada.
- git diff --check: sem erros.

Comandos reproduzíveis:

```powershell
npm run test:personal-assessment --prefix backend
npm run build --prefix frontend
npm run test:personal-report --prefix frontend
```

Os testes de impressão exigem Chromium do Playwright; artefatos sintéticos são gerados em tmp/personal-report-tests e ignorados pelo Git. Os scripts não acessam produção.

## Arquivos alterados

- `.gitignore`
- `backend/package.json`
- `backend/src/config/database.ts`
- `backend/src/config/schema.sql`
- `backend/src/controllers/patient.controller.ts`
- `backend/src/controllers/personal.controller.ts`
- `backend/src/routes/index.ts`
- `frontend/package.json`
- `frontend/src/components/patients/EditPatientModal.tsx`
- `frontend/src/components/patients/NewPatientModal.tsx`
- `frontend/src/components/personal/PersonalAssessmentComparisonModal.tsx`
- `frontend/src/components/personal/PersonalAssessmentModal.tsx`
- `frontend/src/components/personal/PersonalEvolutionCharts.tsx`
- `frontend/src/components/personal/PersonalPdfExportModal.tsx`
- `frontend/src/components/personal/PersonalStudentProfile.tsx`
- `frontend/src/components/personal/ZemdaPersonalView.tsx`
- `frontend/src/components/personal/types.ts`

## Arquivos novos

- `backend/src/config/personal-assessment.migration.ts`
- `backend/src/services/personal-assessment-calculation.service.ts`
- `backend/test-personal-calculation.cjs`
- `backend/test-personal-report.cjs`
- `frontend/src/components/personal/PersonalAssessmentReport.tsx`
- `frontend/src/components/personal/PersonalAssessmentReportCharts.tsx`
- `frontend/src/components/personal/PersonalTechnicalFields.tsx`
- `frontend/tests/personal-report.cjs`
- `frontend/tests/personal-report-browser.cjs`
- `frontend/tests/personal-modal.tsx`
- `frontend/tests/personal-modal-browser.cjs`
- `docs/zemda-personal-assessment-delivery.md`

