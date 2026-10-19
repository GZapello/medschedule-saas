# Odontograma 3D — implementação e validação

## 1. Arquivos criados

- `frontend/src/components/dentistry/Odontogram3D.tsx`: imagem, interação SVG, painel contextual, seleção de faces, zoom, acessibilidade e fallback.
- `frontend/src/components/dentistry/odontogram3DGeometry.ts`: mapa dos 32 elementos permanentes.
- `frontend/src/components/dentistry/odontogramModel.ts`: tipos e lista oficial de condições extraídos, sem alteração do formato persistido.
- `frontend/src/components/dentistry/odontogramClinical.ts`: mutações clínicas e descrições compartilhadas.
- `frontend/tests/odontogram-3d.tsx`: montagem do workspace real para testes.
- `frontend/tests/odontogram-3d-browser.cjs`: teste de navegador com servidor HTTP de persistência isolado.
- Este relatório.

## 2. Arquivos alterados

- `OdontogramCanvas.tsx`: seletor 3D/Faces 2D, integração da nova apresentação e uso dos helpers. SVGs de faces preservados. Tipos e condições continuam reexportados para manter os imports existentes compatíveis. Status textual passou a usar nomes clínicos.
- `DentistryWorkspace.tsx`: nome da aba atualizado para Odontograma e chave por paciente para reiniciar a seleção visual ao trocar de paciente. Salvamento e autosave mantidos.
- `ToothDossierDrawer.tsx`: condições exibidas com nomes clínicos em vez de identificadores internos.

## 3. Asset

`frontend/public/assets/dentistry/odontogram-3d-permanent.png`

Cópia da imagem fornecida (1.678.415 bytes), sem base64, edição de pixels ou dependências gráficas adicionais. O fundo escuro pertence à imagem original; controles, painel e card usam o tema claro do Zemda. Não foi gerada uma variante com fundo claro.

## 4. Mapeamento dos dentes

32 polígonos individuais no `viewBox="0 0 1448 1086"`, alinhados à imagem e redimensionados junto com ela. Cada polígono delimita o envelope da coroa e raízes visíveis, sem vetorizar a anatomia. Numeração já presente no asset: 18–11 / 21–28 e 48–41 / 31–38. Marcadores SVG indicam a linha média. `showDebugHitAreas` fica desativado por padrão.

## 5. Dados e salvamento compartilhados

`DentistryWorkspace.odontogramData` continua sendo a fonte clínica. O 3D recebe o mesmo `data/currentData` usado pelo 2D e devolve atualizações pelo mesmo `onChange`. Esse callback atualiza `odontogramData` e acumula `pendingToothChanges`. `handleSaveOdontogram()` continua enviando `statusData` e `toothChanges` para `/v1/dentistry/odontograms`. O autosave existente continua recebendo esses dados. Nenhum estado clínico 3D paralelo, tabela, migration ou endpoint foi criado.

## 6. Condições de face

No 3D, clicar em um dente com uma condição de face apenas seleciona o elemento. O profissional escolhe Vestibular, Palatina/Lingual, Mesial, Distal ou Oclusal/Incisal no painel. Na seleção múltipla, a face interna é resolvida por arcada para cada elemento. Não há escolha implícita de oclusal. O campo persistido para incisal continua sendo `oclusal`, conforme o formato existente.

O helper compartilhado mantém o gesto de todas as faces do 2D e a alternância das condições. Hígido limpa apenas o alvo escolhido, sem apagar as demais faces. O botão de limpeza do dente inteiro remove apenas `whole`.

## 7. Condições de dente inteiro

Condições com `affectsWholeTooth` usam `whole` e a regra de alternância já existente ao clicar. A aplicação explícita pelo painel e em lote define a condição. Indicadores usam as cores oficiais; ausente recebe máscara escura e identificação, implante recebe identificação própria. O contorno ciano representa seleção, separado da condição clínica.

## 8. Dossiê e histórico

Os botões Abrir dossiê e Histórico chamam o `onOpenToothDossier` existente. O mesmo drawer consulta `/v1/dentistry/teeth/:patientId/:toothNumber/dossier`. Não foi criado outro histórico. Alterações continuam emitindo `toothNumber`, `face`, `condition` e `previousCondition`.

## 9. Dentição e comparação

Permanente abre em 3D por padrão. Decídua e mista exibem automaticamente Faces 2D, com aviso de disponibilidade do 3D. O comparativo continua no 2D. Odontograma Inicial no 3D é somente leitura. Os controles e desenhos anteriores permanecem disponíveis.

## 10. Verificação

- `npm run build`: TypeScript e Vite concluíram com sucesso. Vite informa o aviso de chunk acima de 500 kB no bundle principal da aplicação.
- `node tests/odontogram-3d-browser.cjs` (na pasta frontend): passou.
- Cobertura: 32 dentes, ausência de seleção inicial, seleção por teclado, condição inteira, Cárie Oclusal no 26 em 3D e preenchimento vermelho no 2D, Restauração Vestibular pelo 2D refletida no 3D, salvamento pelo workspace e recarga, dossiê correto, limpeza seletiva, multisseleção superior/inferior, decídua/mista, inicial somente leitura, comparativo, zoom, fallback e auditoria.
- Desktop 1440, tablet 768 e mobile 390: sem overflow horizontal global no teste. Capturas inspecionadas em `tmp/odontogram-1440.png`, `tmp/odontogram-768.png` e `tmp/odontogram-390.png`.
- Busca por `OdontogramCanvas`, `OdontogramData`, `ToothStatus` e `pendingToothChanges` confirma o fluxo compartilhado.

O teste usa componentes reais e o handler real de salvamento, com respostas HTTP e persistência em memória no servidor de teste. Não é uma validação contra o banco de produção nem contra a autenticação do backend real. Os endpoints existentes foram revisados e não foram alterados. Nenhum dado real de paciente foi modificado.
