const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5179';
const output = path.resolve(__dirname, '../../tmp/module-cards-validation');
const modules = ['med', 'estetic', 'fono', 'psico', 'odonto', 'nutri', 'fisio', 'to', 'personal', 'pp'];
const geometry = page => page.locator('.zl-module').evaluateAll(cards => cards.map(card => {
  const r = card.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
}));
const fit = page => page.locator('.zl-module-expansion').evaluate(el => {
  const p = el.getBoundingClientRect();
  return p.left >= 0 && p.right <= innerWidth && (el.dataset.side === 'below' || (p.top >= 0 && p.bottom <= innerHeight));
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  const makePage = async options => {
    const p = await browser.newPage(options); p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${base}/tests/landing.html`); await p.evaluate(() => document.fonts.ready); return p;
  };
  try {
    const page = await makePage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const descriptions = new Set(), sides = new Set();
    for (const id of modules) {
      const card = page.locator(`#modulo-${id}`);
      await card.scrollIntoViewIfNeeded();
      const before = await geometry(page);
      await card.hover({ position: { x: 30, y: 65 } });
      const panel = page.locator('.zl-module-expansion[data-open="true"]'); await panel.waitFor();
      assert.equal(await panel.count(), 1);
      assert.equal(await panel.locator('li').count(), 4);
      sides.add(await panel.getAttribute('data-side'));
      descriptions.add(await panel.locator('.zl-expansion-description').innerText());
      assert.deepEqual(await geometry(page), before, 'Hover must not move the grid');
      assert.ok(await fit(page), 'Panel fits viewport');
      const a = await card.boundingBox(), b = await panel.boundingBox();
      assert.ok(b.x >= a.x + a.width - 2 || b.x + b.width <= a.x + 2, 'Panel never covers its own card');
      await panel.hover();
      await page.waitForTimeout(220);
      assert.equal(await panel.count(), 1, 'Hovering the extension keeps it open');
      const link = panel.getByRole('link');
      const href = await card.getByRole('link').getAttribute('href');
      assert.equal(await link.getAttribute('href'), href);
      if (id === 'fono') await page.screenshot({ path: path.join(output, 'desktop-fono.png') });
      await link.click();
      assert.equal(await page.locator('html').getAttribute('data-test-action'), href.slice(1));
      await page.locator('.zl-module-expansion').waitFor({ state: 'detached' });
      await page.mouse.move(5, 5);
    }
    assert.equal(descriptions.size, 10); assert.deepEqual([...sides].sort(), ['left', 'right']);

    // Move between disjoint cards: at most one disclosure, then leave the entire area.
    await page.locator('#modulo-med').hover();
    await page.locator('#module-expansion-med').waitFor();
    await page.locator('#modulo-personal').hover();
    await page.locator('#module-expansion-personal').waitFor();
    assert.equal(await page.locator('.zl-module-expansion').count(), 1);
    await page.mouse.move(2, 2); await page.locator('.zl-module-expansion').waitFor({ state: 'detached' });

    // Dismissing an overlay must not immediately open the card uncovered beneath the pointer.
    await page.locator('#modulo-fono').hover(); await page.locator('#module-expansion-fono').waitFor();
    await page.locator('#module-expansion-fono').hover(); await page.keyboard.press('Escape');
    await page.waitForTimeout(500); assert.equal(await page.locator('.zl-module-expansion').count(), 0);
    await page.mouse.move(2, 2);

    // Fast pointer travel doesn't open a panel.
    await page.locator('#modulo-med').hover(); await page.mouse.move(2, 2);
    await page.waitForTimeout(250); assert.equal(await page.locator('.zl-module-expansion').count(), 0);

    const more = page.locator('#modulo-odonto .zl-module-more');
    await more.focus(); await more.press('Enter');
    await page.locator('#module-expansion-odonto').waitFor(); await more.press('Tab');
    assert.equal(await page.locator('.zl-expansion-close').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab'); assert.equal(await page.locator('.zl-expansion-link').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape'); await page.locator('.zl-module-expansion').waitFor({ state: 'detached' });
    assert.equal(await more.evaluate(el => el === document.activeElement), true);
    await more.press('Enter'); await page.locator('#module-expansion-odonto').waitFor();
    await page.mouse.click(2, 2); await page.locator('.zl-module-expansion').waitFor({ state: 'detached' });
    await page.close();

    for (const width of [320, 390, 768, 1024]) {
      const p = await makePage({ viewport: { width, height: 1000 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
      for (const id of modules) {
        const trigger = p.locator(`#modulo-${id} .zl-module-more`);
        await trigger.tap();
        const panel = p.locator('.zl-module-expansion[data-open="true"]'); await panel.waitFor();
        assert.ok(await fit(p));
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const cardBox = await p.locator(`#modulo-${id}`).boundingBox(), panelBox = await panel.boundingBox();
        if (width <= 860) {
          assert.equal(await panel.getAttribute('data-side'), 'below');
          assert.ok(panelBox.y >= cardBox.y + cardBox.height, 'Touch panel sits below its card');
        }
        if (width === 390 && id === 'fono') {
          await panel.scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(output, 'mobile-fono.png') });
        }
        await panel.getByRole('button').tap(); await p.locator('.zl-module-expansion').waitFor({ state: 'detached' });
      }
      await p.close();
    }
    const motion = await makePage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
    await motion.locator('#modulo-fono').scrollIntoViewIfNeeded(); await motion.waitForTimeout(850);
    await motion.locator('#modulo-fono').hover();
    await motion.locator('.zl-module-expansion').waitFor();
    assert.equal(await motion.locator('.zl-module-expansion').evaluate(el => getComputedStyle(el).animationDuration), '0.35s');
    await motion.waitForTimeout(400); assert.ok(await fit(motion));
    await motion.setViewportSize({ width: 390, height: 850 });
    await motion.waitForFunction(() => document.querySelector('.zl-module-expansion')?.dataset.side === 'below');
    assert.ok(await motion.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await motion.keyboard.press('Escape'); await motion.locator('.zl-module-expansion').waitFor({ state: 'detached' });
    await motion.close();
    assert.deepEqual(errors, []);
    console.log('PASS: all 10 modules, unique content/real links, both sides, stable desktop grid, hover continuity, switching, fast travel, Escape/outside/close, keyboard, touch at 320/390/768/1024px, reduced motion and responsive repositioning.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
