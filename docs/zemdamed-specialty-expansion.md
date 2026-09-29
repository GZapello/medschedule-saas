# ZemdaMed — avaliações por especialidade

## Estrutura preservada

As 15 especialidades, seus IDs, slugs e a matriz de capabilities foram mantidos. As ferramentas são habilitadas pela interseção entre a especialidade/áreas médicas selecionadas e as capabilities efetivas do usuário. Regras HIDDEN das áreas têm precedência. Nenhuma capability, rota ou módulo comercial foi criado.

O workspace mantém paciente, sinais vitais, antecedentes, exame físico geral, SOAP, CID, conduta, retorno e finalização comuns. As seções exclusivas ficam em um catálogo de campos e um renderer recolhível. Somente a especialidade ativa é renderizada; ferramentas maiores são importadas sob demanda.

## Entrega por especialidade

| Especialidade | Avaliação disponível |
|---|---|
| Clínica Médica | Revisão de nove sistemas, condições crônicas, prevenção, risco cirúrgico, investigação e cuidados paliativos. |
| Neurologia | Estado mental, pares I–XII individualizados, tônus/trofismo/movimentos, reflexos, sensibilidade, coordenação e equilíbrio; força, mobilidade e postura/marcha compartilhadas. |
| Psiquiatria | Exame do estado mental estruturado, sono, apetite, substâncias, funcionamento social/ocupacional e adesão. |
| Pediatria | Nascimento, Apgar, quatro domínios do desenvolvimento, alimentação e vacinação; antropometria compartilhada, incluindo perímetro cefálico. |
| Geriatria | AGA, suporte social, continência, visão/audição e polifarmácia; AVD/AIVD, postura/marcha, dor, mobilidade, força e escalas compartilhadas. |
| Endocrinologia e Metabologia | Diabetes, glicemia/HbA1c, insulina/hipoglicemia, tireoide e osteometabolismo; antropometria e composição corporal compartilhadas. |
| Ortopedia e Traumatologia | Doze regiões, lateralidade, inspeção, palpação, estabilidade e observações; dor, ADM, força e testes do componente regional existente. |
| Cardiologia | Sintomas, exame cardiovascular, fatores de risco e resultados de exames; tendências de PA, frequência cardíaca, peso e IMC. |
| Dermatologia | Lesões identificadas individualmente, características, ABCDE, fototipo, fotografias, histórico/comparação fotográfica e acompanhamento de lesões anteriores. |
| Reumatologia | Articulações dolorosas/edemaciadas, rigidez, limitação funcional, fadiga, dor difusa e manifestações sistêmicas; ferramentas compartilhadas conforme capabilities. |
| Ginecologia e Obstetrícia | História e exame ginecológicos, contracepção, IST, G/P/A/cesáreas, DUM/DPP, idade gestacional, altura uterina, BCF, movimentos e intercorrências, na mesma especialidade. |
| Gastroenterologia | Sintomas digestivos, frequência intestinal/Bristol e exame abdominal estruturado. |
| Oftalmologia | Acuidade, refração, PIO, exame externo, biomicroscopia, fundo de olho e motilidade separados por OD/OE; exames e anexos. |
| Otorrinolaringologia | Ouvidos OD/OE, nariz, orofaringe, laringe/voz e vertigem; audiologia e IDV-10 reutilizados. |
| Urologia | Sintomas urinários, próstata/PSA, litíase, lateralidade, recorrência e saúde do homem. |

## Reutilização

- **Zemda360:** o mesmo modal, workspace, documento anatômico, autosave e histórico. A consulta guarda o ID da avaliação, inclusive sem agendamento; há acesso em modo somente leitura pelo histórico médico.
- **Fisio:** formulário regional de dor, ADM, força, palpação e testes; recebeu callbacks opcionais para integrar seu payload ao rascunho médico. O fluxo original de gravação continua sendo o padrão para Fisio.
- **Fisio / TO / Personal:** escalas funcionais, postura/marcha, AVD/AIVD e gráfico de evolução foram extraídos para componentes compartilhados; os módulos de origem passaram a consumi-los.
- **Antropometria existente:** formulário, cálculos, medidas, composição corporal e histórico. Callbacks opcionais integram o rascunho médico. Composição corporal respeita sua capability; na integração médica, as medidas não recebem classificações automáticas de referência adulta.
- **Fono:** audiologia completa e IDV-10, com seus históricos e cálculos existentes. Apenas os endpoints dessas avaliações receberam acesso adicional por capability, sem liberar o restante do módulo Fono. O acesso ao paciente e ao tenant continua obrigatório.
- **Arquivos e fotografias:** `ClinicalFileUploader` e `EvolutionPhotoField`, incluindo visualização segura, múltiplas fotos e comparação existentes.
- **Histórico e comparação:** endpoint médico existente, prontuário geral, `ClinicalSnapshot` e `EvolutionComparisonModal`. O gráfico extraído do Personal também atende as tendências médicas.
- **Autosave:** `useClinicalAutosave`, indicador e recuperação de conflitos existentes. A limpeza aguarda gravações pendentes e cancela o debounce para não recriar um rascunho recém-finalizado.

## Código novo

O código exclusivo novo é o catálogo/renderer dos campos médicos, cadastro de lesões, adaptadores de capabilities/comparação/tendências e normalização do payload médico. Os componentes genéricos novos em `clinical/` são extrações dos módulos existentes, não engines alternativas.

## Persistência e compatibilidade

- As notas específicas mantêm as chaves existentes (`neurologicalExam`, `psychiatricNotes`, etc.). Clínica Médica utiliza `internalMedicineNotes`.
- `sharedAssessments` contém avaliações regionais por região/lado, escalas, AVD/AIVD, postura/marcha, rascunhos de antropometria/audiologia/voz e referência do Zemda360.
- O autosave existente recebe esses objetos e os restaura ao reabrir o atendimento. Também preserva a especialidade ativa.
- A finalização grava o payload completo em `records.technical_notes`, no mesmo prontuário selado. Registro e conclusão do agendamento são transacionais.
- O endpoint existente de criação de consultas também preserva as notas em uma única coluna JSON opcional, `medical_consultations.specialty_notes_json`, adicionada de forma idempotente.
- O histórico médico combina consultas antigas com registros finalizados no prontuário. A consulta por ID lê ambos os formatos, sem copiar registros para outra tabela.
- Campos antigos sem equivalente visual permanecem disponíveis em “Anotações anteriores preservadas”. Dados ausentes, objetos incompletos e arrays vazios são aceitos; os parsers e renderers tratam valores inválidos nas estruturas usadas pela integração.
- Fotos e anexos armazenam referências do sistema de arquivos existente; nenhum armazenamento paralelo foi criado.
- Ao mudar de paciente, o rascunho é salvo e o estado clínico é limpo antes da recuperação do próximo atendimento. Respostas atrasadas de histórico não substituem o paciente ativo.
- Foram retirados achados específicos pré-preenchidos como normais. Escalas compartilhadas continuam sendo registros clínicos; não há novos diagnósticos ou interpretações automáticas.

## Arquivos desta implementação

Backend:

- `backend/src/config/database.ts`
- `backend/src/controllers/medical.controller.ts`
- `backend/src/controllers/speech-therapy.controller.ts`
- `backend/src/services/medical-tree.service.ts`
- `backend/src/services/medical-payload.ts` — novo
- `backend/test-medical-specialty-persistence.cjs` — novo

Frontend médico:

- `frontend/src/components/medical/ZemdaMedWorkspace.tsx`
- `frontend/src/components/medical/specialties/specialtySections.ts` — novo
- `frontend/src/components/medical/specialties/SpecialtySectionRenderer.tsx` — novo
- `frontend/src/components/medical/shared/MedicalCapabilityTools.tsx` — novo
- `frontend/src/components/medical/shared/MedicalTrends.tsx` — novo
- `frontend/src/components/medical/shared/MedicalComparison.tsx` — novo
- `frontend/src/types/capabilities.ts`
- `frontend/test-medical-specialties.cjs` — novo

Componentes compartilhados e consumidores:

- `frontend/src/components/clinical/ADLAssessment.tsx` — extraído
- `frontend/src/components/clinical/ClinicalScales.tsx` — extraído
- `frontend/src/components/clinical/ClinicalTrendChart.tsx` — extraído
- `frontend/src/components/clinical/PostureGait.tsx` — extraído
- `frontend/src/components/clinical/ClinicalSnapshot.tsx`
- `frontend/src/components/clinical/ClinicalRecordsView.tsx`
- `frontend/src/components/occupational-therapy/OccupationalTherapyWorkspace.tsx`
- `frontend/src/components/personal/PersonalEvolutionCharts.tsx`
- `frontend/src/components/physiotherapy/PhysiotherapyWorkspace.tsx`
- `frontend/src/components/physiotherapy/RegionalPhysioAssessmentModal.tsx`
- `frontend/src/components/speech-therapy/Idv10AssessmentSection.tsx`
- `frontend/src/components/speech-therapy/audiology/AudiologyWorkspaceSection.tsx`
- `frontend/src/components/zemda-body/AnthropometricAssessmentView.tsx`
- `frontend/src/components/zemda-body/ZemdaBodyModal.tsx` — identificador interno legado do Zemda360
- `frontend/src/components/zemda-body/ZemdaBodyWorkspace.tsx` — identificador interno legado do Zemda360
- `frontend/src/components/zemda-body/useAnatomicalAssessment.ts`
- `frontend/src/hooks/useClinicalAutosave.ts`
- Este relatório.

## Validação

- Build completo do frontend: TypeScript e Vite.
- Build completo do backend.
- `node frontend/test-medical-specialties.cjs`: renderização das 15 especialidades, dados antigos/nulos, OD/OE, lesões, AVD, escalas e gráfico com valores zero/negativos.
- `node backend/test-medical-specialty-persistence.cjs`: banco temporário, criação/finalização/leitura das 15 especialidades, autosave/recuperação, compatibilidade antiga, tenant/paciente/agendamento, audiologia/IDV-10 por capability e migração idempotente.
- Suíte existente de autosave universal: oito testes aprovados, executados com banco temporário.
- Suíte existente de isolamento da árvore médica: aprovada, executada com banco temporário; compartilhamento de capabilities não libera outros módulos comerciais.

O Vite emite aviso de bundle principal maior que 500 kB, sem falha de build. Não foi feita homologação manual no navegador nem validação de upload contra armazenamento externo. Gráficos pediátricos apresentam medidas longitudinais; não foram adicionadas tabelas normativas ou cálculo novo de percentis. Acuidade visual textual é comparada no componente de comparação, sem conversão clínica automática.

Não houve commit, push ou implantação. Alterações simultâneas de outras tarefas foram preservadas e não estão incluídas na lista acima.
