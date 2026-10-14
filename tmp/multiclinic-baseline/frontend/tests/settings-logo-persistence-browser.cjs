const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  console.log('Iniciando teste de regressão: persistência da logo da clínica...');
  
  // Cria um PNG válido 200x200 (>3KB) para passar nas validações de formato, tamanho (3KB-2MB) e resolução (min 180x180)
  const sharp = require('../../backend/node_modules/sharp');
  const tempPngPath = path.resolve(__dirname, 'test-logo-200x200.png');
  await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 79, g: 70, b: 229, alpha: 1 } }
  }).png({ compressionLevel: 0 }).toFile(tempPngPath);

  const bundle = async (source) => (await build({
    stdin: { contents: source, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'iife',
    define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'mocks',
      setup(b) {
        b.onLoad({ filter: /[\\/]context[\\/]AuthContext\.tsx$/ }, () => ({
          contents: `
            export const useAuth = () => window.qaAuth();
          `,
          loader: 'js'
        }));
        b.onLoad({ filter: /[\\/]context[\\/]ToastContext\.tsx$/ }, () => ({
          contents: `
            export const useToast = () => ({
              showToast: (message, type) => {
                window.toasts = window.toasts || [];
                window.toasts.push({ message, type });
              }
            });
          `,
          loader: 'js'
        }));
        b.onLoad({ filter: /[\\/]api[\\/]client\.ts$/ }, () => ({
          contents: `
            export const ApiClient = {
              get: (...args) => (window.qaGet ? window.qaGet(...args) : Promise.resolve({})),
              post: (...args) => (window.qaPost ? window.qaPost(...args) : Promise.resolve({})),
              put: (...args) => (window.qaPut ? window.qaPut(...args) : Promise.resolve({}))
            };
          `,
          loader: 'js'
        }));
      }
    }]
  })).outputFiles[0].text;

  const testAppJs = await bundle(`
    import React, { useState, useEffect } from 'react';
    import { createRoot } from 'react-dom/client';
    import { SettingsView } from './src/components/settings/SettingsView';

    function TestWrapper() {
      const [tenant, setTenant] = useState({
        id: 'tenant-test-1',
        name: 'Clínica Teste',
        logo_url: 'https://example.com/initial-old-logo.png'
      });
      const [user, setUser] = useState({
        id: 'user-admin',
        role: 'clinic_admin',
        email: 'admin@clinica.test'
      });

      useEffect(() => {
        window.setMockTenant = (newTenant) => setTenant({ ...newTenant });
        window.setMockUser = (newUser) => setUser({ ...newUser });
      }, []);

      window.qaAuth = () => ({
        currentUser: user,
        currentTenant: tenant,
        isClinicAdmin: true,
        refreshTenant: async () => {
          window.refreshTenantCalled = true;
          // Simula atualização vinda do servidor
          if (window.pendingServerTenant) {
            setTenant({ ...window.pendingServerTenant });
          }
        },
        reloadSession: async () => {
          window.reloadSessionCalled = true;
        },
        hasPermission: () => true
      });

      return <SettingsView initialSection="clinic" />;
    }

    createRoot(document.getElementById('root')).render(<TestWrapper />);
  `);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
    await page.route('**/*', (route) => {
      route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"></div>'
      });
    });
    await page.goto('https://zemda.test/');

    await page.evaluate(() => {
      window.toasts = [];
      window.putCalls = [];
      window.qaAuth = () => ({
        currentUser: { id: 'user-admin', role: 'clinic_admin', email: 'admin@clinica.test' },
        currentTenant: { id: 'tenant-test-1', name: 'Clínica Teste', logo_url: 'https://example.com/initial-old-logo.png' },
        isClinicAdmin: true,
        refreshTenant: async () => {},
        reloadSession: async () => {},
        hasPermission: () => true
      });
      window.qaPut = async (url, data) => {
        window.putCalls.push({ url, data });
        if (url === '/v1/tenants/current') {
          // Atualiza pendingServerTenant para o que foi salvo
          window.pendingServerTenant = {
            id: 'tenant-test-1',
            name: data.name,
            logo_url: data.logoUrl
          };
        }
        return { message: 'Salvo com sucesso' };
      };
      window.qaGet = async (url) => {
        if (typeof url === 'string' && url.includes('professionals')) {
          return [];
        }
        if (typeof url === 'string' && url.includes('insurances')) {
          return [];
        }
        return {};
      };
    });

    await page.addScriptTag({ content: testAppJs });

    // 1. Aguarda renderizar o formulário da clínica e a logo inicial
    const logoImg = page.locator('img[alt="Logo da Clínica"]');
    await logoImg.waitFor();
    const initialSrc = await logoImg.getAttribute('src');
    assert.equal(initialSrc, 'https://example.com/initial-old-logo.png', 'Logo inicial deve ser a do currentTenant');
    console.log('✔ Logo inicial carregada corretamente:', initialSrc);

    // 2. Simula seleção de nova logo via input de arquivo
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tempPngPath);

    // Aguarda carregar a nova prévia (data:image/...)
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="Logo da Clínica"]');
      return img && img.src.startsWith('data:image/');
    });

    const newPreviewSrc = await logoImg.getAttribute('src');
    assert.ok(newPreviewSrc.startsWith('data:image/'), 'Prévia deve ser o data URL da imagem selecionada');
    console.log('✔ Nova logo selecionada e prévia exibida com sucesso.');

    // 3. CENÁRIO CRÍTICO: Simula atualização de currentTenant (ex: reloadSession/focus com logo antiga)
    console.log('Simulando atualização de currentTenant com a logo antiga (ex: window focus / reloadSession)...');
    await page.evaluate(() => {
      window.setMockTenant({
        id: 'tenant-test-1',
        name: 'Clínica Teste (Tenant Atualizado pelo Focus)',
        logo_url: 'https://example.com/initial-old-logo.png' // Ainda a logo antiga no servidor!
      });
    });

    // Espera ciclos de renderização do React
    await page.waitForTimeout(100);

    // Verifica se a prévia continua sendo a NOVA imagem selecionada e NÃO foi sobrescrita
    const currentSrcAfterFocus = await logoImg.getAttribute('src');
    assert.equal(
      currentSrcAfterFocus,
      newPreviewSrc,
      'A prévia da nova logo NÃO deve desaparecer ou ser sobrescrita por reloadSession/focus com logo antiga!'
    );
    console.log('✔ SUCESSO: Prévia da logo permaneceu intacta após simulação de focus/reloadSession!');

    // 4. Salvar Alterações da Clínica
    console.log('Salvando alterações da clínica...');
    // Preenche CNPJ válido para passar na validação de salvamento
    await page.locator('input').filter({ hasText: '' }).first(); // trigger
    const saveButton = page.getByRole('button', { name: /Salvar Alterações da Clínica/i });
    await saveButton.click();

    // Aguarda a chamada PUT
    await page.waitForFunction(() => window.putCalls && window.putCalls.length > 0);
    const putCalls = await page.evaluate(() => window.putCalls);
    assert.equal(putCalls.length, 1);
    assert.equal(putCalls[0].url, '/v1/tenants/current');
    assert.equal(putCalls[0].data.logoUrl, newPreviewSrc, 'A logo enviada no PUT deve ser a nova base64');
    console.log('✔ Logo salva enviada via PUT com sucesso.');

    // 5. Teste de remoção da logo
    const removeBtn = page.locator('button[title="Remover logotipo"]');
    await removeBtn.click();

    // Deve exibir "Sem logo"
    await page.getByText('Sem logo').waitFor();
    console.log('✔ Logotipo removido, exibindo "Sem logo".');

    // 6. Simula outro focus/reloadSession antes de salvar a remoção
    console.log('Simulando focus após remoção...');
    await page.evaluate(() => {
      window.setMockTenant({
        id: 'tenant-test-1',
        name: 'Clínica Teste',
        logo_url: 'https://example.com/some-stale-logo.png'
      });
    });

    await page.waitForTimeout(100);
    // Ainda deve exibir "Sem logo" (não deve restaurar some-stale-logo)
    assert.ok(await page.getByText('Sem logo').isVisible(), 'Após remoção local, reloadSession não deve restaurar logo antiga');
    console.log('✔ SUCESSO: Estado de logo removida protegido contra sobrescrita de sessão!');

    console.log('\n=========================================');
    console.log('TODOS OS TESTES DE PERSISTÊNCIA DA LOGO PASSARAM!');
    console.log('=========================================\n');
  } finally {
    if (fs.existsSync(tempPngPath)) fs.unlinkSync(tempPngPath);
    await browser.close();
  }
})().catch((err) => {
  console.error('ERRO NO TESTE:', err);
  process.exit(1);
});
