const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const title = 'Seu atendimento e sua gestão, conectados. Do profissional solo à clínica.';
const url = (process.env.TEST_BASE_URL || 'http://127.0.0.1:5178') + '/tests/landing.html';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install();
      await page.goto(url);
      const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
      await heading.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const geometry = () => page.evaluate(() => {
        const h = document.querySelector('h1'), copy = document.querySelector('.zl-hero-copy');
        return { height: h.offsetHeight, copyTop: copy.offsetTop, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      const initial = await geometry();
      assert.equal(initial.overflow, false);
      assert.equal(await heading.textContent(), title);
      await page.clock.runFor(700);
      const count = await heading.locator('[data-visible="true"]').count();
      assert.ok(count > 0 && count < title.length - 1, 'Progressive reveal');
      assert.deepEqual(await geometry(), initial, 'Stable layout during typing');
      await page.clock.runFor(3000);
      assert.equal(await heading.getAttribute('data-complete'), 'true');
      assert.deepEqual(await geometry(), initial, 'Stable completed layout');
      const originalHeight = await heading.evaluate(h => {
        const original = h.cloneNode(false);
        original.innerHTML = 'Seu atendimento e sua gestão, conectados.<br> <span>Do profissional solo à clínica.</span>';
        original.style.cssText = `position:absolute;visibility:hidden;width:${h.getBoundingClientRect().width}px`;
        h.parentElement.append(original);
        const height = original.offsetHeight;
        original.remove();
        return height;
      });
      assert.equal(initial.height, originalHeight, 'Original responsive line wrapping');
      // CSS transitions use the browser rendering clock, independent of timer fast-forwarding.
      await page.waitForFunction(() => getComputedStyle(document.querySelector('h1 [data-cursor="true"]'), '::after').opacity === '0');
      await page.clock.runFor(5000);
      assert.equal(await heading.getAttribute('data-complete'), 'true', 'Never restarts');
      assert.deepEqual(errors, []);
      await page.close();
    }
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(url);
    await page.locator('h1').waitFor();
    assert.equal(await page.locator('h1').getAttribute('aria-label'), title);
    assert.ok(await page.locator('.zl-title-character').evaluateAll(chars => chars.every(c => getComputedStyle(c).opacity === '1')));
    assert.equal(await page.locator('.zl-title-character').first().evaluate(el => getComputedStyle(el, '::after').display), 'none');
    await page.close();
    console.log('PASS: progressive title, complete accessible text, stable original layout at 320/390/768/1440px, disappearing cursor, no restart, reduced motion and no React errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
