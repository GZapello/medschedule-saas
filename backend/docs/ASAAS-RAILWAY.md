# Zemda + Asaas — implantação e homologação

Estado: código implementado e testes locais com gateway simulado aprovados. A homologação real no Sandbox ficou para o Railway, por escolha do responsável. Não liberar cobrança em Produção antes de completar essa homologação e obter autorização explícita.

## 1. Variáveis do backend no Railway

```dotenv
ASAAS_ENV=sandbox
ASAAS_API_URL=https://api-sandbox.asaas.com/v3
ASAAS_API_KEY=<chave do Sandbox, somente no backend>
ASAAS_WEBHOOK_TOKEN=<segredo aleatório forte, com pelo menos 32 caracteres>
APP_URL=https://zemda.com.br
```

Use o domínio real do ambiente que receberá os testes em `APP_URL`. Não crie variáveis `VITE_ASAAS_*`. Não coloque chaves no GitHub, no frontend, em screenshots, logs ou mensagens. O arquivo `backend/asaas.env.example` contém apenas nomes e exemplos públicos.

O Dockerfile existente compila frontend e backend, usa Node 22 e inicia `node dist/server.js`. Preserve o volume `/data` e `DATABASE_PATH=/data/saas_schedule.db`. A arquitetura atual usa SQLite: mantenha uma instância gravadora, com o volume persistente. Faça backup consistente antes da primeira inicialização com a migração.

## 2. Envio ao GitHub

Antes do commit, confira `git status` e `git diff`. Os comandos abaixo enviam os arquivos desta implementação, sem adicionar `.env` ou bancos locais:

```powershell
cd "C:\Users\gabri\OneDrive\Documents\antigravity-projects"
git add backend/src backend/package.json backend/test-billing.cjs backend/asaas.env.example backend/docs/ASAAS-RAILWAY.md frontend/src
git diff --cached --stat
git commit -m "Implementa assinaturas Zemda com checkout Asaas e webhooks"
git push origin main
```

O envio e o deploy não foram executados nesta sessão. Confira o deploy do serviço conectado ao repositório e o resultado do build no Railway.

## 3. Webhook na conta Asaas Sandbox

Configure na conta Sandbox:

- URL: `APP_URL` seguido de `/api/webhooks/asaas`.
- Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`.
- API versão 3, envio sequencial, habilitado e não interrompido.
- Eventos: `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`, `CHECKOUT_CREATED`, `CHECKOUT_PAID`, `CHECKOUT_CANCELED` e `CHECKOUT_EXPIRED`.

Asaas envia o token no cabeçalho `asaas-access-token`. O endpoint rejeita token ausente/incorreto com 401, sem JWT de usuário. A API key nunca é o token do webhook. Veja a [documentação de eventos de checkout](https://docs.asaas.com/docs/eventos-para-checkout).

Depois, acesse **Painel Global → Integrações → Asaas → Testar conexão**. A tela informa ambiente, resultado e último teste, sem revelar credenciais. O teste consulta o gateway; o cadastro do webhook deve ser conferido separadamente no Asaas.

## 4. Fluxo de homologação real obrigatório

Use apenas clínicas e pagadores de teste no Sandbox e os meios de simulação disponibilizados pelo Asaas.

1. Cadastre uma clínica nova, entre como seu responsável e escolha **Solo**. Caso necessário, preencha **Dados de cobrança**. Confira que o checkout Asaas exibe R$ 59,90, cartão e recorrência mensal.
2. Antes de pagar, abra `/assinatura/sucesso` manualmente. O plano deve permanecer pendente, sem liberar operação.
3. Conclua o pagamento no checkout hospedado. Confirme a entrega do webhook, o processamento e a assinatura `ACTIVE`. O gestor inicial deve contar como o único usuário do Solo.
4. Tente criar/ativar outro acesso no Solo. Deve retornar `PLAN_USER_LIMIT_REACHED`, sem inserir um usuário ativo extra.
5. Valide Equipe com cinco acessos e rejeição do sexto; Clínica com trinta e rejeição do 31º. SuperAdmin não conta.
6. Reenvie o mesmo evento pelo Asaas. Deve haver um único registro de evento e de cobrança, sem somar um mês novamente.
7. Simule atraso de uma renovação: `PAST_DUE`, aviso e tolerância de cinco dias a partir do vencimento. Confirme `SUSPENDED` após o prazo, preservando pacientes, agenda, documentos e financeiro. A área de assinatura deve permanecer acessível.
8. Confirme a cobrança em atraso: `ACTIVE`, acesso restaurado. Uma clínica banida administrativamente deve continuar banida.
9. Programe Solo → Equipe. A API altera a próxima cobrança, sem pró-rata. O limite atual permanece até o pagamento do novo ciclo. A alteração de valor de recorrência no cartão depende de tokenização habilitada na conta Asaas; o Zemda não recebe nem guarda o token do cartão. Consulte [atualização de assinaturas](https://docs.asaas.com/reference/atualizar-assinatura-existente).
10. Com 12 usuários, tente mudar para Equipe: a operação deve pedir a desativação de sete usuários antes de continuar. Depois de programado um downgrade, novas ativações já respeitam o menor limite, evitando ultrapassá-lo até o próximo ciclo.
11. Cancele/expire um checkout sem pagamento. Ele não pode ativar a assinatura. Faça também um cancelamento de renovação: a recorrência deve ser encerrada no Asaas, com preservação dos dados e do período já pago.
12. Altere o valor enviado pelo navegador: o checkout deve continuar usando o preço cadastrado em `plans`, nunca o valor enviado pelo frontend.
13. Confira os totais, filtros, distribuição por plano e MRR em **Painel Global → Assinaturas**. MRR soma apenas assinaturas gerenciadas `ACTIVE` atuais; assinaturas antigas, ainda não integradas, não entram.

Registre data, clínica de teste, IDs não secretos de checkout/assinatura/cobrança/evento e resultado. Não inclua dados de cartão nem credenciais nas evidências. A integração só estará homologada depois desses passos no gateway real.

## 5. Decisões de implementação

- Planos oficiais: Solo (R$ 59,90 / 1), Equipe (R$ 119,90 / 5), Clínica (R$ 359,90 / 30). O plano limita acessos, não módulos profissionais.
- `plans` e `subscriptions` existentes foram migradas sem descartar registros. Assinaturas legadas permanecem não gerenciadas até a clínica aderir ao fluxo Asaas; clínicas existentes não são automaticamente cobradas ou suspensas pela migração.
- Novos cadastros têm acesso do responsável à área de assinatura enquanto pendentes. Só a confirmação financeira libera a contratação inicial. Banimentos, bloqueios e recusas administrativos não são removidos pelo pagamento.
- Upgrade/downgrade: mudança para a próxima cobrança, sem pró-rata. O preço no gateway é atualizado com `updatePendingPayments`; o plano local muda mediante confirmação da cobrança correspondente. Em caso de impedimento do gateway, não se aplica o novo limite.
- Cancelamento: encerra a recorrência no gateway, registra autor/motivo e mantém o período já pago. Uma nova contratação após cancelamento é permitida depois do encerramento desse período, evitando sobreposição de cobranças.
- Limites: contagem distinta por usuário e clínica, com exclusão do SuperAdmin. Gatilhos SQLite protegem inserções/ativações simultâneas; validações de endpoint retornam a mensagem de limite.
- Webhooks: armazenamento durável, índice único por evento, consulta ao Asaas para verificar cobranças e associação por identificadores da assinatura/checkout. Campos extras são tolerados, mas apenas uma lista de campos financeiros sem dados de cartão é persistida.
- Processamento: worker a cada 30 segundos, retentativa com espera progressiva e verificação de tolerância também nas requisições. Eventos ainda sem associação ficam pendentes; após 48 horas sem associação são ignorados, sem alterar clínicas.
- Falhas ambíguas na criação de cliente/checkout não geram um novo POST automaticamente. O cliente é localizado por referência externa; um webhook de checkout pode recuperar o ID perdido. Quando não houver confirmação, confira a referência no painel Asaas antes de autorizar outra tentativa. A aplicação não informa sucesso financeiro nesse caso.
- Cancelar ou pagar nunca exclui dados clínicos. A exclusão administrativa definitiva também encerra a assinatura antes de remover os dados locais.

## 6. Rotas

Todas estão sob `/api`; aliases `/api/v1/...` existem para compatibilidade com o aplicativo.

| Método | Rota | Acesso |
|---|---|---|
| GET | `/plans` | Público |
| GET | `/subscriptions/current` | Usuário da clínica; histórico detalhado somente para quem gerencia |
| GET/PUT | `/subscriptions/profile` | Responsável/gerenciador autorizado/SuperAdmin |
| POST | `/subscriptions/checkout` | Mesmo controle; body `planCode` |
| POST | `/subscriptions/change-plan` | Mesmo controle; body `planCode` |
| POST | `/subscriptions/cancel` | Mesmo controle; exige `confirmation: CANCELAR` |
| POST | `/webhooks/asaas` | Token próprio do Asaas |
| GET | `/admin/subscriptions` | SuperAdmin |
| GET | `/admin/integrations/asaas/status` | SuperAdmin |
| POST | `/admin/integrations/asaas/test` | SuperAdmin |

Telas: `/planos`, `/assinatura`, `/assinatura/sucesso`, `/assinatura/cancelada`, `/assinatura/expirada`, Configurações → Assinatura e Plano, Painel Global → Assinaturas/Integrações.

## 7. Testes locais e pendências

```powershell
cd "C:\Users\gabri\OneDrive\Documents\antigravity-projects\backend"
npm run test:billing
node test-clinic-control.cjs

cd "C:\Users\gabri\OneDrive\Documents\antigravity-projects\frontend"
npm run build
```

O teste de billing cria SQLite temporário e simula apenas o gateway. Valida o percurso de cadastro, checkout, autenticação de webhook, confirmação, 1/5/30 acessos, inadimplência, tolerância, reativação, mudança de plano, estorno histórico, cancelamento, duplicidade, falha ambígua, autorização e isolamento de ambiente/segredos. A suíte administrativa anterior também passou.

Build do backend e TypeScript do frontend: aprovados. O build Vite completo falhou no ambiente desta sessão com `spawn EPERM` ao iniciar esbuild. Não houve verificação visual em navegador; confirme o build e as telas no Railway.

Existe uma falha anterior na primeira inicialização de um banco totalmente vazio: uma inserção da taxonomia ocorre antes do seed e gera aviso de FK. Os testes inicializam novamente após o seed, exercitando a migração de forma idempotente. Essa condição preexistente não foi alterada nesta implementação; para um Railway novo sem banco, confira a inicialização e reinicie após o primeiro seed antes de homologar.

## 8. Produção — somente depois da homologação e autorização

Não foi alterada nenhuma variável do Railway, ativada cobrança real, feito push ou deploy nesta sessão. Depois de aprovação explícita, configure as variáveis de Produção e seu webhook correspondente no backend. IDs de Sandbox não são reutilizados para chamadas de Produção; a aplicação recusa operar uma assinatura pertencente a outro ambiente.

Referências adicionais: [criar checkout](https://docs.asaas.com/reference/criar-novo-checkout), [checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente), [eventos de assinaturas](https://docs.asaas.com/docs/eventos-para-assinaturas). A confirmação não depende das URLs de retorno.
