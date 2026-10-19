# Odontograma híbrido — implementação

## Imagem, transparência e individualização

A imagem original em `C:/Users/gabri/Downloads/odontograma 3d zemda.png` foi usada como referência de edição pelo image_gen integrado (skill imagegen). O resultado é uma adaptação gerada, não um recorte pixel a pixel fiel à imagem original e não um modelo anatômico específico de paciente.

Prompt usado: editar a referência em um atlas transparente de 8 colunas por 4 linhas, com exatamente 32 dentes individuais, sem fundo, números ou linhas; preservar esmalte claro, raízes e pequeno colar gengival; superiores com raízes para cima, inferiores com raízes para baixo; ordem das linhas 18–11, 21–28, 48–41 e 31–38; separar completamente cada elemento com margem transparente e diferenciar incisivos, caninos, pré-molares e molares.

O arquivo gerado tem canal RGBA. O fundo foi removido pelo gerador, e a transparência foi verificada nos arquivos. O script `scripts/extract-dental-atlas.cjs` exporta as 32 células, localiza o maior componente alfa em cada célula e recorta seus limites para excluir fragmentos dos vizinhos. Os arquivos finais são locais:

`frontend/public/assets/dentistry/hybrid/tooth-11.png` até os 32 números FDI permanentes, mais `manifest.json`.

O atlas intermediário foi salvo em `C:/Users/gabri/.codex/generated_images/01a15405-6490-7a90-bfd0-21f5222c1f71/exec-09ae497d-1de2-495c-a2bb-02289a2747cb.png`. A aplicação depende somente dos PNGs individuais copiados ao projeto. Nenhum serviço externo ou geração é usado durante o atendimento.

## Anatomia e faces no mesmo dente

`HybridDentalArch` organiza duas arcadas com 16 colunas e linha média. Cada bloco contém número FDI, visual anatômico, mapa de faces e indicadores clínicos. O mapa fica imediatamente abaixo da anatomia com o mesmo centro horizontal.

`ToothAnatomyView` desenha o PNG transparente num canvas próprio de cada dente, preservando proporção. Cliques são aceitos somente onde o alfa é maior que 80; áreas transparentes não selecionam dentes. O destaque segue o alfa do próprio desenho via drop-shadow. O colar gengival é parte do asset individual. Ausente reduz a opacidade do elemento.

`ToothFaceMiniMap` reutiliza a geometria e orientação clínica do mapa anterior: vestibular/palatina/lingual, mesial em direção à linha média, distal e oclusal/incisal. Foi incorporado também ao modo Faces 2D para compartilhar o componente visual, mantendo seus marcadores de condições inteiras. No híbrido as cinco faces permanecem acessíveis mesmo com uma condição inteira.

## Sincronização e persistência

Anatomia e faces recebem o mesmo ToothStatus e compartilham seleção/hover do HybridOdontogram. Clique anatômico seleciona o dente e pode aplicar uma condição inteira. Clique de face seleciona o mesmo elemento e chama updateToothCondition com a face explícita. Em multisseleção, os cliques apenas selecionam; aplicação em lote continua pelo painel.

Não há estrutura clínica paralela. OdontogramData, DENTAL_CONDITIONS, helpers, onChange, odontogramData, pendingToothChanges e handleSaveOdontogram permanecem no fluxo existente. Backend, endpoints, autosave e dossiê não foram alterados. O modo principal é Híbrido; Faces 2D permanece como modo focado e suporte a dentição decídua/mista e comparativo.

## Arquivos

Criados:
- `HybridOdontogram.tsx`: painel, seleção, condição e zoom unificados.
- `HybridDentalArch.tsx`: arcadas e pares verticais por dente.
- `ToothAnatomyView.tsx`: asset individual com seleção por alfa.
- `ToothFaceMiniMap.tsx`: mapa clínico reutilizável.
- `permanentTeeth.ts`: ordem FDI.
- `frontend/tests/odontogram-hybrid.tsx` e `odontogram-hybrid-browser.cjs`.
- `scripts/extract-dental-atlas.cjs` e os 32 assets/manifesto.

Refatorado: `OdontogramCanvas.tsx`.

Substituídos/removidos por ficarem sem uso: `Odontogram3D.tsx`, `DentalArch3D.tsx`, `Tooth3D.tsx`, `toothAnatomy.ts` e os dois testes antigos odontogram-3d. Helpers clínicos/modelo e DentistryWorkspace/ToothDossierDrawer preservados.

## Responsividade e falhas

Desktop mostra as duas arcadas completas. Tablet/mobile mantêm largura clínica mínima e navegação horizontal apenas dentro do odontograma, com zoom de 100–300%. Sem scroll horizontal global. Asset individual com falha mostra aviso no lugar da anatomia e mantém as faces utilizáveis. Falhas do componente anatômico continuam protegidas por error boundary.

## Validação

`node frontend/tests/odontogram-hybrid-browser.cjs`: 32 pares anatomia/faces, seleção por clique físico em pixel opaco, rejeição de canto transparente, alinhamento vertical, hover sincronizado, marcação vestibular de todos os dentes, condição inteira e oclusal no 46, modo Faces 2D, salvar/recarregar, auditoria, dossiê, limpeza seletiva, multisseleção, inicial somente leitura, comparativo, decídua/mista, resoluções 1440/768/390, zoom sem overflow global e falha de asset com edição por faces.

O teste monta o workspace e handler real de salvamento com persistência HTTP simulada em memória. Não testa o banco/autenticação de produção nem altera pacientes reais.

Capturas: `tmp/odontogram-hybrid-1440.png`, `tmp/odontogram-hybrid-768.png`, `tmp/odontogram-hybrid-390.png`.

Build: `npm run build --prefix frontend` (tsc + Vite). Consulte `tmp/odontogram-hybrid-build.log` para a execução final. Aviso de chunk grande do bundle principal não é erro TypeScript.
