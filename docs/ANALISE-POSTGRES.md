# Análise: migrar de SQLite para PostgreSQL?

Esta análise se baseia num levantamento completo do código em `backend/src` (contagens por busca, com exemplos verificados) e em preços pesquisados em setembro de 2026. As estimativas de esforço são grosseiras e estão marcadas como tal.

## Resumo

- **É possível, mas é um projeto grande.** O SQLite não está isolado atrás de uma camada: ele está espalhado pelo sistema inteiro, com **1.667 consultas em 82 arquivos**, todas **síncronas**. Os drivers de Postgres são assíncronos. Então cerca de 340 handlers, 3 middlewares, 15 services e 25 transações precisam ser reescritos, além de centenas de trechos de SQL específicos do SQLite.
- **Estimativa grosseira:** 4 a 8 semanas de trabalho em tempo integral de um desenvolvedor experiente, mais um ensaio de migração de dados. Em ritmo de noites e fins de semana, isso vira meses.
- **Recomendação: não migrar agora.** No estágio atual (um servidor, poucas clínicas, carga de escrita baixa), o SQLite dá conta, e os riscos reais são resolvidos com mudanças pequenas. O melhor uso do tempo é "endurecer" o SQLite (seção 3) e preparar o terreno. Migre quando algum dos gatilhos da seção 4 aparecer.

## 1. O que o levantamento encontrou

| Aspecto | Número | Por que importa |
|---|---|---|
| Chamadas `prepare()` (consultas) | **1.667** em 82 arquivos; ~1.340 SQLs distintos | Cada uma precisa ser revisada |
| Handlers de rota que hoje são síncronos | **~340** de 459 | Todos precisam virar `async`, e um `await` esquecido gera bugs silenciosos |
| `logAudit` (auditoria), síncrono | chamado em **149** lugares | O efeito cascata é grande: quem chama vira `async` também |
| Consultas dentro de laços (`for`, `.map`, `.forEach`) | ~140 | No Postgres cada uma vira uma ida à rede, e o desempenho pode piorar sem ajuste |
| Transações | 25 via `db.transaction` + 13 `BEGIN` manuais | No Postgres cada transação precisa de uma conexão dedicada, passada para todas as funções chamadas dentro dela |
| `datetime('now')` | **673** (290 como `DEFAULT` de coluna) | Sintaxe exclusiva do SQLite |
| Datas guardadas como texto, em **dois formatos misturados** | `YYYY-MM-DD HH:MM:SS` (SQL) e ISO `…T…Z` (67× no JS) | A conversão para `timestamptz` exige análise, não só busca e substituição |
| Booleanos como 0/1 | 143 no SQL + 147 no JS | No Postgres o ideal é `boolean` |
| `LIKE` em buscas | 54 | No SQLite ignora maiúsculas/minúsculas; no Postgres não. As buscas mudariam de comportamento (vira `ILIKE`) |
| `COUNT`/`SUM`/`AVG` | 125 | O driver `pg` devolve esses valores como **texto** e exige conversão |
| Tabelas | **191** nomes distintos. `schema.sql` tem 34; o resto nasce em ~2.000 linhas de migração ad hoc (`database.ts` tem 3.488 linhas) | Seria preciso consolidar num schema-base do Postgres e adotar uma ferramenta de migração |
| Migrações ad hoc | 236 `addColIfMissing`, 4 recriações de tabela, uso de `sqlite_master`/`PRAGMA` | Não existe versão do schema; hoje o "estado" é inferido em tempo de execução |
| Triggers/views | 2 triggers (`RAISE(ABORT, 'PLAN_USER_LIMIT_REACHED')`) + 2 views na cobrança | A regra de limite de usuários por plano **depende de o SQLite serializar escritas** (comentário em `billing-migration.ts:141`). No Postgres precisa de lock explícito |
| Testes | 27 testes presos a arquivos SQLite; 465 `prepare` síncronos nos testes | Precisariam de Postgres no CI e reescrita para `await` |

**O que facilita:**

- Todas as chaves primárias são **texto/UUID**, sem `AUTOINCREMENT`, então não há sequências para acertar.
- Todas as consultas usam `?` posicional; não há parâmetros nomeados.
- Existe um wrapper único (`SafeDatabase` em `database.ts:34-72`).
- Não há uso de `GROUP_CONCAT`, funções JSON do SQLite, `COLLATE NOCASE` nem `VACUUM` no código de negócio.
- O app desktop e o Android são clientes que só falam com a API, e o frontend não usa o Dexie, apesar de ele estar instalado. **Nada fora do backend depende do SQLite.**

**Bug encontrado durante o levantamento:** `free-trial.controller.ts:421` usa `db.transaction(async () => …)`. Como o wrapper é síncrono, ele dá `COMMIT` no primeiro `await` (linha 477), e o restante das gravações roda **fora da transação**. Ativações simultâneas do mesmo link podem passar juntas. Há uma tarefa sugerida no app para corrigir.

## 2. Quanto esforço (estimativa)

| Pacote de trabalho | Tamanho | Principal motivo |
|---|---|---|
| Driver e wrapper (`pg`, `?` → `$1`, `rowCount`, conversão de números) | M | O wrapper único ajuda, mas há 9 arquivos usando o SQLite direto |
| **Síncrono → assíncrono** | **G** (o maior) | 1.667 consultas, ~340 handlers, `logAudit` ×149, transações que chamam helpers com o `db` global |
| Dialeto SQL | M/G | Boa parte é mecânica (`datetime('now')` → `now()`, `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`), mas datas, `LIKE` e booleanos exigem cuidado |
| Schema e ferramenta de migração | G | Consolidar 191 tabelas espalhadas + triggers da cobrança |
| Testes e CI | M | Postgres no CI; reescrever os testes; 13 testes **já quebrados** reduzem a rede de segurança |
| Migração de dados e virada | M | Converter datas mistas e 0/1; ensaiar; janela de manutenção; plano de volta |

## 3. O que fazer em vez de migrar agora ("endurecer" o SQLite)

Os riscos reais do SQLite hoje não pedem Postgres:

| Risco atual | Solução barata | Esforço |
|---|---|---|
| Perder o banco (volume, corrupção, erro humano) | **Backup criptografado no R2**, já implementado nesta branch (`docs/BACKUP.md`) | Feito |
| Perder até 24h de dados entre backups | **[Litestream](https://litestream.io)**: replica o SQLite continuamente para o R2 (compatível com S3), com perda de segundos. Roda como processo ao lado do Node no container | P/M (mudar o Dockerfile + testar a restauração) |
| `node:sqlite` é **experimental** no Node 22 (usado no Docker e no CI), e por isso aparece o aviso "ExperimentalWarning" nos logs | Subir o runtime para **Node 24 LTS**, onde o `node:sqlite` é *release candidate* (API estável). Ou trocar por `better-sqlite3`, que é maduro, tem API síncrona quase idêntica e exige mudança pequena | P |
| Schema sem versão (236 `addColIfMissing`) | Criar uma tabela `schema_migrations` e migrações numeradas daqui para frente. Também é pré-requisito de qualquer migração futura | M |
| Bugs de transação | Corrigir o `free-trial` e proibir `async` dentro de `db.transaction` (checagem simples no wrapper) | P |

**Para não piorar a migração futura, adote desde já em código novo:**

- datas geradas no JS em ISO (`new Date().toISOString()`) em vez de `datetime('now')`;
- sem SQL montado com `${...}`;
- consultas fora de laços.

## 4. Quando migrar (gatilhos)

Reavalie a migração quando **algum** destes acontecer:

1. **Precisar de mais de um servidor**, para escalar horizontalmente ou fazer deploy sem interrupção. O SQLite num volume só funciona com uma instância.
2. **Contenção de escrita visível:** erros `SQLITE_BUSY`, latência alta em horários de pico, banco com vários GB e muitas escritas simultâneas.
3. **Exigência contratual** de alta disponibilidade, réplicas ou recuperação a um ponto no tempo com SLA, como clientes grandes ou hospitais.
4. **Relatórios e BI pesados** competindo com o uso do app.
5. **Outro serviço** precisar acessar o mesmo banco.

Enquanto nenhum aparecer, a migração custa muito e entrega pouco.

## 5. Se/quando migrar: como fazer com menos risco

1. **Pré-requisitos:**
   - corrigir os 13 testes quebrados, para ter rede de segurança;
   - versionar as migrações (seção 3);
   - padronizar os formatos de data.
2. **Tornar a camada de dados assíncrona ainda no SQLite.** O wrapper passa a expor `await db.get(...)` e os chamadores migram aos poucos, com os testes validando cada passo. Este é o maior bloco de trabalho e **pode ser feito incrementalmente, sem trocar de banco e sem risco de virada.**
3. **Corrigir o dialeto** e criar o schema-base do Postgres com ferramenta de migração (por exemplo, `node-pg-migrate`, Kysely ou Drizzle).
4. **CI rodando a suíte contra os dois bancos** até ficar verde nos dois.
5. **Migração de dados** por script (ou `pgloader`), com **ensaio** numa cópia do backup de produção.
6. **Virada** com janela de manutenção e plano de volta (o backup do SQLite continua existindo).

## 6. Onde hospedar o Postgres (preços de set/2026, conferir antes de decidir)

| Opção | Custo | Observações |
|---|---|---|
| **Railway Postgres** | Cobrança por uso: ~US$ 10–20/mês para um banco pequeno sempre ligado, mais US$ 0,15/GB de volume. O plano Hobby limita volumes a 5 GB | Mesma plataforma do app, mas **está na conta do seu sócio** (o plano Hobby não permite colaboradores) |
| **Neon** | Grátis: 0,5 GB, 100 CU-horas/mês, histórico de recuperação de só 6h. Planos pagos por uso | Postgres "serverless" que desliga quando ocioso. O gratuito serve para desenvolvimento, não para produção com dados de saúde |
| **Supabase** | Grátis: 500 MB, **pausa após 1 semana sem uso, sem backup**. Pro: US$ 25/mês | Você já usa em outro projeto. O gratuito é inadequado para produção |

Sobre a **LGPD**: prefira uma região no Brasil quando o provedor oferecer. Caso contrário, é transferência internacional (art. 33), como já acontece hoje com o Railway, e precisa constar na política de privacidade e no contrato com as clínicas (ver `docs/LGPD-CHECKLIST.md`).

---

**Fontes:**
[Railway: Pricing Plans](https://docs.railway.com/pricing/plans) ·
[Railway Pricing 2026 (srvrlss.io)](https://www.srvrlss.io/provider/railway/) ·
[Neon: Plans](https://neon.com/docs/introduction/plans) ·
[Supabase Free Tier Limits 2026 (UI Bakery)](https://uibakery.io/blog/supabase-pricing) ·
[Litestream: How it works](https://litestream.io/how-it-works/) ·
[Node.js: SQLite (estabilidade do node:sqlite)](https://nodejs.org/api/sqlite.html)
