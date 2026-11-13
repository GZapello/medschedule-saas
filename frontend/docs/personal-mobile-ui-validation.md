# ZemdaPersonal — validação da apresentação mobile

Data: 12/11/2026. Alterações locais, sem commit, push ou deploy.

## Escopo e diagnóstico

A reprodução local usa componentes React reais, dados fictícios e API simulada. Não acessa nem grava pacientes, prescrições ou avaliações de produção.

- Avaliação: cabeçalho extenso e autosave comprimido letra por letra em 320 px; aluno, data e indicadores fixos deixavam pouca altura para preencher o formulário; texto de Cancelar quebrava.
- Construtores: nome, imagem e ações disputavam a mesma linha; nomes longos eram cortados; parâmetros em seis colunas a partir de 640 px ficavam apertados; altura em vh e margens reduziam a área útil.
- Biblioteca: filtros e categorias consumiam espaço fora da área rolável; ações do cabeçalho e formulários aninhados precisavam de distribuição própria.
- Perfil: conteúdo ultrapassava 320 px (377 px na reprodução inicial); histórico e ações precisavam de redistribuição.
- Modelos: títulos/descrições truncados e ações concorrendo por espaço; resumo de aplicação comprimia a identificação da estrutura.
- Prévia de PDF: duas camadas de padding e controles comprimiam o documento no celular.

## Implementação

CSS limitado a elementos marcados com `data-personal-mobile` e media query até 1023 px. Sem ocultação global de overflow horizontal. Cores, conteúdo, operações e handlers existentes preservados.

- Avaliação em altura disponível, com cabeçalho e rodapé acessíveis e uma área rolável contendo identificação, indicadores, seções e campos. Título mobile compacto, autosave legível, indicadores em grade e campos em uma coluna nas telas mais estreitas. Seletor de seções existente preservado.
- Modais adaptados à safe area e, nos editores principais, à altura/posição de `visualViewport`. Isso acompanha a redução da área visível; o teste automatizado não substitui teclado real.
- Nomes editáveis de exercícios usam textarea no mobile e o input original no desktop, mantendo o mesmo valor e callback. Ações ficam abaixo e parâmetros em grade de duas colunas.
- Busca/filtros, cards, ações e histórico reorganizados; nomes e descrições deixam de ser truncados no mobile.
- Biblioteca e comparação usam uma área rolável para filtros/seletores e conteúdo. Detalhes, edição e player permanecem disponíveis.
- Prévia de PDF reduz margens apenas na tela mobile. Regras A4 e de impressão não foram alteradas.

## Arquivos de frontend

Produção:

- `src/components/personal/PersonalAssessmentModal.tsx`
- `src/components/personal/PersonalAssessmentComparisonModal.tsx`
- `src/components/personal/PersonalTemplateBuilder.tsx`
- `src/components/personal/PersonalWorkoutBuilder.tsx`
- `src/components/personal/PersonalExerciseLibraryModal.tsx`
- `src/components/personal/PersonalExerciseNameField.tsx` (novo componente visual)
- `src/components/personal/PersonalVideoPlayerModal.tsx`
- `src/components/personal/PersonalStudentProfile.tsx`
- `src/components/personal/PersonalPdfExportModal.tsx`
- `src/components/personal/ZemdaPersonalView.tsx`
- `src/hooks/usePersonalMobileViewport.ts` (novo hook de layout)
- `src/styles/mobile.css`

Testes:

- `tests/personal-mobile-layout.tsx` (fixture nova)
- `tests/personal-mobile-layout.cjs` (renderização, interação e capturas)
- `tests/personal-visceral.tsx` (inclui AuthProvider na fixture existente, sem alterar assertions)

`PersonalAssessmentReport.tsx` foi inspecionado e preservado. `useMobileLayout.ts` foi inspecionado e reutilizado sem alterações.

## Validação executada

- `node frontend/tests/personal-mobile-layout.cjs before`: captura o código original de HEAD em memória, sem checkout ou alteração dos arquivos atuais.
- `node frontend/tests/personal-mobile-layout.cjs after`: oito cenários em 320, 360, 375, 390, 412, 430, 768, 1366 e 1920 px (72 combinações), sem erros de JavaScript ou rolagem horizontal da página.
- Nas sete larguras mobile: preencher peso/altura, alternar todas as seções disponíveis, preencher observação longa, salvar na API simulada e reabrir com os valores; reduzir altura para 430 px e conferir fechar/salvar visíveis; adicionar divisão/exercício, editar nome/séries, salvar modelo; editar/reordenar/salvar prescrição; abrir detalhes/edição da biblioteca; consultar histórico; pesquisar/visualizar/aplicar modelo a aluno; abrir relatório de avaliação.
- Fotos e player: imagem de teste servida localmente e iframe de player simulado. Valida renderização, dimensões e fechamento; não comprova reprodução de vídeo remoto, uploads ou URLs assinadas de produção.
- Reedição de modelo salvo: rodada adicional nas sete larguras mobile, reabrindo o modelo simulado, alterando o título e verificando a requisição de atualização; resultados em `focused.json`.
- Comparação pixel a pixel das capturas iniciais dos oito cenários em 1366/1920 px: 16 comparações sem diferenças. A garantia visual se refere aos estados capturados, não a todos os estados possíveis.
- `npx tsc --noEmit`: aprovado.
- `npm run build` no frontend: aprovado (TypeScript e Vite). Emitiu avisos de bundles grandes, importação estática/dinâmica e duas referências públicas para resolução em runtime; não bloqueiam o build.
- `node tests/personal-visceral-browser.cjs`: aprovado após corrigir o contexto da fixture; VAI, TAV, protocolos/equipamentos e digitação sem blur.
- `node tests/personal-modal-browser.cjs`: 5 verificações aprovadas, histórico selecionado antes de imprimir e ausência de erros.
- `node tests/shared-clinical-assessments-browser.cjs`: 12 verificações aprovadas, sem erros.
- `npm run test:exercise-protection` no backend: 10 verificações aprovadas, usando banco temporário isolado da própria suíte. Catálogo oficial de 187 exercícios e mídia íntegros.
- `git diff --check`: aprovado.
- Lint: o frontend não disponibiliza script/configuração de lint; nenhum resultado de lint é alegado.

## Evidências

Capturas e resultados em `../../tmp/personal-mobile-layout/`:

- `before-assessment-320.png` / `after-assessment-320.png`
- `after-assessment-short-320.png`
- `after-template-parameters-320.png`
- `after-workout-parameters-320.png`
- `after-library-detail-320.png`, `after-library-edit-320.png`, `after-library-video-320.png`
- `after-history-320.png`
- `after-template-preview-320.png`, `after-template-apply-320.png`
- `after-report-assessment-320.png`
- `before.json`, `after.json`, `desktop-comparison.json`, `build.log`

## Limites e preservação

Backend, APIs, payloads, cálculos, protocolos, autenticação, permissões, uploads e autosave de produção não foram modificados. O diff do backend e das três pastas protegidas de mídia está vazio. Nenhum dado real foi alterado.

Não foram executados salvamento real com conta de teste, reprodução remota de vídeo, upload real, teclado nativo de iOS/Android nem testes em aparelhos físicos. Os fluxos automatizados verificam a interface e os valores enviados à API simulada. Esses pontos permanecem para homologação no dispositivo e ambiente de teste, sem necessidade de modificar produção para esta entrega.
