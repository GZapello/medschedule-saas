import { test, expect } from '../../helpers/audit-test';

for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 390, 844]] as const) {
  test(`@critical Landing: CTAs, imagens, SEO e navegação ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addLocatorHandler(page.getByRole('button', { name: 'Rejeitar não necessários' }), button => button.click());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /^https:\/\//);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    const broken = await page.locator('img').evaluateAll(images => images.filter(img => img.complete && img.naturalWidth === 0).map(img => img.getAttribute('src')));
    expect(broken).toEqual([]);
    const links = await footer.locator('a[href]').evaluateAll(items => items.map(item => item.getAttribute('href')).filter(Boolean));
    expect(links.some(link => /termos/.test(link!))).toBe(true);
    expect(links.some(link => /privacidade/.test(link!))).toBe(true);
    await page.getByRole('button', { name: 'COMEÇAR AGORA', exact: true }).last().click();
    await expect(page.getByPlaceholder('Nome completo', { exact: true })).toBeVisible();
    await expect(page.locator('#signup-email')).toBeVisible();
    await page.goto('/termos-de-uso', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText(/Termos/i);
    await page.goto('/privacidade', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText(/Privacidade/i);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Entrar no Sistema', exact: true })).toBeVisible();
  });
}
