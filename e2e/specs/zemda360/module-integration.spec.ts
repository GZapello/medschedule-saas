import { test, expect } from '@playwright/test';
import { login } from '../../helpers/session';

test.describe('Zemda360 - Integração aos Módulos Profissionais', () => {
  test('Zemda360 é removido da sidebar e exibido no cabeçalho do módulo profissional (Fisioterapia)', async ({ page }) => {
    await login(page, 'fisio');

    // 1. Verificar que Zemda360 NÃO está na sidebar
    const sidebarZemda360 = page.locator('nav').getByRole('button', { name: 'Zemda360 (Mapeamento)' });
    await expect(sidebarZemda360).toHaveCount(0);

    // 2. Navegar para o ZemdaFisio
    await page.getByRole('button', { name: 'ZemdaFisio (Fisioterapia)' }).click();
    await expect(page.getByRole('heading', { name: 'ZemdaFisio' })).toBeVisible();

    // 3. Verificar botão discreto Zemda360 no cabeçalho ao lado da identificação profissional
    const headerZemda360Btn = page.getByRole('button', { name: 'Abrir Zemda360' });
    await expect(headerZemda360Btn).toBeVisible();

    // 4. Clicar no botão sem paciente selecionado deve solicitar seleção
    await headerZemda360Btn.click();
    await expect(page.getByText('Selecione um paciente para iniciar o mapeamento no Zemda360.')).toBeVisible();
  });

  test('Zemda360 é removido da sidebar e integrado ao ZemdaEstetic', async ({ page }) => {
    await login(page, 'estetic');

    // 1. Verificar que Zemda360 NÃO está na sidebar
    const sidebarZemda360 = page.locator('nav').getByRole('button', { name: 'Zemda360 (Mapeamento)' });
    await expect(sidebarZemda360).toHaveCount(0);

    // 2. Navegar para o ZemdaEstetic
    await page.getByRole('button', { name: 'ZemdaEstetic (Estética)' }).click();
    await expect(page.getByRole('heading', { name: 'ZemdaEstetic' })).toBeVisible();

    // 3. Cabeçalho do ZemdaEstetic possui o botão discreto Zemda360
    const headerZemda360Btn = page.getByRole('button', { name: 'Abrir Zemda360' });
    await expect(headerZemda360Btn).toBeVisible();

    // 4. Clicar sem paciente selecionado solicita seleção
    await headerZemda360Btn.click();
    await expect(page.getByText('Selecione um paciente para iniciar o mapeamento no Zemda360.')).toBeVisible();
  });

  test('Atalhos do painel inicial de Fonoaudiologia incluem o acesso rápido ao Zemda360', async ({ page }) => {
    await login(page, 'fono');

    // 1. Verificar que Zemda360 NÃO está na sidebar
    const sidebarZemda360 = page.locator('nav').getByRole('button', { name: 'Zemda360 (Mapeamento)' });
    await expect(sidebarZemda360).toHaveCount(0);

    // 2. Navegar para o ZemdaFono
    await page.getByRole('button', { name: 'ZemdaFono (Fonoaudiologia)' }).click();
    await expect(page.getByRole('heading', { name: 'ZemdaFono' })).toBeVisible();

    // 3. Verificar botão discreto no cabeçalho
    const headerZemda360Btn = page.getByRole('button', { name: 'Abrir Zemda360' });
    await expect(headerZemda360Btn).toBeVisible();

    // 4. Verificar que a seção de Acesso Rápido contém o card Zemda360
    const shortcutZemda360 = page.getByRole('button', { name: /Zemda360\s*Mapeamento anatômico/ });
    await expect(shortcutZemda360).toBeVisible();
  });
});
