# Zemda — build e publicação Android

Package: `br.com.zemda.app`. Compile/target SDK: **36**. Min SDK: **24**. JDK: **21**.

## Fonte única de versão

`package.json.version` fornece o `versionName`, a versão da interface e os metadados Vite. `package.json.android.versionCode` fornece o código inteiro do Android. Capacitor identifica o app, mas não mantém uma versão independente.

Antes de cada envio ao Play Console, aumente `android.versionCode`; ajuste `version` conforme a versão semântica do lançamento. O código enviado deve superar todos os códigos já utilizados nesse app. Não reutilize o código para uma nova publicação.

## Comandos a partir de frontend/

```powershell
npm install
npm run android:sync
npm run android:debug
```

`android:sync` executa build web e sincronização Capacitor. `android:debug` sincroniza novamente e executa `assembleDebug`. O script encontra o JDK 21 em `../tools/jdk-21` quando `JAVA_HOME` não está definido; em outra máquina, configure JDK 21 e Android SDK 36.

O SDK pode ser indicado por `ANDROID_HOME` ou por `android/local.properties` (arquivo local ignorado pelo Git). Em propriedades Java no Windows, use `sdk.dir=C\:/caminho/android-sdk`.

Saídas padrão:

- APK de teste: `android/app/build/outputs/apk/debug/app-debug.apk`.
- APK release: `android/app/build/outputs/apk/release/app-release.apk`.
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`.

Caso o OneDrive ou um cache antigo cause erro de leitura de outputs, defina **`ZEMDA_ANDROID_BUILD_DIR` com um caminho absoluto novo**. Isso muda somente o diretório de saída do módulo app, preservando artefatos existentes. Os artefatos desta auditoria estão em `test-results/android-final/app/outputs/`; consulte `MOBILE_ANDROID_AUDIT.md`.

## Assinatura release

Defina estes valores no ambiente local/gerenciador de segredos, sem salvá-los no repositório:

- `ZEMDA_KEYSTORE_PATH`: caminho absoluto do keystore de upload, mantido fora do repositório.
- `ZEMDA_KEYSTORE_PASSWORD`.
- `ZEMDA_KEY_ALIAS`.
- `ZEMDA_KEY_PASSWORD`.

```powershell
npm run android:release
npm run android:bundle
```

Os scripts recusam release sem assinatura configurada. O comando direto `gradlew.bat bundleRelease`, quando usado sem essas variáveis, gera um **AAB técnico sem assinatura**: serve para verificar a compilação, mas não pode ser submetido ao Google Play. Não assine release com a chave debug. Mantenha a chave de upload e suas cópias seguras fora do Git; configure Play App Signing no Console.

## Variáveis frontend e Google

Use `.env.example` como referência. `VITE_*` entra no JavaScript público; não coloque senhas, tokens privados ou credenciais de backend nessas variáveis.

- `VITE_GOOGLE_CLIENT_ID`: client ID **web** já aceito pelo endpoint existente. O fluxo Android usa Credential Manager via SocialLogin e entrega o mesmo ID token aos callbacks existentes de login/cadastro/vinculação.
- No mesmo projeto Google Cloud, cadastre OAuth Android para **`br.com.zemda.app` + SHA-1** de cada certificado utilizado: debug, upload/release e chave de assinatura do Google Play. Não passe o client ID Android no lugar do client ID web. `gradlew.bat signingReport` exibe fingerprints públicos; não exponha o keystore.
- Se houver Firebase ou outro serviço associado ao package antigo, cadastre o novo aplicativo/configuração nesse serviço. Não foi criado projeto Firebase nem inventada credencial.
- `VITE_ZEMDA_ANDROID_TEST_DOWNLOAD_URL`: URL HTTPS do APK hospedado separadamente. Vazio exibe “Nenhuma versão Android de teste disponível.” A interface somente aparece para `superadmin`.

**A proteção de download é visual.** A variável Vite é pública e esconder o botão não protege o arquivo hospedado. Restrição real exige hospedagem privada e autorização/URL assinada fora deste escopo. Não grave um token duradouro em `VITE_*`.

Os metadados exibidos no card são os da compilação frontend atual. Ao publicar um novo APK, atualize a versão e publique o frontend/URL correspondentes juntos. O horário é do build frontend, identificado como tal; não é uma verificação remota do binário hospedado.

Mantenha a distribuição de testes separada do endpoint de atualização geral: não publique um APK debug/teste como atualização para usuários normais.

## Segurança e recursos nativos

- Release: HTTPS, mixed content desativado, certificados do sistema, depuração WebView desativada.
- Debug: HTTP somente para localhost, 127.0.0.1 e 10.0.2.2; certificados de usuário somente em debug. URLs HTTP personalizadas de produção precisam ser migradas para HTTPS externamente.
- Backup desativado, com exclusões explícitas de dados locais tanto no backup legado quanto na transferência entre dispositivos Android 12+.
- Câmera: scanner/selfie já existentes. Microfone: gravação Fono já existente. O Capacitor solicita permissões quando esses recursos chamam `getUserMedia`, sem solicitação genérica na abertura do app. Câmera e microfone são opcionais para instalação.
- As permissões normais transitivas de credenciais/biometria vêm do SDK de autenticação Google. Não há permissões de contatos, SMS, localização ou armazenamento amplo.
- PDFs/CSV/DOCX/TXT/ICS gerados usam cache privado e a interface Android de compartilhar/salvar, sem acesso amplo ao armazenamento. Arquivos de exportação são removidos após o prazo local quando o processo continua ativo; o cache fica excluído do backup.
- Documentos HTML de impressão usam `PrintManager` Android, sem JavaScript na WebView de impressão. Conferir “Salvar como PDF” e logos no aparelho real.
- Links externos, WhatsApp, checkout e download de atualização saem pela interface nativa apropriada. `mailto:` e `tel:` abrem apps instalados. O retorno do checkout permanece sujeito ao fluxo existente de atualização de assinatura.

## Validação e publicação

```powershell
npm run test:mobile
npm run test:mobile:interactions
node tests/mobile-graphics.cjs
```

Em uma instalação nova, instale também o navegador do Playwright: `npx playwright install chromium`. Os testes usam componentes reais e identidade/dados sintéticos, bloqueando chamadas externas e mutações. Não substituem testes ponta a ponta com contas reais nem testes de teclado/permissões em um Android conectado.

O teste gráfico confirma caneta/borracha, coordenadas normalizadas, 32 dentes e marcação após zoom nas nove larguras mobile/tablet. O teste de interações também valida o retorno das seções internas de Configurações e SuperAdmin para seus respectivos hubs.

Antes de submeter:

1. Configurar assinatura e regenerar AAB assinado.
2. Configurar Google Cloud para o package/certificados novos e validar login, cadastro e vinculação Google em Android real.
3. Validar login/cadastro/OTP/convites/trial/recuperação de senha com contas de teste, permissões negadas/concedidas, teclado, downloads, impressão, voltar, rotação e recursos clínicos completos no aparelho. Não havia dispositivo conectado nesta auditoria.
4. Hospedar o APK separado e configurar a URL do card SuperAdmin. Atualizar, se usado, o serviço externo de distribuição/atualização para servir o package novo; nenhum endpoint backend foi alterado.
5. Preencher metadados, imagens da loja, classificação indicativa, acesso para revisores, política de privacidade, Segurança dos dados e declaração de apps de saúde conforme os dados/SDKs efetivamente usados. [Declaração de saúde](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en).
6. **Revisar o checkout Asaas da assinatura SaaS antes da publicação.** Serviços de software em nuvem estão contemplados pela política de pagamentos; confirme a integração Play Billing ou uma exceção/programa aplicável. Abrir o checkout em navegador externo, por si só, não resolve essa exigência. Regras financeiras e backend foram preservados. [Política oficial de pagamentos](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en-en).
7. Confirmar o caminho dentro do app e a URL pública para solicitar exclusão de conta/dados; não foi identificado um fluxo dedicado de exclusão de conta no frontend auditado. Esta tarefa não criou endpoint nem alterou retenção clínica. [Exigência de exclusão de conta](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
8. Se a conta pessoal estiver sujeita à exigência de teste fechado, cumprir os requisitos indicados pelo Console; a documentação consultada exige 12 testadores por 14 dias contínuos para as contas abrangidas. [Requisitos oficiais de teste](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

Referências técnicas: [Capacitor 8 / API 36](https://capacitorjs.com/docs/updating/8-0), [backup e transferência Android 12](https://developer.android.com/about/versions/12/behavior-changes-12), [Google não suporta GSI web em WebViews](https://developers.google.com/identity/gsi/web/guides/supported-browsers), [configuração Google nativa](https://capgo.app/docs/plugins/social-login/google/android/).
