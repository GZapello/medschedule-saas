# Backup do banco de dados

O Zemda usa um único arquivo SQLite (no Railway: `/data/saas_schedule.db`, num volume persistente). O volume **não é backup**. Se ele for perdido ou corrompido, se uma migração der errado ou se alguém apagar dados por engano, não há como voltar atrás.

Este documento descreve o backup automático que roda dentro do próprio servidor.

## Como funciona

A cada `BACKUP_INTERVAL_HOURS` (padrão: 24h), o servidor:

1. **Gera um snapshot consistente** com `VACUUM INTO`. Isso funciona com o sistema no ar e inclui o que ainda está no WAL.
2. **Verifica a integridade** do snapshot (`PRAGMA quick_check`). Se falhar, o backup é descartado e o erro é registrado.
3. **Compacta** (gzip).
4. **Criptografa** com AES-256-GCM, se `BACKUP_ENCRYPTION_KEY` estiver definida. São dados de saúde (dado sensível na LGPD), então nada sai do servidor sem criptografia.
5. **Envia ao Cloudflare R2**, fora do Railway, em `backups/db/zemda-db-<data>.sqlite.gz.enc`. O envio só acontece se o R2 estiver configurado **e** houver chave de criptografia.
6. **Aplica a retenção**:
   - no volume, mantém os `BACKUP_LOCAL_RETENTION` arquivos mais recentes (padrão: 7);
   - no R2, apaga backups com mais de `BACKUP_REMOTE_RETENTION_DAYS` dias (padrão: 30).

Se o servidor reiniciar, o agendador olha a data do último backup local e não duplica. Falhas são registradas no log e disparam o alerta de erro (ver `docs/MONITORAMENTO.md`).

O arquivo `.enc` tem este formato: `ZBK1` (4 bytes) + IV (12) + tag de autenticação (16) + gzip cifrado. Um arquivo adulterado ou uma chave errada são **rejeitados** na restauração, e nenhum dado não autenticado é processado.

## Configuração no Railway (produção)

| Variável | Obrigatória? | Descrição |
|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | **Sim**, para ter cópia fora do Railway | Texto aleatório longo. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `R2_ACCOUNT_ID` (ou `R2_ENDPOINT`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Sim, para a cópia externa | As mesmas credenciais que o sistema já usa para arquivos |
| `BACKUP_R2_BUCKET` | Recomendado | Um bucket **separado e privado** só para backups. Se não definido, usa o `R2_BUCKET_NAME` com o prefixo `backups/db/` |
| `BACKUP_INTERVAL_HOURS` | Não | Padrão 24 |
| `BACKUP_LOCAL_RETENTION` | Não | Padrão 7 arquivos |
| `BACKUP_REMOTE_RETENTION_DAYS` | Não | Padrão 30 dias |
| `BACKUP_ENABLED` | Não | Padrão: ligado em produção e desligado em desenvolvimento. Use `false` para desligar ou `true` para ligar fora de produção |
| `BACKUP_DIR` | Não | Padrão: `backups/` ao lado do banco (`/data/backups`) |

> ⚠️ **Guarde a `BACKUP_ENCRYPTION_KEY` fora do Railway**, num gerenciador de senhas acessível a mais de uma pessoa. Se o Railway for perdido junto com a chave, os backups no R2 viram lixo indecifrável. Se trocar a chave, backups antigos só podem ser abertos com a chave antiga.

Para confirmar que está funcionando, veja nos logs do Railway, cerca de 1 minuto após o deploy:
```
[Backup] Agendador ativo: a cada 24h, retenção local de 7 arquivos e remota de 30 dias.
[Backup] Concluído: zemda-db-2026-...sqlite.gz.enc (x.x MB, NNN ms) → R2 backups/db/...
```
Se aparecer `(somente local)`, falta a chave ou o R2.

## Comandos manuais

Rode dentro da pasta `backend/`. No Railway, rode no shell do serviço (`railway ssh`, ou pelo painel), porque o comando precisa acessar o volume `/data`:

```bash
npm run backup -- create                        # gera um backup agora
npm run backup -- list                          # lista backups locais e no R2
npm run backup -- restore latest /data/restaurado.sqlite       # mais recente (R2, senão local)
npm run backup -- restore r2:backups/db/<arquivo> /data/restaurado.sqlite
npm run backup -- restore /data/backups/<arquivo> /data/restaurado.sqlite
```

O `restore` **nunca mexe no banco em uso**. Ele gera um banco novo, verificado, no destino indicado. Localmente, sem compilar antes, rode `npm run build` primeiro.

## Procedimento de restauração (produção)

1. **Avise os clientes** se houver indisponibilidade. Decida qual backup usar: todo dado gravado depois dele será perdido.
2. No shell do serviço, gere o banco restaurado:
   `npm run backup -- restore latest /data/restaurado.sqlite`
3. Pare o tráfego. No Railway, o jeito mais simples é definir `BACKUP_ENABLED=false` e reduzir a zero ou pausar o serviço. Confira como a sua versão do Railway lida com isso.
4. Guarde o banco atual e troque os arquivos:
   ```bash
   mv /data/saas_schedule.db /data/saas_schedule.db.antes-da-restauracao
   rm -f /data/saas_schedule.db-wal /data/saas_schedule.db-shm
   mv /data/restaurado.sqlite /data/saas_schedule.db
   ```
5. Suba o serviço de novo e teste um login e a abertura de um prontuário.
6. Depois de alguns dias estável, apague o `.antes-da-restauracao`.

## Teste de restauração (faça periodicamente)

Um backup que nunca foi restaurado não é garantia de nada. **Uma vez por mês**, baixe e restaure o backup mais recente numa máquina local, com as credenciais do R2 e a `BACKUP_ENCRYPTION_KEY` no `backend/.env`:

```bash
cd backend && npm run build
npm run backup -- restore latest ./teste-restauracao.sqlite
```

A mensagem `quick_check = ok` confirma que o arquivo abre e está íntegro. Apague o arquivo depois: ele contém dados reais de pacientes.

O teste automatizado `backend/test-backup.cjs` roda no CI a cada push. Ele cobre criptografia, envio ao R2 (simulado), retenção, rejeição de arquivo adulterado ou chave errada e restauração.

## Limitações conhecidas

- **Perda máxima (RPO):** até `BACKUP_INTERVAL_HOURS` de dados. Para perder minutos em vez de horas, o próximo passo é replicação contínua do SQLite com [Litestream](https://litestream.io) para o R2 (ver `docs/ANALISE-POSTGRES.md`).
- Os **arquivos do R2** (fotos, anexos) não entram neste backup. Eles ficam no R2, que tem durabilidade alta, mas não protege contra exclusão acidental. Considere ativar versionamento ou replicação do bucket.
- O `VACUUM INTO` bloqueia o processo enquanto copia. Com o tamanho atual do banco, isso leva milissegundos. Se o banco passar de alguns GB, reavalie o método.
