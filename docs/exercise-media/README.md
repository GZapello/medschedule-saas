# Mídias revisadas do catálogo

Estado atual: **128 exercícios com GIF**, entre 268 existentes. A complementação com ExerciseGymGifsDB preservou os 60 anteriores e aprovou 68 novos; dos 208 candidatos, 124 foram rejeitados e 16 permanecem pendentes.

- [Complementação: decisões individuais, lista completa sem GIF, arquivos e testes](exercisegymgifs-validation.md)
- [Complementação: relatório estruturado e evidências por arquivo](exercisegymgifs-validation.json)

## Histórico da primeira revisão — exercises-dataset

Resultado dessa etapa: **60 aprovados, 192 rejeitados, 16 pendentes** nos 268 exercícios existentes. O comportamento e os números abaixo descrevem essa primeira entrega; o relatório de complementação acima documenta as mudanças posteriores, inclusive hover/touch no catálogo.

- [Relatório por exercício](validation-report.md)
- [Relatório estruturado, candidatos e existência dos arquivos](validation-report.json)
- [Manifesto aplicado](../../backend/src/config/exercise-library.media.json)
- [Catálogo](evidence/media-catalogue.png), [detalhes](evidence/media-details.png), [falhas de carregamento](evidence/media-failures.png)

As pranchas `evidence/sheet-0.jpg` a `sheet-6.jpg`, `alternates.jpg` e `detail-review.jpg` contêm a imagem estática e três quadros de cada GIF avaliado visualmente. São evidência de revisão, não uma lista de aprovações. A decisão final está no relatório e no manifesto; por exemplo, 0315 substitui 0318 na rosca inclinada e 2571 fica pendente por mostrar balanço em vez de sustentação estática. A revisão considera as instruções e o tipo de execução reais do seed; o JSON fornecido contém alguns nomes truncados.

## Comportamento implementado

59 imagens novas substituem somente placeholders gerados; a foto existente do supino reto com barra é preservada. 60 GIFs são oferecidos nos detalhes por ação explícita, sem carregar animações no catálogo. Fotos e anexos existentes continuam tendo prioridade. Nenhum exercício é criado a partir dos 1.324 registros do dataset. O manifesto associa somente IDs globais revisados; cópias personalizadas não herdam automaticamente GIFs que podem deixar de representar sua execução.

Os arquivos são incluídos em `frontend/public/exercise-media` e no build do frontend. Não dependem de GitHub ou da resolução de caminhos relativos em produção. Cada par tem caminho original, commit de origem e SHA-256. A imagem do dataset para o supino reto fica armazenada como evidência do par, mas não substitui a foto atual.

A atualização ocorre ao semear o catálogo na inicialização do backend. Ela é idempotente e preserva valores de fotos que não sejam o placeholder conhecido. A animação é resolvida pelo manifesto ao listar o catálogo. A auditoria distingue demonstrações revisadas de fotografias reais e de placeholders.

## Validação executada

- `npm run test:exercises` no backend: passou, incluindo a nova suíte de integridade das 60 associações, os 55 checks da biblioteca e os 37 checks de expansão/alunos. Para os testes de upload foi definida uma chave fictícia local em `ZEMDA_FILES_SIGNING_SECRET`; não houve uso de armazenamento de produção.
- `npm run build` no frontend: passou. Vite mantém um aviso preexistente de importação estática/dinâmica do modal de avaliação.
- `node frontend/tests/exercise-media-browser.cjs`: passou em Chromium, com API simulada usando os mesmos helpers do backend. Os 120 arquivos decodificaram via HTTP. Catálogo, detalhes, GIF sob demanda, falhas simultâneas de imagem/GIF, nova tentativa e ausência de GIF em item rejeitado foram verificados.
- `node frontend/tests/exercise-library-browser.cjs`: passou; filtros, busca, recarga, upload simulado, montagem de treino e PDF continuam funcionando.
- `git diff --check`: passou.

Para repetir os testes de navegador, inicie o Vite no frontend e disponibilize Playwright (ou configure `PLAYWRIGHT_MODULE`) e Chromium (`CHROME_PATH`, se necessário). `TEST_BASE_URL` e `TEST_OUTPUT_DIR` são opcionais. As capturas deste diretório foram inspecionadas visualmente.

Testes feitos localmente, com bancos isolados e serviços externos simulados. Não houve implantação nem merge.
