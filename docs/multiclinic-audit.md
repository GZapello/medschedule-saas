# Auditoria multi-clínica — 14/10/2026

## Estado anterior às alterações

- `clinic_users` já tem unicidade `(tenant_id,user_id)`, status e permissões. É a estrutura adequada para vínculos.
- JWT carrega papel e tenant legados; auth.middleware compara papel global e exige acesso ao tenant do token antes de considerar o header. tenant.middleware recusa outras clínicas mesmo com vínculo.
- `/auth/me` resolve tenant ativo, mas preserva papel global. CapabilityService também consulta papel global.
- AuthContext.switchTenant grava o header antes da validação, não restaura em falha e não recarrega usuário/permissões. App descarta convite para usuário autenticado.
- Convite público atual permite cadastro novo e consome o token na transação de cadastro. Falta aceite autenticado de conta existente.
- professionals tem UNIQUE(user_id), incompatível com perfis por clínica. Migração deve preservar IDs e referências históricas.
- Staff lista papel/tenant globais, autoriza alvo pelo tenant legado, altera status/papel global e purga a identidade após desativação local. Esses caminhos conflitam com contas multi-clínica.
- billing_active_users já conta vínculos ativos por clínica e exclui pendentes. requireCapacity e triggers devem ser reutilizados sem alterar preços.
- Cadastro, Google, recuperação de senha e perfil utilizam identidade global. Login e retorno de OAuth precisam preservar destino de convite sem aceitar redirect externo.
- SuperAdmin tem bypass próprio; não deve receber vínculo normal nem compartilhamento clínico.

## Inventário de isolamento clínico

Inventários de busca: `tmp/multiclinic-legacy-audit.txt` (104 ocorrências em 30 arquivos), `tmp/multiclinic-patient-audit.txt`, `tmp/multiclinic-controller-inventory.json`. São índices de revisão, não prova de cobertura funcional.

| Área | Fronteira atual / risco |
|---|---|
| Pacientes | tenant_id direto; detalhe inclui notes_admin e convênio; não compartilhar resposta integral |
| Agenda | tenant por agendamento; identidade do paciente precisa de validação explícita antes da criação |
| Prontuário universal | records por tenant, hasClinicalAccess; private_notes e JSON clínico precisam de projeção por escopo |
| Linha do tempo | compõe agenda, documentos e registros; não exportar timeline integral |
| Fono / TO / Nutri / Psico / PP / Fisio / Odonto / Personal / Estetic / Med | tabelas e validações por tenant em cada controller; nenhuma exceção genérica é segura |
| Zemda360 / avaliações compartilhadas | shared/clinical-assessments significa recursos entre profissões, não entre clínicas; já aplica capabilities e projeção |
| Documentos | conclusão de consulta consulta pagamentos; separar conteúdo assistencial de recibos e cobrança |
| Arquivos / fotos / exames | R2 e tokens assinados; autorização precisa ser reavaliada após revogação, não basta liberar URL |
| Financeiro / estoque / assinatura / equipe / configurações | isolamento atual deve permanecer |

## Invariantes da implementação

Identidade global permanece intacta. Papel efetivo é resolvido por vínculo ativo a cada requisição. Aceite é transacional com validação de capacidade e consumo único. Compartilhamento exige autoridade na origem, seleção explícita, escopo permitido e consentimento versionado. Origem dos registros nunca é reatribuída. Revogação de equipe e de dados são independentes. Não habilitar escopos sem integração e testes das respectivas rotas.
