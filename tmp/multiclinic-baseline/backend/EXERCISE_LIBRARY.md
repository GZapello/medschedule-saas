# Biblioteca de exercícios ZemdaPersonal

Catálogo: 268 itens (119 IDs anteriores preservados e 149 novos), incluindo 48 alongamentos e 25 mobilidades. A expansão reutiliza as APIs, os campos photo_url/exercise_file_id e o fluxo de upload existente.

## Imagens entregues

- 2 fotografias documentais em WebP: supino reto com barra e prancha isométrica. Fonte, autor, declaração de domínio público e SHA-256 estão em src/config/exercise-library.photos.json. Os arquivos fazem parte de frontend/public/exercise-photos e funcionam sem hotlink ou URL temporária. Os nomes incluem hash; mantenha versões antigas utilizadas por treinos.
- 266 itens usam apenas ilustração de referência. Essas ilustrações são genéricas e não substituem uma demonstração fotográfica específica do movimento. A interface e a auditoria distinguem ilustração de fotografia.
- 268 ilustrações pequenas também estão incluídas em frontend/public/exercise-fallbacks para disponibilidade local. Não são enviadas automaticamente ao R2 nem contabilizadas como fotos reais.
- Nenhum upload real ao R2 foi feito durante esta implementação. O ambiente não tinha credenciais R2. Os testes de upload usam doubles locais explicitamente identificados.

## Atualização e preservação

Publique frontend e backend da mesma revisão. Não faça reset do banco. A inicialização executa migrações aditivas e seed idempotente; preenche campos ausentes, preserva personalizações, desativações, exercícios customizados e snapshots históricos. Somente referências globais de biblioteca cujo file_attachment não existe são desvinculadas. O arquivo antigo não é apagado. Objetos remotos não verificáveis não são presumidos ausentes.

Alterações de exercícios globais criam uma personalização por clínica. Exclusão de exercício customizado é desativação. Imagens anteriores são retidas para treinos/templates históricos. Novos treinos guardam imagem, instruções, categoria, créditos, duração e lado como snapshot. Treinos antigos são lidos sem associação dinâmica aos novos dados da biblioteca; registros antigos que nunca salvaram instruções/imagem não recebem retroativamente uma versão atual. Imagens históricas que já estavam indisponíveis permanecem auditáveis, sem inventar arquivo substituto.

Faça o backup operacional normal antes de aplicar migrações em produção. Esta entrega foi validada em bancos isolados; o banco de produção não foi acessado.

## Importação real para R2

No diretório backend, use Node compatível com node:sqlite e execute npm ci e npm run build. Inicialize a aplicação para executar as migrações existentes. Defina DATABASE_PATH para o banco correto.

O manifesto exercise-photo-manifest.json lista TODOS os 268 itens. Dois já têm local_path e origem preenchidos. Para os demais, faça uma cópia de trabalho do manifesto e acrescente fotografias locais autorizadas com source, author, license e image_kind=photograph. Licensed exige license_evidence. Não classifique ilustrações como photograph. Caminhos são relativos ao manifesto.

```sh
node import-exercise-photos.cjs --manifest=exercise-photo-manifest.json
node import-exercise-photos.cjs --manifest=exercise-photo-manifest.json --apply
node audit-and-sync-exercise-images.cjs --output=auditoria.json
```

A primeira linha só valida e não envia nada. --apply exige R2_ACCOUNT_ID ou R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME e R2_MOCK_STORAGE diferente de true. O importador valida o lote, otimiza WebP, envia pelo serviço R2 existente, confirma HEAD e somente então grava file_attachments, proveniência e exercise_file_id. Uma foto já importada com o mesmo hash e HEAD válido é preservada. Falhas não apagam o vínculo anterior. Upload concluído e transação recusada podem deixar um objeto órfão para manutenção futura; nenhum histórico é excluído automaticamente.

A exibição usa o Worker existente: ZEMDA_FILES_WORKER_URL e ZEMDA_FILES_SIGNING_SECRET devem corresponder à configuração implantada. O fluxo da interface continua ticket -> Worker PUT -> complete -> file_attachments -> exercise_file_id -> SecureFileImage. Para exercícios, mocks não comprovam existência. Valide upload, troca, recarga e leitura com uma clínica de teste no ambiente real após configurar as credenciais.

## Auditoria e testes

```sh
npm run test:exercises
npm run exercises:audit -- --output=auditoria.json
npm run build
```

No frontend: npm run build. O teste tests/exercise-library-browser.cjs usa Playwright e um servidor Vite local; PLAYWRIGHT_MODULE, CHROME_PATH, TEST_BASE_URL e TEST_OUTPUT_DIR são opcionais. Ele usa os componentes reais e doubles HTTP/Worker, sem acessar produção. Testa imagens, F5, upload/troca, duração/lado, persistência e impressão com/sem imagens, gerando PDFs e capturas.

A auditoria é somente leitura. WITH_REAL_IMAGE exige proveniência e objeto R2 confirmado ou fotografia empacotada com hash confirmado. Ausência de credencial/403/falha de rede é unverified; apenas 404 é missing. Código de saída 1 indica referência quebrada, 2 indica R2 não verificado. O resultado do catálogo limpo local foi: total 268, fotos reais locais 2, fallback-only 266, referências de arquivo quebradas 0 e sem imagem 0. Esses números não representam auditoria do banco/R2 de produção.

Para regenerar as ilustrações, npm run exercises:fallbacks. Esse comando recria o manifesto de distribuição; conserve o manifesto de trabalho de importação em outro arquivo.
