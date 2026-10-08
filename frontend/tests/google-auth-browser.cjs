const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, firefox, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');

(async () => {
  const bundle = async (mode, client = 'test.apps.googleusercontent.com') => (
    await build({
      stdin: {
        contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleAuthButton } from './src/components/auth/GoogleAuthButton';
import { AuthPage } from './src/components/auth/AuthPage';
import { CreateClinicModal } from './src/components/auth/CreateClinicModal';

function Test() {
  const [v, setV] = React.useState(0);
  const [show, setShow] = React.useState(true);
  return (
    <>
      <button onClick={() => setShow(false)}>Unmount first</button>
      <button onClick={() => setV(v + 1)}>Rerender</button>
      {show && (
        <GoogleAuthButton
          onSuccess={t => {
            window.result = 'first:' + v;
            window.deliveries = (window.deliveries || 0) + 1;
          }}
        />
      )}
      <GoogleAuthButton
        onSuccess={t => {
          window.result = 'second:' + v;
          window.deliveries = (window.deliveries || 0) + 1;
        }}
      />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  ${mode === 'button' ? '<Test/>' : mode === 'modal' ? '<CreateClinicModal isOpen onClose={() => { window.modalClosed = true; }} />' : '<AuthPage initialAction={window.signup ? "create-clinic" : "login"}/>'}
);
`,
        resolveDir: root,
        loader: 'tsx'
      },
      bundle: true,
      write: false,
      format: 'iife',
      define: {
        'import.meta': '{}',
        'import.meta.env': JSON.stringify({ VITE_GOOGLE_CLIENT_ID: client })
      },
      plugins: [
        {
          name: 'fixtures',
          setup(b) {
            b.onLoad({ filter: /[\\/]context[\\/]AuthContext\.tsx$/ }, () => ({
              contents: 'export const useAuth = () => ({ loginWithToken: (token, user) => { window.loggedIn = user; }, login: () => {} });',
              loader: 'js'
            }));
            b.onLoad({ filter: /[\\/]context[\\/]ToastContext\.tsx$/ }, () => ({
              contents: 'export const useToast = () => ({ showToast: (message) => { window.toasts = window.toasts || []; window.toasts.push(message); } });',
              loader: 'js'
            }));
            b.onLoad({ filter: /[\\/]api[\\/]client\.ts$/ }, () => ({
              contents: 'export const ApiClient = { get: async () => [], post: (...a) => window.qaPost(...a) };',
              loader: 'js'
            }));
            b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
          }
        }
      ]
    })
  ).outputFiles[0].text;

  const settingsSource = fs.readFileSync(path.join(root, 'src/components/settings/SettingsView.tsx'), 'utf8');
  assert.ok(!settingsSource.includes("id: 'integrations'"));
  assert.ok(!settingsSource.includes("setActiveSection('integrations')"));
  assert.ok(settingsSource.includes("activeSection === 'integrations'"), 'Infobip implementation retained without UI access');

  const button = await bundle('button');
  const auth = await bundle('auth');
  const modal = await bundle('modal');
  const missing = await bundle('button', '');

  const candidates = [
    { name: 'Chromium', launch: () => chromium.launch({ headless: true }) },
    { name: 'Chrome', launch: () => chromium.launch({ channel: 'chrome', headless: true }) },
    { name: 'Edge', launch: () => chromium.launch({ channel: 'msedge', headless: true }) },
    { name: 'Firefox', launch: () => firefox.launch({ headless: true }) },
    { name: 'Safari/WebKit', launch: () => webkit.launch({ headless: true }) }
  ];

  const opera = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs/Opera/opera.exe'),
    'C:/Program Files/Opera/opera.exe'
  ].find(fs.existsSync);
  if (opera) {
    candidates.push({ name: 'Opera', launch: () => chromium.launch({ executablePath: opera, headless: true }) });
  } else {
    candidates.push({
      name: 'Opera (Emulated)',
      launch: () => chromium.launch({
        headless: true,
        args: ['--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0']
      })
    });
  }

  for (const candidate of candidates) {
    let browser;
    try {
      browser = await candidate.launch();
    } catch (e) {
      console.log('UNAVAILABLE ' + candidate.name + ': ' + e.message);
      continue;
    }

    try {
      const page = await browser.newPage();
      const errors = [];
      const technical = /Problemas para entrar com Google|FedCM|VITE_GOOGLE_CLIENT_ID|GOOGLE_CLIENT_ID|Google Cloud|Client ID|origin_mismatch|popups|iframe|cross-origin|Window|toJSON/i;
      page.on('pageerror', e => errors.push(e.message));

      await page.route('**/*', r => r.request().resourceType() === 'script' ? r.abort() : r.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><div id="root"></div>' }));

      const prepare = async (code, { scenario = 'new', signup = false, noScript = false } = {}) => {
        await page.goto('https://zemda.com.br/login');
        await page.evaluate(({ scenario, signup, noScript }) => {
          window.signup = signup;
          window.inits = 0;
          window.posts = [];
          window.toasts = [];
          localStorage.setItem('zemda_cookie_consent', JSON.stringify({ analytics: true }));
          Object.defineProperty(window, 'gtag', {
            configurable: true,
            get() { throw new Error('tracking unavailable'); }
          });
          window.qaPost = async (ep, body) => {
            body = JSON.parse(JSON.stringify(body));
            window.posts.push({ ep, body });
            if (window.failApi) throw new Error("Failed to read a named property 'toJSON' from 'Window': cross-origin frame");
            if (body.context === 'signup') return { token: 'created', user: { id: 'new-user' } };
            if (scenario === 'existing' || body.additionalData?.password === 'correct') return { token: 'test', user: { id: 'existing' } };
            if (scenario === 'link') return { requiresPasswordToLink: true, email: 'qa@example.invalid' };
            return { isNewUser: true, googleUser: { name: 'Pessoa Google', email: 'qa@example.invalid' } };
          };
          if (!noScript) {
            window.google = {
              accounts: {
                id: {
                  initialize: config => {
                    window.inits++;
                    window.config = config;
                  },
                  renderButton: (node, options) => {
                    window.buttonOptions = window.buttonOptions || [];
                    window.buttonOptions.push(options);
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = 'Google fixture';
                    b.setAttribute('role', 'button');
                    b.onclick = () => {
                      options.click_listener();
                      if (!window.noCredential) {
                        window.config.callback({
                          state: options.state,
                          credential: window.emptyCredential ? undefined : 'a.' + btoa(JSON.stringify({ name: 'Pessoa Google', email: 'qa@example.invalid' })) + '.c',
                          get window() { throw Error('External object must not be inspected'); }
                        });
                      }
                    };
                    node.appendChild(b);
                  }
                }
              }
            };
          }
        }, { scenario, signup, noScript });
        await page.addScriptTag({ content: code });
      };

      // 1. Initial render, multiple buttons, config validation
      await prepare(button);
      await page.getByRole('button', { name: 'Google fixture' }).nth(1).click();
      await page.waitForFunction(() => window.result === 'second:0');
      assert.equal(await page.evaluate(() => result), 'second:0');
      await page.getByRole('button', { name: 'Rerender' }).click();
      await page.getByRole('button', { name: 'Google fixture' }).first().click();
      await page.waitForFunction(() => window.result === 'first:1');
      assert.equal(await page.evaluate(() => result), 'first:1');
      assert.equal(await page.evaluate(() => inits), 1);
      assert.ok(!technical.test(await page.locator('body').innerText()));
      assert.equal(await page.evaluate(() => config.ux_mode), 'popup');
      assert.equal(await page.evaluate(() => config.use_fedcm_for_button), false);
      assert.equal(await page.evaluate(() => config.itp_support), true);

      // 2. Empty credential handling
      await page.evaluate(() => window.emptyCredential = true);
      await page.getByRole('button', { name: 'Google fixture' }).first().click();
      await page.getByRole('alert').filter({ hasText: 'Este navegador não conseguiu concluir o acesso com Google.' }).waitFor();

      // 3. Timeout recovery
      await prepare(button);
      await page.clock.install();
      await page.evaluate(() => window.noCredential = true);
      await page.getByRole('button', { name: 'Google fixture' }).first().click();
      await page.clock.fastForward(46000);
      await page.getByRole('alert').filter({ hasText: 'Este navegador não conseguiu concluir o acesso com Google.' }).waitFor();
      await page.clock.resume();
      await page.evaluate(() => window.noCredential = false);
      await page.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByRole('button', { name: 'Google fixture' }).first().click();
      await page.waitForFunction(() => window.result === 'first:0');

      // 4. Duplicate / Unmounted button safety
      await prepare(button);
      await page.evaluate(() => window.noCredential = true);
      await page.getByRole('button', { name: 'Google fixture' }).first().click();
      await page.getByRole('button', { name: 'Google fixture' }).last().click();
      await page.evaluate(() => config.callback({ state: buttonOptions[0].state, credential: 'token-first' }));
      await page.waitForFunction(() => result === 'first:0');
      await page.evaluate(() => config.callback({ state: buttonOptions[1].state, credential: 'token-second' }));
      await page.waitForFunction(() => result === 'second:0');
      await page.evaluate(() => config.callback({ state: buttonOptions[1].state, credential: 'duplicate' }));
      assert.equal(await page.evaluate(() => deliveries), 2);
      await page.getByRole('button', { name: 'Google fixture' }).first().click();
      await page.getByRole('button', { name: 'Unmount first' }).click();
      await page.evaluate(() => config.callback({ state: buttonOptions[0].state, credential: 'late' }));
      assert.equal(await page.evaluate(() => deliveries), 2);

      // 5. Missing client configuration
      await prepare(missing);
      await page.getByRole('alert').filter({ hasText: 'Este navegador não conseguiu concluir o acesso com Google.' }).first().waitFor();
      assert.ok(!technical.test(await page.locator('body').innerText()));

      // 6. Blocked script / adblocker simulation
      await prepare(button, { noScript: true });
      await page.evaluate(() => document.getElementById('google-gsi-client')?.dispatchEvent(new Event('error')));
      await page.getByRole('alert').filter({ hasText: 'Este navegador não conseguiu concluir o acesso com Google.' }).first().waitFor();
      assert.ok(!technical.test(await page.locator('body').innerText()));

      // 7. Full AuthPage and CreateClinicModal flows
      for (const code of [auth, modal]) {
        // Scenario: existing user login
        await prepare(code, { scenario: 'existing' });
        await page.getByRole('button', { name: 'Google fixture' }).first().click();
        await page.waitForFunction(() => window.loggedIn?.id === 'existing');

        // Scenario: new user signup + trocar conta
        await prepare(code, { scenario: 'new' });
        await page.getByRole('button', { name: 'Google fixture' }).first().click();
        await page.waitForFunction(() => [...document.querySelectorAll('input')].some(x => x.value === 'qa@example.invalid'));
        assert.equal(await page.getByPlaceholder('Nome completo', { exact: true }).inputValue(), 'Pessoa Google');

        // Test "Trocar conta" if on modal
        if (code === modal) {
          const trocarBtn = page.getByRole('button', { name: 'Trocar' });
          if (await trocarBtn.count() > 0) {
            await trocarBtn.click();
            await page.getByRole('button', { name: 'Google fixture' }).first().waitFor();
            await page.getByRole('button', { name: 'Google fixture' }).first().click();
            await page.waitForFunction(() => [...document.querySelectorAll('input')].some(x => x.value === 'qa@example.invalid'));
          }
        }

        // Complete passwordless registration
        await page.getByPlaceholder('(54) 99999-9999').fill('11999999999');
        await page.getByRole('combobox', { name: 'Profissão', exact: true }).click();
        await page.getByRole('option').filter({ hasText: 'Médico' }).first().click();
        await page.locator('input[type=checkbox]').nth(0).check();
        await page.locator('input[type=checkbox]').nth(1).check();
        assert.equal(await page.getByRole('button', { name: 'Criar minha conta com Google' }).locator('xpath=ancestor::form').locator('input[type=password]').count(), 0);
        await page.getByRole('button', { name: 'Criar minha conta com Google' }).click();
        await page.waitForFunction(() => window.loggedIn?.id === 'new-user');
        const signupBody = await page.evaluate(() => posts.at(-1).body);
        assert.equal(signupBody.context, 'signup');
        assert.equal(typeof signupBody.idToken, 'string');
        assert.equal(signupBody.additionalData.password, undefined);

        // Safe API failures
        await prepare(code, { scenario: 'existing' });
        await page.evaluate(() => window.failApi = true);
        await page.getByRole('button', { name: 'Google fixture' }).first().click();
        await page.waitForFunction(() => window.toasts.length > 0);
        assert.ok((await page.evaluate(() => window.toasts)).every(t => typeof t === 'string' && !/cross-origin|toJSON|Window|iframe|FedCM|Client ID/.test(t)));

        // Link existing account + Cancelar dialog
        await prepare(code, { scenario: 'link' });
        await page.getByRole('button', { name: 'Google fixture' }).first().click();
        const dialog = page.getByRole('dialog', { name: 'Vincular Conta Google' });
        await dialog.waitFor();
        assert.equal(await page.evaluate(() => !window.loggedIn), true);

        // Test cancel
        await dialog.getByRole('button', { name: 'Cancelar' }).click();
        assert.equal(await dialog.count(), 0);

        // Re-open and confirm password
        await page.getByRole('button', { name: 'Google fixture' }).first().click();
        await dialog.waitFor();
        await dialog.getByLabel('Sua senha do Zemda').fill('correct');
        await dialog.getByRole('button', { name: 'Confirmar e Entrar' }).click();
        await page.waitForFunction(() => window.loggedIn?.id === 'existing');
        assert.equal(await page.evaluate(() => posts.at(-1).body.additionalData.password), 'correct');
      }

      await prepare(auth, { scenario: 'link', signup: true });
      await page.getByRole('button', { name: 'Google fixture' }).last().click();
      await page.getByRole('dialog', { name: 'Vincular Conta Google' }).waitFor();

      assert.deepEqual(errors, []);
      console.log('PASS ' + candidate.name + ': All Google Auth scenarios validated (Popup/ITP compatibility, feature detection, Trocar conta, Cancelar, missing config, timeout, passwordless signup, no technical leaks)');
    } finally {
      await browser.close();
    }
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
