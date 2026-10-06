# Motor de avaliações clínicas compartilhadas

As profissões usam a mesma tabela `personal_assessments`, as mesmas fotos em `personal_assessment_photos` e os mesmos anexos privados. Não há tabelas de avaliações por profissão nem cópias de fórmulas, comparação, gráficos ou relatório.

## Entradas

`frontend/src/shared/clinical-assessments` exporta o editor, a comparação e o relatório existentes, com capabilities opcionais para preservar o Personal. O painel por paciente está integrado aos workspaces Fisio, Nutri, Estetic e atendimento geral. Pilates usa o atendimento geral já existente; Osteopatia e Quiropraxia usam Fisio. Nenhum módulo novo é criado.

`/v1/clinical-assessments` expõe apenas os recursos clínicos. Lista e evolução usam `/patients/:patientId`; detalhe, comparação, relatório, criação, atualização e exclusão reutilizam os controladores existentes. As URLs legadas do Personal também passam pela mesma autorização de avaliações.

## Política

`backend/src/shared/clinical-assessments/policy.json` é a única classificação de campos por capability, consumida também pelo frontend. A seleção de capabilities continua usando `CapabilityService`, incluindo profissão, áreas, opcionais e limites do plano. O Personal tem o conjunto completo. Nutrição não recebe postura, força ou mobilidade por padrão; fotografias são opcionais. Estética recebe medidas e fotos; composição continua opcional. Fisio recebe fotos e os recursos funcionais; medidas e composição continuam conforme suas capabilities opcionais. Pilates recebe fotos e testes funcionais, mantendo força conforme habilitação.

As respostas são filtradas, incluindo snapshots originais, histórico, métricas de comparação e relatórios. Atualizações de campos proibidos retornam 403; recálculos só persistem campos autorizados. Profissionais com acesso parcial não podem excluir uma avaliação que contenha recursos fora das próprias capabilities. Ocultar seções não substitui a validação no servidor.

O servidor valida usuário clínico, vínculo ativo, tenant do paciente e um vínculo de atendimento (agendamento ou avaliação do próprio profissional) para os módulos compartilhados. Gestores clínicos mantêm supervisão da clínica. O diretório de alunos do Personal preserva seu escopo original. Agendamentos precisam pertencer ao paciente, clínica e profissional autenticado. A autoria vem da sessão. Fotos precisam pertencer ao paciente; anexos legados ainda sem paciente são aceitos apenas quando enviados pelo próprio usuário e sem associação a outro paciente. IA postural exige POSTURE_GAIT.

## Compatibilidade de dados

A migração é aditiva e idempotente na tabela existente: `appointment_id`, `profession_id`, `assessment_type` e dados clínicos opcionais (`mobility_json`, `pain_json`, `functional_json`, `gait_json`). Ela não reescreve avaliações, datas, resultados ou fotos antigos. `tenant_id` é o identificador de clínica já adotado pelo projeto. `patient_id` já era usado na base; o editor passa a aceitá-lo explicitamente sem retirar o contrato legado `student`.

Os dados funcionais complementares são observações estruturadas no mesmo registro; os formulários especializados já existentes do Fisio continuam disponíveis. Comparação numérica, percentual, TAV compatível por protocolo/unidade, fotos lado a lado e referência inicial continuam usando a implementação do Personal. O relatório compartilhado usa impressão do navegador, com a opção Salvar PDF. O Zemda360 existente continua usando seus anexos e mapa corporal; o novo painel não copia imagens para ele.

## Validação

- Builds TypeScript e Vite.
- `backend/test-shared-clinical-assessments.cjs`: distribuição, contexto, isolamento, negativas de capability, histórico, comparação, relatório e preservação da migração.
- Regressões do Personal: cálculos, relatórios, postura, fotos, alunos, treinos e Zemda360.
- `frontend/tests/shared-clinical-assessments-browser.cjs`: seções por profissão e payload de gravação no navegador.

Comandos reproduzíveis: `npm run test:clinical-assessments --prefix backend` e `npm run test:clinical-assessments --prefix frontend`.
