# Auditoria funcional do ZemdaEstetic — 06/10/2026

## Causa do erro de registro

O workspace enviava `patient_id`, `procedure_name` e `target_region`, mas o controller validava `patientId`, `procedureName` e `region`. As listas usavam URLs `/recurso/patient/:id` inexistentes e esperavam envelopes, enquanto a API retornava arrays. Os erros eram convertidos silenciosamente em listas vazias.

O adaptador `estetic-api.ts` agora traduz os formulários para o contrato da API e normaliza os registros para a interface existente. Falhas de carregamento ficam visíveis, com possibilidade de tentar novamente.

## Correções verificadas

| Fluxo | Correção |
| --- | --- |
| Paciente e navegação | Recuperação pelo parâmetro da rota; sincronização da seleção; descarte de respostas de outro paciente ou área. A sidebar abre/reutiliza o contexto de atendimento do profissional autenticado. |
| Avaliações | Todos os campos estruturados persistidos; data da avaliação; edição sem criar outra ficha; nova ficha explícita; comparação entre duas avaliações. Rascunhos separados por área. |
| Planejamento | Objetivos persistidos; IDs estáveis dos itens; edição/exclusão; atualização de status; contagem de sessões por procedimentos efetivamente registrados. Itens já executados são preservados. |
| Procedimentos | Contrato corrigido; criação, edição, exclusão, listagem e histórico. Data, produto, lote, validade, quantidade, unidade, técnica, intercorrências e orientações persistidos. |
| Estoque | Procedimento, movimento e prontuário na mesma transação. Falhas provocam rollback. Estoque insuficiente, unidade, lote e validade incompatíveis são rejeitados. Edição aplica somente a diferença; exclusão estorna uma vez. IDs de envio evitam repetição. Saldo da interface recarregado após alterações. |
| Fotografias | Upload de PNG/JPEG/WebP até 5 MB; edição, exclusão e visualização; deduplicação; pareamento antes/depois por paciente, área, ângulo e data. O upload existente é persistido como imagem inline no banco; sua exclusão remove essa imagem, sem deixar um objeto de upload separado. URLs externas não são objetos de storage pertencentes ao Zemda. |
| Zemda360 | Mapas identificados por área estética; recuperação na sidebar e na Agenda; histórico filtrado; bloqueio de vínculos com outro paciente ou área. Mudanças são salvas antes de sair da aba, trocar de área/paciente ou finalizar. |
| Evoluções | Criação, edição e exclusão; data explícita; autoria autenticada; vínculo validado ao procedimento; sincronização com prontuário universal. |
| Retornos | Agendamento sem exigir avaliação de uma visita futura; edição, comparecimento, cancelamento e exclusão; data real, status e retoque persistidos; visão geral e contadores atualizados. |
| Finalização | Confirmação e revisão existentes preservadas. Formulários pendentes de todas as áreas são persistidos dentro da transação de finalização; registros já salvos são reutilizados. Procedimentos, fotos e demais registros da sessão mantêm o vínculo ao atendimento. |
| Permissões | Profissional ativo e vínculo clínico válido; restrição de área inclusive em consultas sem filtro; recepção bloqueada; SuperAdmin sem acesso clínico em clínica real. IDs de paciente, atendimento, produto, plano e procedimento são validados no tenant. |

As migrações são aditivas. Nenhuma tabela existente foi removida. O prontuário universal conserva a trilha clínica de registros excluídos; documentos lacrados permanecem imutáveis.

## Validação reproduzível

Todos os testes de integração e navegador usam dados sintéticos e banco temporário, sem abrir a base operacional.

```powershell
npm run build --prefix backend
npm run build --prefix frontend
node backend/run-tests.cjs test-zemda-estetic.cjs test-zemda360.cjs test-consultations.cjs
node frontend/tests/estetic-api.cjs
npx playwright test e2e/specs/clinical/estetic-roundtrip.spec.ts e2e/specs/clinical/estetic.spec.ts
node frontend/tests/docker-build.cjs
```

- Backend: contratos, persistência, permissões, isolamento, rastreabilidade, retorno, histórico, idempotência, diferença de estoque, estorno, insuficiência e rollback provocado por falha real de INSERT.
- Unidade frontend: tradução de payloads, URLs canônicas, normalização de respostas, comparação fotográfica e propagação de erros.
- Navegador: pacientes A e B pela sidebar, três áreas, autosave, criação/edição/exclusão, comparação de avaliações e fotos, planejamento, estoque, evolução, comparecimento/cancelamento, mapas, F5, reabertura e finalização. Cenário separado da Agenda confirma que voltar da revisão não finaliza nem grava o prontuário definitivo.
- Build isolado: compilação somente com os arquivos disponibilizados pelo estágio frontend do Dockerfile, cobrindo a falha anterior de importação no Railway.

O teste de rollback gera intencionalmente um erro de persistência no log; a asserção verifica que nenhum movimento parcial de estoque permaneceu.
