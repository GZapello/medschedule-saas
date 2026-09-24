# Guia Oficial de Hospedagem: MedSchedule SaaS em Produção (24/7)

Este guia orienta o processo de colocar o **MedSchedule SaaS** no ar na nuvem para que qualquer pessoa de qualquer lugar da cidade ou do país acesse 24 horas por dia, com endereço seguro HTTPS, sem depender do seu computador estar ligado.

---

## 🌟 Opção 1: Hospedar no Railway (Recomendada - Mais Fácil e Rápida)

O **Railway** é atualmente a melhor plataforma para hospedar aplicações completas com Docker e banco de dados SQLite persistente.

### Passo 1: Criar uma conta no Railway
1. Acesse: [https://railway.app](https://railway.app)
2. Crie uma conta gratuita (pode entrar com sua conta do GitHub ou e-mail).

### Passo 2: Subir o Projeto para o seu GitHub
Se você já utiliza o GitHub:
1. Crie um repositório no seu GitHub (ex: `medschedule-saas`).
2. No seu computador, dentro da pasta do projeto, inicialize e envie o código:
   ```bash
   git init
   git add .
   git commit -m "Deploy MedSchedule SaaS em produção"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/medschedule-saas.git
   git push -u origin main
   ```

*(Dica: Se preferir não usar o GitHub no navegador, você também pode usar a ferramenta de linha de comando do Railway: `npm install -g @railway/cli`, depois digitar `railway login` e `railway up`).*

### Passo 3: Criar o Serviço no Railway
1. No painel do Railway, clique no botão **"+ New Project"** (Novo Projeto).
2. Selecione **"Deploy from GitHub repo"** e escolha o repositório `medschedule-saas`.
3. O Railway detectará automaticamente o nosso arquivo `Dockerfile` e começará a compilar o sistema na nuvem.

### Passo 4: Adicionar o Volume de Dados (Persistência do Banco SQLite)
Para garantir que o banco de dados nunca seja reinicializado:
1. No painel do seu projeto no Railway, clique com o botão direito no cartão do serviço (ou clique nele) e selecione **"Add Volume"** (ou na aba *Data*).
2. Defina o **Mount Path** exatamente como:
   ```text
   /data
   ```
3. Salve. O Railway garantirá que o arquivo `/data/saas_schedule.db` fique salvo permanentemente em disco de alta performance.

### Passo 5: Gerar o seu Link Público com HTTPS
1. Clique no serviço do seu projeto no Railway.
2. Vá até a aba **"Settings"** e desça até a seção **"Networking"**.
3. Clique em **"Generate Domain"** (Gerar Domínio).
4. O Railway criará imediatamente um link seguro na internet, por exemplo:
   👉 **`https://medschedule-production.up.railway.app`**

Pronto! Seu sistema já está no ar 24h por dia para o mundo inteiro!

---

## 📲 Como a pessoa da outra região vai acessar:

### 1. Pelo Navegador (Computador ou Celular):
* Basta enviar o link gerado pelo Railway:
  `https://medschedule-production.up.railway.app`
* Ela poderá solicitar acesso, criar sua clínica, cadastrar pacientes ou agendar consultas normalmente.

### 2. Pelo Aplicativo Android (.apk):
* No aplicativo Android instalado no celular dela:
  1. Na tela de login, clique no botão **"Servidor: [Endereço]"**;
  2. Digite a URL da nuvem adicionando `/api` no final, por exemplo:
     `https://medschedule-production.up.railway.app/api`
  3. Clique em **"Testar Conexão"** e em seguida **"Salvar e Conectar"**.
  4. O aplicativo passará a sincronizar diretamente com o servidor na nuvem!

### 3. Pelo Programa Windows (.exe):
* No computador dela, após instalar o `.exe`:
  1. No menu superior, clique em **Arquivo -> Configurar URL do Servidor SaaS...**;
  2. Digite `https://medschedule-production.up.railway.app/api`;
  3. O programa conectará ao servidor imediatamente.

---

## 🛡️ Opção 2: Hospedar em VPS Linux Própria (Hostinger, Hetzner, DigitalOcean)

Se você contratar um servidor Linux dedicado (VPS com Ubuntu):

1. Instale o Docker e o Docker Compose na VPS:
   ```bash
   apt update && apt install -y docker.io docker-compose-v2
   ```
2. Copie os arquivos do projeto para a VPS ou clone via Git.
3. Na pasta do projeto na VPS, execute com um único comando:
   ```bash
   docker compose up -d --build
   ```
4. O sistema iniciará em segundo plano na porta `4000`, já com volume persistente montado em `medschedule-data:/data`.
5. Se possuir um domínio próprio (ex: `app.suaclinica.com.br`), basta apontar o DNS e instalar o Certbot Nginx para ter SSL gratuito.

---

## 🔐 Variáveis de ambiente obrigatórias

O servidor **não inicia** sem as seguintes variáveis configuradas (no Railway: aba *Variables* do serviço; numa VPS: arquivo `.env` na raiz do projeto, usado pelo `docker-compose.yml`):

* `JWT_SECRET` — segredo usado para assinar as sessões dos usuários.
* `ZEMDA_FILES_SIGNING_SECRET` — segredo usado para assinar URLs de arquivos.

Gere valores aleatórios únicos para cada ambiente (nunca reaproveite o mesmo valor entre produção, homologação e sua máquina local), por exemplo:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Consulte `backend/.env.example` para a lista completa de variáveis (e-mail, Asaas, WhatsApp, Gemini, R2, etc).

## 💡 Contas de demonstração (apenas ambiente local/testes)

Por padrão, uma instalação nova **não** cria nenhuma conta de acesso — o cadastro é feito pelo fluxo público normal (`/cadastro`). Se quiser testar o sistema localmente com uma clínica e usuários fictícios já povoados, defina `SEED_DEMO_DATA=true` antes de subir o backend pela primeira vez; isso cria uma clínica de exemplo com contas de senha `123456`.

⚠️ **Nunca defina `SEED_DEMO_DATA=true` em produção** — isso criaria contas de administrador com senha conhecida publicamente (inclusive neste histórico do repositório) em um ambiente com dados reais de clientes.
