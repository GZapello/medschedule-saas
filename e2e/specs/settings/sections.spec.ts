import { test, expect } from '../../helpers/audit-test';
import { login } from '../../helpers/session';

test('Configurações: seções administrativas carregam suas APIs sem erro', async ({ page }) => {
  await login(page, 'manager');
  for (const title of ['Clínica & Identidade', 'Equipe & Acessos', 'Agenda & Operação', 'Financeiro & Repasses', 'Módulos & Recursos', 'Integrações (WhatsApp/Infobip)', 'Importação de Dados', 'Conta & Segurança', 'Assinatura & Plano']) {
    await page.goto('/configuracoes');
    await page.getByRole('heading', { name: title, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Central de Configurações', exact: true })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Erro ao carregar');
  }
});
