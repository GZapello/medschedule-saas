const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const iconIco = path.join(__dirname, 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    icon: fs.existsSync(iconIco) ? iconIco : (fs.existsSync(iconPath) ? iconPath : undefined),
    title: 'MedSchedule - Gestão Integrada',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Configuração do Menu do Windows
  const menuTemplate = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Recarregar',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.reload()
        },
        {
          label: 'Alternar Tela Cheia',
          accelerator: 'F11',
          click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen())
        },
        { type: 'separator' },
        {
          label: 'Configurar URL do Servidor SaaS...',
          click: async () => {
            mainWindow.webContents.executeJavaScript(`
              const current = localStorage.getItem('saas_custom_api_url') || 'http://localhost:4000/api';
              const next = prompt('Endereço do Servidor SaaS:', current);
              if (next !== null) {
                if (next.trim()) {
                  localStorage.setItem('saas_custom_api_url', next.trim());
                } else {
                  localStorage.removeItem('saas_custom_api_url');
                }
                window.location.reload();
              }
            `);
          }
        },
        { type: 'separator' },
        {
          label: 'Sair',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer', role: 'undo' },
        { label: 'Refazer', role: 'redo' },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Colar', role: 'paste' },
        { label: 'Selecionar Tudo', role: 'selectAll' }
      ]
    },
    {
      label: 'Visualização',
      submenu: [
        { label: 'Aumentar Zoom', role: 'zoomIn' },
        { label: 'Diminuir Zoom', role: 'zoomOut' },
        { label: 'Zoom Padrão', role: 'resetZoom' },
        { type: 'separator' },
        {
          label: 'Ferramentas do Desenvolvedor',
          accelerator: 'F12',
          click: () => mainWindow.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o MedSchedule...',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Sobre o MedSchedule',
              message: 'MedSchedule / Zemda — Gestão Integrada',
              detail: 'Versão 1.1.2 Desktop para Windows (64-bit)\nConectado à mesma plataforma e banco de dados SaaS em tempo real.\n\nPreservação total de dados e configurações.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Caminho do bundle frontend
  const localIndexPath = path.join(__dirname, 'renderer', 'index.html');

  if (fs.existsSync(localIndexPath)) {
    mainWindow.loadFile(localIndexPath);
  } else {
    // Modo de desenvolvimento: tenta conectar no servidor Vite
    mainWindow.loadURL('http://localhost:5173');
  }

  // Intercepta links externos ( target="_blank" ) para abrir no navegador padrão do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
