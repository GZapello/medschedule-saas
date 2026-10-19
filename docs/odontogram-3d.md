# Odontograma anatômico individualizado — relatório de correção

## 1. Análise do HTML fornecido

O HTML usa somente DOM, CSS e JavaScript inline. `createArch` cria duas fileiras flexíveis com 16 wrappers cada. Cada wrapper tem `data-tooth`, uma div de dente, um número e um listener de clique. A seleção é um Set e a classe `selected`. O posicionamento usa fluxo flex, gap e margem na linha média; não há coordenadas 3D.

Não existem assets externos, SVG, Canvas, WebGL, Three.js, meshes, modelos, raízes, cervical ou gengiva no HTML. Todos os dentes são o mesmo retângulo arredondado de 35 × 50. Portanto, ele não fornecia anatomia para extrair. Nenhum script externo foi executado ou incorporado.

## 2. Referência aproveitada e abordagem escolhida

Foram aproveitados a individualização, as duas arcadas, a ordem FDI, a associação entre número e elemento, e a separação entre estado visual de seleção e dados. O desenho genérico foi substituído por SVG local com gradientes: uma ilustração anatômica estilizada com volume aparente, não um modelo 3D real ou reprodução fotográfica. Não há iframe nem CSS global importado.

## 3. Individualização e novos arquivos

- `frontend/src/components/dentistry/Tooth3D.tsx`: um grupo interativo por FDI, com paths visíveis identificados por `data-part="crown"`, `root` e `cervical`.
- `frontend/src/components/dentistry/DentalArch3D.tsx`: duas arcadas, gengiva separada, materiais SVG, linha média e posicionamento proporcional à largura dos elementos.
- `frontend/src/components/dentistry/toothAnatomy.ts`: perfis locais dos oito tipos permanentes, com diferenças entre superior/inferior, coroas e raízes. Incisivos, caninos, pré-molares e molares têm proporções próprias. A morfologia é esquemática, não específica de um paciente; variações anatômicas individuais não são representadas.

Cada path desenha a própria estrutura e recebe eventos apenas na área pintada. Não há uma segunda geometria aproximada de hitbox. O grupo pai associa coroa, cervical e todas as raízes ao mesmo toothNumber. Enter/Espaço também selecionam o grupo. Números e marcadores não interceptam eventos.

## 4. Removidos e refatorados

- Removido `frontend/src/components/dentistry/odontogram3DGeometry.ts`, incluindo `PERMANENT_3D_HIT_AREAS`.
- Removido o PNG composto de `frontend/public/assets/dentistry/odontogram-3d-permanent.png`, agora sem uso. O arquivo original fornecido pelo usuário em Downloads não foi alterado.
- Refatorado `Odontogram3D.tsx`: removidos imagem, polígonos e debug de hitboxes; preservados painel, condições, multisseleção, zoom e callbacks clínicos. Adicionados lazy import, Suspense e error boundary com acesso ao Mapa de Faces 2D.
- Atualizados `frontend/tests/odontogram-3d.tsx` e `frontend/tests/odontogram-3d-browser.cjs`.
- Atualizado este relatório e as capturas em `tmp/odontogram-*.png`.

## 5. Gengiva, seleção e status

A gengiva é uma faixa preenchida e ondulada na região cervical, separada por arcada e renderizada atrás dos dentes, com pointer-events desativado. Não participa da seleção. Os dentes preservam proporção por escala uniforme do viewBox; espaços são calculados pela largura anatômica, com margem pequena e intervalo central.

Hover/seleção alteram somente o contorno dos paths do elemento. As condições continuam usando os indicadores oficiais; ausente reduz a opacidade da anatomia daquele dente a 0,15, com label separado. Não há máscara sobre foto. Implante mantém indicador textual e pode futuramente substituir a estrutura visual dentro de Tooth3D.

## 6. Dados preservados

`odontogramClinical.ts`, `odontogramModel.ts`, `OdontogramCanvas.tsx`, `DentistryWorkspace.tsx` e `ToothDossierDrawer.tsx` não foram alterados nesta correção. O 3D continua recebendo os mesmos dados e emitindo o mesmo onChange. `odontogramData`, `pendingToothChanges`, `handleSaveOdontogram()`, autosave, dossiê e endpoints continuam no fluxo existente.

Condições de face continuam exigindo escolha explícita no painel. Coroa/raiz selecionam somente o dente, sem inferir face clínica. Decídua/mista e comparativo permanecem no 2D. Nenhuma mudança de backend, dependência nova, tabela ou estado clínico paralelo.

## 7. Testes

Comando: `node frontend/tests/odontogram-3d-browser.cjs`.

- Clique físico no navegador sobre pontos pintados da coroa, cervical e cada raiz de todos os 32 dentes, na ordem FDI solicitada: passou; exatamente um elemento selecionado por clique em modo simples.
- Extremos 18/28/38/48, incisivos próximos e raízes de 16/26/36/46 incluídos.
- Bounding boxes anatômicas vizinhas estritamente separadas nas duas arcadas: passou.
- Hover no 43 e clique no espaço entre 43/42 sem mudar a seleção: passou.
- 46: Canal Tratado pela raiz no 3D, indicador no 2D, Restauração Oclusal no 2D refletida no 3D: passou.
- Ausente: opacidade de 0,15 apenas no elemento: passou.
- Sincronização 3D/2D no 26, salvamento/recarregamento, auditoria, dossiê, Hígido seletivo, multisseleção, inicial somente leitura, comparativo e dentições infantil/mista: passaram.
- Desktop 1440, tablet 768 e mobile 390, zoom sem overflow horizontal global: passaram.
- Error boundary com falha de renderização simulada e callback do fallback: passou.

O teste monta o workspace real, mas usa um servidor HTTP de persistência em memória. Não valida autenticação ou banco de produção. Nenhum paciente real foi modificado.

## 8. Verificação visual e build

`showDebugBoundaries=true` foi ativado apenas na fixture de inspeção. A captura `tmp/odontogram-debug.png` mostra os limites próprios de cada elemento; eles não atravessam vizinhos nem linha média. Produção mantém false por padrão. Capturas responsivas: `tmp/odontogram-1440.png`, `tmp/odontogram-768.png` e `tmp/odontogram-390.png`.

`npm run build --prefix frontend`: TypeScript e Vite aprovados. O aviso de chunk grande do bundle principal da aplicação permanece. A anatomia é carregada por import dinâmico somente quando o 3D é montado; nenhum asset remoto ou imagem composta é carregado.
