# ZemdaPersonal — avaliação postural

## Uso

1. Abra uma avaliação física e a aba **Fotos & Parecer**. Adicione as quatro vistas pelo uploader existente: frontal/anterior, posterior, lateral direita e lateral esquerda.
2. Ative **Modo Avaliação Postural**. Selecione uma vista, use Caneta, Linha, Borracha (clique no traço), Desfazer e Guias. Os vetores usam coordenadas proporcionais à foto original; nenhuma cópia da imagem é criada.
3. Os botões “+” abrem as nove regiões. São atalhos fixos na foto, não detecção anatômica. Registre observações, e classifique melhorou/manteve/piorou somente quando houver referência inicial. A classificação é manual; contagem de observações não determina evolução clínica.
4. Clique em **Salvar Avaliação**. As marcações posturais são persistidas ao salvar; o autosave físico existente não inclui essas marcações. Fotos em upload e análise de IA bloqueiam o salvamento para evitar perda de resultado pendente.
5. No histórico, **Avaliação postural** reabre a avaliação usando o mesmo modal, em modo restrito a fotos, notas e postura. Não envia peso, gordura ou outras medidas para atualização. A edição de postura não recalcula medidas físicas antigas.
6. Em **Comparar Avaliações**, escolha **Avaliação Postural • referência inicial e evolução**. A primeira avaliação com dados posturais, por data, é a referência definida pelo servidor. A data e o identificador são critérios de desempate estáveis. A primeira avaliação física sem postura não se torna baseline. É possível consultar o relatório já na primeira avaliação postural.
7. Use o seletor da avaliação atual para qualquer data. O relatório lateral mostra regiões, contagens, observações revisadas, classificações e histórico completo. A sobreposição tem transparência ajustável; não faz alinhamento geométrico automático. Fotos com enquadramentos diferentes precisam de interpretação profissional.

Trocar uma foto não reaplica os traços da anterior. O editor avisa que os traços pertencem a outro arquivo e permite descartá-los explicitamente. Observações textuais permanecem para revisão. As regras de troca/remoção de fotos do uploader existente não foram alteradas.

## Persistência e compatibilidade

Uma migração aditiva cria `personal_assessments.posture_json`, inicialmente NULL. Nenhuma tabela de fotos, comparação ou histórico é duplicada. O campo JSON versionado contém vistas com ID permanente do anexo, guias, traços e observações por região/vista. Fotos continuam em `personal_assessment_photos` e usam `file_attachments`, R2 e SecureFileImage existentes.

POST/PUT de avaliação aceitam `posture`. Omitir o campo preserva os dados; NULL remove somente os dados posturais por API, sem remover fotos. A interface desativa apenas a visualização do modo e conserva o conteúdo já registrado. A listagem informa `has_posture` e não envia os vetores. GET individual inclui `posture_json`. A comparação existente aceita `?posture_baseline=1`; nesse modo o servidor resolve a referência e retorna resumos do histórico sem os traços das avaliações intermediárias.

Tenant, paciente e permissões do ZemdaPersonal são validados. IDs de foto usados na gravação postural devem pertencer à clínica e ao paciente. Comparações entre pacientes são rejeitadas. Registros antigos permanecem sem preenchimento artificial de postura.

Limites por avaliação: JSON até 250 KB, 180 observações, texto até 1.200 caracteres, 100 traços por vista e 300 pontos por traço. Editor e relatório são chunks carregados sob demanda. Não há nova dependência de gráficos: SVG para desenhos e barras CSS para histórico.

## IA opcional

A infraestrutura existente usa Google Gemini. A integração postural reutiliza esse SDK e o serviço R2, sem modificar os prompts ou serviços de IA de outros módulos.

Para habilitar, configure no backend:

- `GEMINI_API_KEY` ou `GOOGLE_API_KEY`;
- `PERSONAL_POSTURE_AI_MODEL`: identificador de um modelo visual disponível na conta. É explícito; não há tentativa em cascata de vários modelos;
- credenciais R2 já usadas pela aplicação (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` ou `R2_ENDPOINT`, `R2_BUCKET_NAME`). `R2_MOCK_STORAGE` não pode ser true.

GET `/v1/personal/posture-ai/status` informa disponibilidade de configuração. Não faz chamada ao modelo. POST `/v1/personal/posture-ai/analyze` executa somente após o clique em **Analisar postura com IA**, que informa o envio das fotos ao provedor configurado.

A API aceita de uma a quatro vistas distintas de anexos pertencentes ao paciente. Não aceita URL arbitrária fornecida pelo cliente. Obtém leitura privada pelo serviço R2, limita o download a 10 MB por imagem e a 24 milhões de pixels, reduz para no máximo 1024 px e envia apenas as fotos e os nomes das vistas; não envia nome, documento ou histórico do paciente no prompt. Metadados da imagem não são repassados após a conversão. Dados identificáveis que estejam visualmente na própria fotografia continuam fazendo parte da imagem enviada.

Uma análise por clínica a cada minuto, uma solicitação simultânea por clínica e até quatro por processo. Limites em memória, sem tarefas em segundo plano; instalações com múltiplas réplicas devem considerar que esse limite é por processo. Download tem timeout de 10 segundos por foto e geração de 30 segundos; não há reenvio automático.

Até 12 sugestões retornam como `source=ai`, `reviewed=false` e `evolution=unrated`. Campos/modelos inesperados são filtrados. O profissional pode editar, excluir ou confirmar cada sugestão; somente observações revisadas e não vazias participam dos totais. A IA aponta possíveis assimetrias visuais e limitações de enquadramento, sem diagnóstico, tratamento ou cálculo automático de melhora.

Esta entrega não fez análise de paciente nem envio a um provedor externo. Credenciais/modelo não estavam disponíveis. Disponibilidade real, permissões da conta, qualidade das sugestões e leitura R2 devem ser validadas no ambiente configurado. Erros mantêm as observações existentes e não geram resultados fictícios.

## Validação

- `cd backend && npm run test:posture`: 30 verificações com banco isolado, incluindo migração, persistência, baseline, isolamento, limites, preservação das medidas físicas e contrato de IA com mocks explícitos.
- Regressão existente: 55 verificações da biblioteca e 37 da expansão/alunos aprovadas. A configuração atual exige `ZEMDA_FILES_SIGNING_SECRET`; nos testes foi usado apenas um valor fictício local.
- `cd frontend && npm run build` e `cd backend && npm run build`.
- `frontend/tests/posture-browser.cjs`: Playwright com componentes reais, HTTP/IA simulados, desenho, desfazer, guias, observações, acionamento explícito da IA, revisão, salvar/reabrir, edição restrita sem medidas, baseline, sobreposição e viewport móvel. Executar com Vite local e Playwright instalado; aceita PLAYWRIGHT_MODULE, CHROME_PATH, TEST_BASE_URL e TEST_OUTPUT_DIR.

A fotografia usada nos testes de navegador é um asset público já existente para testar carregamento e vetores. Não representa uma avaliação clínica válida nem um resultado de IA real.

Não houve alteração de dados em produção, deploy ou mudanças funcionais nos demais módulos. Alterações em arquivos compartilhados se limitam à migração da tabela do Personal e ao registro das duas rotas do Personal.
