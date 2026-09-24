# Instaladores (Windows e Android)

Os instaladores **não ficam mais no repositório git**. Eles eram ~91% do tamanho do repositório (102 MB de 113 MB) e cada nova versão aumentava o histórico para sempre.

Agora eles são publicados como anexos de uma **Release do GitHub**, e o backend apenas redireciona:

| Endpoint (usado pelo site e pelos apps) | Redireciona para (padrão) | Variável para trocar o destino |
|---|---|---|
| `GET /api/v1/public/download-windows` | `https://github.com/GZapello/medschedule-saas/releases/latest/download/Zemda-Setup.exe` | `DOWNLOAD_WINDOWS_URL` |
| `GET /api/v1/public/download-android` | `https://github.com/GZapello/medschedule-saas/releases/latest/download/Zemda.apk` | `DOWNLOAD_ANDROID_URL` |

Links antigos no formato `/downloads/<arquivo>.apk` ou `.exe` continuam funcionando: redirecionam para os endpoints acima.

`releases/latest/download/<nome>` sempre aponta para a release mais recente. Por isso, **os nomes dos anexos precisam ser sempre `Zemda-Setup.exe` e `Zemda.apk`**, sem número de versão no nome.

---

## ⚠️ Antes de fazer merge desta mudança na `main`

A `main` faz deploy automático no Railway. Se o merge acontecer antes de existir uma release, os botões de download vão dar 404.

Os arquivos atuais (versão 1.1.2) foram guardados fora do repositório, em `Documents/Zemda/release-assets/`:

- `Zemda-Setup.exe`: sha256 `ad6b48f965520928e515c8b829773e74453af0861b31061633ce720105294cda`
- `Zemda.apk`: sha256 `cff610c7dcd36d23f46427a7210178c5a7dd3d122d5ebe5e831ff1f9e4bcdad1`

Para criar a release, rode a partir da pasta `Documents/Zemda`, com o `gh` autenticado em uma conta com permissão de escrita no repositório:

```bash
gh release create v1.1.2 --repo GZapello/medschedule-saas --title "Zemda 1.1.2" --notes "Instaladores Windows e Android da versão 1.1.2." release-assets/Zemda-Setup.exe release-assets/Zemda.apk
```

Depois confira se os dois links abaixo baixam os arquivos:

- https://github.com/GZapello/medschedule-saas/releases/latest/download/Zemda-Setup.exe
- https://github.com/GZapello/medschedule-saas/releases/latest/download/Zemda.apk

Só então faça o merge ou push na `main`.

## Publicar uma nova versão

1. Gere o instalador Windows: `cd desktop && npm run dist:win`. O arquivo sai em `desktop/dist/Zemda Setup <versão>.exe`.
2. Gere o APK pelo projeto Android (`frontend/android`, via Capacitor/Gradle).
3. Renomeie os arquivos para `Zemda-Setup.exe` e `Zemda.apk`.
4. Crie a release:
   ```bash
   gh release create v<versão> --repo GZapello/medschedule-saas --title "Zemda <versão>" --notes "<o que mudou>" Zemda-Setup.exe Zemda.apk
   ```
5. Atualize `latestVersion` e `releaseNotes` na rota `/v1/public/app-version` (`backend/src/routes/index.ts`).

O `.gitignore` agora bloqueia `*.exe`, `*.apk` e `*.aab`. Assim ninguém versiona instaladores por engano.

---

## Limpeza do histórico (opcional, fazer junto com o colaborador)

Remover os arquivos do projeto **não** diminui o repositório: eles continuam no histórico. Nas contas feitas, o histórico cai de ~113 MB para ~10 MB depois da limpeza.

Isso **reescreve todos os commits** (todos os hashes mudam) e exige `push --force`. Por isso:

- Combine um horário em que ninguém tenha trabalho não enviado.
- Depois da limpeza, **todo colaborador precisa clonar o repositório de novo**. Um `git pull` num clone antigo reintroduz o histórico antigo.
- O Railway vai fazer um novo deploy quando a `main` for reescrita. É normal.
- Se a `main` tiver proteção de branch no GitHub, desative temporariamente o bloqueio de force push.

Passo a passo, numa pasta temporária (não dentro do seu clone de trabalho). O Git Bash no Windows funciona:

```bash
git clone --mirror https://github.com/GZapello/medschedule-saas.git limpeza.git
cd limpeza.git

# refs/pull/* são somente leitura no GitHub; remova-as da cópia local para não atrapalhar o push
git for-each-ref --format='%(refname)' refs/pull | xargs -r -n1 git update-ref -d

# remove .apk/.exe/.aab de TODOS os commits de TODAS as branches
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force \
  --index-filter 'git rm --cached --ignore-unmatch -q -- "*.apk" "*.exe" "*.aab"' \
  --prune-empty --tag-name-filter cat -- --all

# descarta os objetos antigos e mede o resultado
git for-each-ref --format='%(refname)' refs/original/ | xargs -r -n1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --aggressive
du -sh .

# publica o histórico reescrito (todas as branches e tags)
git push --force --all
git push --force --tags
```

Este procedimento **não foi executado nem testado** automaticamente. Revise antes de rodar. Como alternativa mais rápida, dá para usar o [`git filter-repo`](https://github.com/newren/git-filter-repo) (`git filter-repo --path-glob '*.apk' --path-glob '*.exe' --invert-paths`), que exige Python e instalar a ferramenta.
