# Zemda — header e auditoria de documentos

Data: 15/10/2026.

## Resultado

- Troca de clínica mantida apenas no header. O bloco inferior da lateral continha o seletor duplicado e o indicador Online; nenhuma navegação crítica foi removida. Rodapé mantém Ambiente Seguro • LGPD.
- Seletor com largura responsiva máxima de 240 px, texto truncado, nome completo e papel no seletor nativo/tooltip. Ícone, seta, carregamento, erro e troca de tenant preservados. Ajuda, configurações e saída continuam disponíveis.
- O horário NÃO era transportado pelos fluxos genéricos de atestado, receita e pedido. Agora a emissão consulta o prontuário correto da mesma clínica/paciente/consulta e grava data, horário e origem junto ao documento. Alterar o prontuário posteriormente não muda esse contexto já emitido.
- Prontuário existente sem horário, inclusive importado, permanece sem horário no documento. Não é substituído pelo horário da agenda. Somente na ausência de prontuário vinculado é usado o horário real registrado no agendamento. Emissão avulsa sem vínculo omite data/hora de atendimento.
- Finalização com evolução complementar preserva a data/hora já registrada no atendimento, inclusive horário ausente. Datas de calendário são formatadas sem conversão UTC que deslocava aniversários e datas de início.
- Documentos antigos não foram retroativamente preenchidos nem tiveram hashes alterados. A correção de contexto aplica-se às novas emissões; documentos antigos sem horário salvo continuam sem horário.

## Fluxos e correções adicionais

- Atestados/declarações: título compatível com profissão; comparecimento não gera repouso indevido nem um dia de afastamento por padrão. Texto usa data/hora do atendimento, assinatura usa nome/registro preservados na emissão. Removida afirmação automática de consentimento para CID que não era comprovada por esse fluxo.
- Receitas e pedidos: contexto temporal persistido, emissor validado na clínica ativa e leitura com joins limitados ao tenant. Emissão avulsa mantida; se houver vários emissores possíveis, exige identificação válida em vez de escolher arbitrariamente o primeiro profissional.
- Histórico: número, vínculo, conteúdo e contexto persistidos; assinatura interna incorpora data/hora da nova emissão. Este hash interno não representa por si só assinatura ICP-Brasil.
- Orientações ao paciente: corrigido o tratamento das respostas encapsuladas de paciente/agendamento. Profissional e conselho vêm juntos do atendimento vinculado, evitando nome de um profissional com registro do usuário logado. Respostas antigas e clínica anterior não liberam impressão.
- Psicologia: data/hora do atendimento incorporadas ao texto persistido quando vinculadas; logo institucional incluído; campos escapados no HTML de impressão. Removido QR que enviava hash interno para uma rota incompatível com os tokens de verificação. Rodapé distingue selamento interno da assinatura física/digital. Fluxo próprio de assinatura digital preservado.
- Psicopedagogia: datas corrigidas, data/hora exibidas apenas quando fornecidas. Modelos sem dados deixam instruções de preenchimento em lugar de inventar instrumentos, evolução favorável ou achados do encaminhamento. Corrigida também a restauração indevida do modelo durante a digitação quando listas opcionais não eram fornecidas. O profissional deve revisar e completar o texto editável antes de emitir.
- Encaminhamento interno: paciente, origem, profissional destinatário e serviço validados na clínica ativa. Esse fluxo registra encaminhamento no histórico/agendamento; não é um PDF autônomo e não fabrica horário de atendimento. Encaminhamento psicopedagógico permanece documento editável.
- Exames a receber: paciente e profissional limitados à clínica ativa; documento não inventa horário porque esse cadastro não possui vínculo de sessão.
- Cabeçalho institucional compartilhado bloqueia emissão durante troca para outra clínica; modal de impressão descarta respostas de documento/tenant anterior e apresenta erro em falhas de carregamento.
- Prévia usa CSS local da aplicação, eliminando dependência do CDN de Tailwind.
- Criação mantém os papéis clínicos autorizados e leitura da recepção onde já existia. Bloqueios de paciente/superadministrador na leitura genérica de documentos protegem conteúdo clínico que antes podia ficar acessível diretamente nessas rotas.

## Validação

- Builds backend/frontend com TypeScript sem erros. Aviso existente do Vite sobre tamanho de alguns chunks permanece.
- API real em banco SQLite descartável, sem pacientes reais: 116 verificações, incluindo migração idempotente, emissão dos três tipos, prontuário com hora diferente da agenda, importado sem hora, snapshots, emissão avulsa, múltiplas clínicas, papéis, psicologia, encaminhamento e exames a receber.
- Navegador Chromium: 20 cenários aprovados com componentes reais e dados sintéticos, incluindo os quatro tipos psicopedagógicos com edição de conteúdo. Sete larguras de 320 a 1920 px; seletor único, ausência de Online, posição dos controles, datas, emissor, omissão de horário, falha de carregamento e isolamento do cabeçalho entre clínicas. Orientações vinculadas e documentos editáveis psicopedagógicos incluídos.
- Cinco PDFs A4 gerados: declaração, atestado de repouso, receita, pedido e exame a receber. Cada exemplo tem uma página; texto extraído confirma paciente/data/hora. Inspeção visual de header e declaração concluída.
- Regressões: test-finish-all-modules.cjs, test-clinical-inventory-finalization.cjs e test-consultations.cjs: 3/3 aprovadas, incluindo finalização dos módulos clínicos.
- Limites: impressão física, integração nativa Android e assinatura com certificado ICP-Brasil real não foram executadas nesta auditoria. Não foram realizadas emissões clínicas reais nem alterações em pacientes de produção.

## Arquivos alterados

Backend:
- package.json
- src/config/database.ts
- src/services/document-context.service.ts (novo)
- src/controllers/appointment.controller.ts
- src/controllers/documents.controller.ts
- src/controllers/pending-exam.controller.ts
- src/controllers/psychology.controller.ts
- src/controllers/referral.controller.ts
- test-document-context.cjs (novo)

Frontend:
- package.json
- src/utils/clinicalDocument.ts (novo)
- src/components/common/Sidebar.tsx
- src/components/common/Navbar.tsx
- src/components/common/ClinicSwitcher.tsx
- src/components/common/ClinicDocumentHeader.tsx
- src/components/clinical/FinishConsultationModal.tsx
- src/components/clinical/PrintableDocumentModal.tsx
- src/components/clinical/PatientFollowUpDocumentModal.tsx
- src/components/psychopedagogy/PsychopedagogyDocumentModal.tsx
- tests/documents-header.cjs (novo)
- HEADER_DOCUMENTS_AUDIT.md (este relatório)

Evidências locais (artefatos ignorados pelo Git): test-results/documents-api-final.log, documents-browser-final.log, documents-browser-render.log, documents-completion-regression.log e pasta documents-header com capturas, PDFs e resultados JSON.
