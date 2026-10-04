# Termos & Consentimentos

Serviço universal da clínica, integrado à aba **Termos & Consentimentos** do prontuário. Reutiliza `patient_consents`, o banco SQLite, JWT/tenant, os vínculos clínicos, os contatos de responsáveis e os provedores de e-mail e WhatsApp existentes. Os registros anteriores continuam disponíveis para consulta e revogação.

## Arquivos criados

- `backend/src/config/consents.migration.ts`
- `backend/src/services/consent.service.ts`
- `backend/src/services/consent-pdf.service.ts`
- `backend/src/utils/consent-access.ts`
- `backend/src/routes/consents.routes.ts`
- `backend/test-consents.cjs`
- `frontend/src/components/consents/PatientConsentsPanel.tsx`
- `frontend/src/components/consents/PublicConsentPage.tsx`
- `frontend/src/components/consents/SignatureCanvas.tsx`
- `frontend/src/components/consents/ConsentPendingAlert.tsx`
- `frontend/src/components/consents/consent-api.ts`
- `frontend/src/components/consents/consents.css`
- `frontend/tests/consents-browser.cjs`
- Este guia.

## Arquivos alterados

- `backend/package.json` e `backend/package-lock.json`: PDFKit e QRCode, com respectivas tipagens. O gerador antigo de QR Code não implementa correção de erros completa; o novo recurso usa QRCode sem modificar os documentos antigos.
- `backend/src/config/database.ts`: executa a migration durante a inicialização.
- `backend/src/routes/index.ts`: registra endpoints públicos antes da autenticação e endpoints internos depois dos gates existentes.
- `backend/src/controllers/patient-clinical.controller.ts`: permissões dos consentimentos, linha do tempo, exportação de evidências e proteção contra revogação mutável de documentos novos pelo endpoint antigo.
- `backend/src/seo/seoRoutes.ts` e `backend/src/seo/publicSite.ts`: reconhecem as páginas públicas como rotas da aplicação, com noindex e política de referrer.
- `frontend/index.html`: não carrega GA4 nas novas páginas públicas de consentimentos. As outras páginas mantêm sua configuração.
- `frontend/src/App.tsx`: abre assinatura/verificação diretamente, sem exigir sessão ou carregar overlays privados.
- `frontend/src/components/patients/PatientProfileModal.tsx`: biblioteca universal, registros do paciente e alerta de pendências.
- `frontend/src/components/calendar/CalendarView.tsx`: alerta no detalhe do agendamento e acesso direto à aba de termos.

As alterações preexistentes em `frontend/package.json` e `frontend/tests/personal-evolution.cjs` não fazem parte deste recurso e foram preservadas.

## Migration e persistência

`migrateConsents` é idempotente e roda automaticamente ao iniciar o backend atualizado. Não é necessário executar SQL manualmente. Nesta implementação os testes usam bancos temporários; o banco da clínica não foi migrado por comandos de teste.

Tabelas criadas:

- `consent_templates`: modelos globais ou da clínica; módulo aberto a novas profissões, serviço/procedimento, obrigatoriedade e versão atual.
- `consent_template_versions`: título, conteúdo e SHA-256 imutáveis; edições sempre inserem nova versão.
- `consent_settings`: nível de autenticação e validade dos links por clínica.
- `consent_access_tokens`: somente hash do token, validade, revogação, consumo e estado de OTP.
- `consent_signatures`: identificador, evidências, imagem da assinatura, foto opcional e código público de verificação.
- `consent_audit_logs`: eventos de solicitação, envio, autenticação, assinatura, leitura e cancelamento.
- `consent_invalidations`: motivo, autor e timestamp de cancelamento, separado das evidências assinadas.

A tabela existente `patient_consents` recebe referências ao modelo/versão e snapshots de paciente, clínica, solicitante e assinante, além de hash, nível de autenticação e timestamps.

Versões, assinaturas, auditoria e invalidações são append-only, protegidas por triggers contra UPDATE/DELETE. Documentos emitidos mantêm conteúdo e identidades congelados; depois da assinatura toda a linha do documento fica protegida. Cancelamento não altera a assinatura. Os limites valem também para gerenciadores e superadmins via API; o superadmin não recebe acesso ao conteúdo clínico pelo novo serviço.

Assinaturas e fotos são normalizadas com Sharp e mantidas no banco privado, sem arquivo ou URL pública. Isso permite selar documento, imagem e evidência na mesma transação. Hashes conferem conteúdo, evidências e imagens. O PDF usa exclusivamente os snapshots imutáveis.

Há 13 modelos iniciais: Multidisciplinar, ZemdaFono, ZemdaTO, ZemdaNutri, ZemdaPsico, ZemdaPP, ZemdaPersonal, ZemdaFisio, ZemdaOdonto, Zemda360, ZemdaEstetic, ZemdaMed e ZemdaBody. São textos-base gerais para atendimento; a clínica pode duplicá-los e adaptar informações do procedimento na biblioteca.

## Páginas

- `/assinar-termo/:token`: leitura integral, três declarações, confirmação, assinatura manuscrita e foto opcional quando habilitada na configuração.
- `/verificar/:codigo`: autenticidade, integridade, data, clínica, título, versão, identificador e fragmento de hash. Não expõe paciente, responsável, conteúdo ou imagens.

## Endpoints internos

Prefixo `/api/v1/consents` (o servidor mantém também a compatibilidade `/v1/...`). Exigem JWT, tenant, onboarding e assinatura SaaS conforme os gates existentes.

| Método | Caminho | Finalidade |
| --- | --- | --- |
| GET | `/templates` | Biblioteca global + modelos da clínica |
| POST | `/templates` | Criar/duplicar um modelo na clínica |
| PUT | `/templates/:id` | Editar modelo da clínica, criando nova versão |
| GET | `/settings` | Consultar configuração |
| PUT | `/settings` | Configurar nível/validade, somente gerenciador |
| GET | `/patients/:patientId` | Termos e status do paciente, incluindo histórico anterior |
| GET | `/patients/:patientId/pending?serviceId=...` | Pendências obrigatórias aplicáveis a módulo/serviço |
| POST | `/patients/:patientId/request` | Emitir documento congelado e link temporário |
| POST | `/:id/link` | Renovar link de documento pendente e revogar o anterior |
| POST | `/:id/send` | Enviar novo link por e-mail ou WhatsApp |
| POST | `/:id/cancel` | Cancelar/invalidar com motivo, preservando evidências |
| GET | `/:id/document` | Conteúdo e evidências assinadas para equipe autorizada |
| GET | `/:id/pdf` | Download de PDF com assinatura, foto se utilizada e QR Code |

Criação de modelo: `{title, content, module, professionId?, serviceId?, procedureName?, required}`.

Configuração: `{authLevel: "basic" | "recommended" | "reinforced", linkHours: 1..720, photoRequested: boolean}`. Padrão: recomendado, 168 horas.

Solicitação: `{templateId, signerEmail?: string, guardian?: {name, cpf, relationship, phone, email}}`. Para menores, o responsável é obrigatório, com CPF validado. Identidades de paciente e assinante são armazenadas separadamente. O prontuário preenche os dados do responsável já cadastrado quando disponíveis.

Envio: `{channel: "email" | "whatsapp"}`. Usa os contatos registrados no documento, sem aceitar troca de destinatário pela página pública. Cancelamento: `{reason}`, mínimo de cinco caracteres.

## Endpoints públicos

Prefixo `/api/v1/public/consents`, sem login e com rate limiting. Tokens de assinatura viajam no corpo JSON para não aparecer nos logs de caminhos da API.

| Método | Caminho | Corpo/finalidade |
| --- | --- | --- |
| POST | `/read` | `{token}`: documento da versão emitida |
| POST | `/otp/request` | `{token, channel}`: envia OTP ao contato registrado |
| POST | `/otp/verify` | `{token, code}`: confirma OTP de seis dígitos |
| POST | `/sign` | `{token, documentHash, declarations: [true,true,true], signatureDataUrl, photoDataUrl?, photoAccepted?}` |
| GET | `/verify/:code` | Verificação pública mínima |

Tokens aleatórios de 256 bits, armazenados somente como SHA-256, são temporários e de uso único. A confirmação revalida token, documento, cancelamento e OTP dentro da transação. Duas confirmações concorrentes produzem exatamente uma assinatura.

OTP usa scrypt com salt aleatório, vence em dez minutos, permite até cinco tentativas e tem intervalo mínimo de 60 segundos entre envios e limite de cinco códigos por documento/hora. Falhas são auditadas sem registrar o código. Provedores não configurados retornam erro; nenhum envio fictício é apresentado como real.

A foto é uma configuração independente do nível e permanece opcional. A câmera é aberta por ação explícita do assinante; a finalidade precisa ser aceita antes da inclusão. Não há reconhecimento facial.

## Testar o fluxo completo

1. Instalar dependências do backend com `npm ci`, executar `npm run build` e iniciar/reiniciar o backend para aplicar a migration. Compilar o frontend com `npm run build`.
2. Como usuário clínico autorizado, abrir um paciente e a aba **Termos & Consentimentos**. Para profissionais, utilizar paciente com atendimento, encaminhamento ou registro de assistência vinculado; responsáveis administrativos sem acesso clínico não recebem as assinaturas.
3. Abrir a biblioteca, duplicar um modelo ou criar termo próprio. Relacionar módulo/serviço/procedimento e marcar obrigatório. Conferir alerta no prontuário e no detalhe de um agendamento aplicável.
4. Como gerenciador, escolher nível de confirmação e validade. Para básico, não é necessário provedor de mensagens. Para recomendado/reforçado, cadastrar contato do assinante e configurar o Resend já usado pelo Zemda ou o WhatsApp Infobip existente.
5. Solicitar assinatura e escolher este dispositivo, envio de link ou QR Code. Para menores, conferir os dados do responsável legal.
6. Abrir o link sem conta do Zemda. Ler o texto, aceitar as três declarações, confirmar OTP se exigido, desenhar assinatura e confirmar. No reforçado, testar com e sem foto opcional.
7. Retornar ao prontuário: os dados são atualizados ao recuperar o foco, ou pelo botão **Atualizar**. Baixar o PDF, imprimir pelo leitor de PDF e abrir seu QR Code. Conferir que a verificação não revela dados do paciente.
8. Editar o modelo: aparece nova versão e necessidade de nova assinatura. O PDF anterior mantém exatamente o conteúdo original. Depois de assinar a versão atual, a anterior continua no histórico sem alerta de nova assinatura.
9. Cancelar uma solicitação ou invalidar um documento assinado com motivo. O link pendente deixa de funcionar; o documento assinado permanece íntegro e a página de verificação informa a invalidação.

Testes automatizados:

```powershell
cd backend
npm run build
node run-tests.cjs test-consents.cjs test-patient-data-rights.cjs test-clinical-module-resolution.cjs test-consultations.cjs test-start-permissions.cjs
cd ../frontend
npm run build
node tests/consents-browser.cjs
```

O teste de navegador usa Playwright/Chromium, disponível no ambiente de desenvolvimento atual. Todos os bancos e documentos de teste são temporários. Os provedores são simulados: não enviam mensagens reais.

## Validação realizada

- Builds TypeScript/Vite e backend passaram.
- 87 verificações do backend atualizado: permissões, isolamento, imutabilidade, concorrência, menores, OTP, expiração, cancelamento, PDF e verificação pública.
- 20 cenários de navegador: biblioteca, obrigatoriedade, assinatura básica e com OTP, desktop/mobile, PDF, versionamento e ausência de trackers nas páginas públicas.
- Regressões de módulo clínico, consultas, permissões e exportação/revogação histórica passaram.
- PDF renderizado e revisado visualmente, incluindo versão com responsável legal e foto opcional.
- `test-guardian-authorization.cjs` tem uma falha preexistente no agendamento público: retorna 404 “Agendamento online indisponível” onde o teste espera 201. A mesma falha foi reproduzida carregando os arquivos anteriores do HEAD em um banco temporário; não foi modificada nesta tarefa.

Sem commit, push, deploy ou mensagens reais.


## Auditoria das correções — 04/10/2026

1. Arquivos alterados: `backend/src/config/consents.migration.ts`, `backend/src/controllers/patient-clinical.controller.ts`, `backend/src/utils/consent-access.ts`, `backend/src/services/consent.service.ts`, `backend/src/services/consent-pdf.service.ts`, `backend/src/services/email-template.service.ts`, `backend/src/services/email.service.ts`, `backend/test-consents.cjs`, `frontend/src/components/consents/PatientConsentsPanel.tsx`, `PublicConsentPage.tsx`, `consent-api.ts`, `consents.css`, `frontend/src/components/personal/PersonalTechnicalFields.tsx`, `frontend/tests/consents-browser.cjs` e este guia.
2. Nenhum componente, serviço ou tabela paralela foi criado nesta correção.
3. Migrations adicionais: `consent_settings.photo_requested`, inteira, padrão 0, e `consent_templates.profession_id` para associação opcional à profissão. A decisão é congelada no snapshot imutável de cada nova solicitação. Solicitações antigas preservam o comportamento anterior. Clínicas anteriormente no nível reforçado mantêm a foto habilitada na migração; omitir o novo campo em clientes anteriores preserva a configuração atual.
4. Endpoints: mantidos os existentes. Settings aceita `photoRequested`; emissão aceita `signerEmail` para salvar o contato do paciente antes de congelar o documento. Read retorna destinos mascarados e configuração de foto; verificação retorna versão.
5. Componentes: quatro ações de solicitação, assinatura na mesma tela com voltar, recuperação de erro e timeout, OTP em seis posições com autofill, cooldown, câmera com prévia/refazer/confirmar, lista ampliada e visualização do PDF para impressão.
6. Serviço de e-mail: `EmailService.sendCustomEmail`, com Resend já existente. WhatsApp continua no `InfobipService`.
7. Template OTP: `buildZemdaEmailLayout` e `buildZemdaOtpBox`, este último compartilhado com o OTP de cadastro. Saudação e contexto da clínica, sem texto clínico.
8. Template de solicitação: mesmo layout institucional, botão Revisar e assinar documento, rodapé institucional; não contém o conteúdo do termo.
9. Destinatário: `ConsentService.issue` congela paciente.email no adulto ou guardian.email no responsável; `requestOtp` utiliza exclusivamente esse contato. Sem fallback para clínica ou profissional.
10. Adulto/responsável: is_child ou idade inferior a 18 exige responsável; formulário preenche o responsável existente. E-mail corrigido de responsável cadastrado é salvo por paciente/tenant/CPF antes de concluir a emissão. E-mail adicionado de adulto é salvo no paciente sem reiniciar a seleção do termo.
11. Filtro backend: `allowedModule` reutiliza `CapabilityService.computeUserCapabilities`; biblioteca, criação/edição, emissão, consulta e PDFs respeitam módulo canônico e termos general. Histórico novo usa módulo congelado; documentos anteriores usam a associação existente. Frontend recebe somente biblioteca autorizada e limita opções de módulo aos retornados.
12. Foto: checkbox independente nas configurações; página pública recebe a decisão da solicitação, captura com aceite, prévia, refazer e confirmação. Imagem normalizada em armazenamento privado existente e PDF com REGISTRO FOTOGRÁFICO DA ASSINATURA. Pode assinar sem foto.
13. OTP: hash e salt apagados ao validar, reutilização rejeitada, reenvio limpa validação anterior; logs adicionais OTP_REQUESTED/OTP_RESENT/OTP_SENT/OTP_INVALID/OTP_VALIDATED/OTP_EXPIRED/OTP_TOO_MANY_ATTEMPTS incluem destino mascarado e identificação da verificação.
14. Testes locais: builds de backend e frontend, test-consents.cjs e consents-browser.cjs; regressões test-clinical-module-resolution.cjs e test-patient-data-rights.cjs. Provedores simulados, câmera virtual Chromium e eventos de toque/caneta pelo CDP; não houve envio real ou validação em câmera física. Não há script de lint configurado; TypeScript faz parte dos builds.
15. Variáveis existentes: APP_URL, RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO; WhatsApp opcional INFOBIP_API_KEY, INFOBIP_BASE_URL, INFOBIP_WHATSAPP_SENDER. Nenhuma variável nova. Sem commit, push ou deploy.
