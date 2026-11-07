import { test, expect } from '../../helpers/audit-test';
import { login } from '../../helpers/session';

test('Novo Agendamento: conta sem serviços exibe estado vazio, onboarding explicativo e modal de serviço', async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/agenda');

  // Intercepta /v1/services para simular uma conta nova sem nenhum serviço
  let servicesInDb: any[] = [];
  await page.route('**/v1/services*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(servicesInDb)
      });
    } else if (route.request().method() === 'POST') {
      const postData = route.request().postDataJSON();
      const newService = {
        id: 'srv-created-' + Date.now(),
        name: postData.name || 'Consulta Nova',
        price: postData.price || '150',
        duration_minutes: postData.durationMinutes || 50,
        modality: postData.modality || 'both',
        active: 1
      };
      servicesInDb.push(newService);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newService)
      });
    } else {
      await route.continue();
    }
  });

  // Abre o modal de Novo Agendamento
  await page.getByRole('button', { name: 'Agendar', exact: true }).click();
  const appointmentModal = page.getByRole('heading', { name: 'Novo Agendamento', exact: true }).locator('xpath=../../..');
  await expect(appointmentModal).toBeVisible();

  // 1. Verifica estado vazio do campo de serviço
  await expect(appointmentModal.getByText('Nenhum serviço cadastrado ainda')).toBeVisible();
  const addServiceBtn = appointmentModal.getByRole('button', { name: 'Adicionar serviço', exact: true });
  await expect(addServiceBtn).toBeVisible();

  // Onboarding ainda não deve estar visível antes de tentar concluir
  await expect(appointmentModal.getByRole('heading', { name: 'Cadastre seu primeiro serviço' })).toHaveCount(0);

  // 2. Clica no botão de confirmar agendamento sem nenhum serviço cadastrado
  const confirmBtn = appointmentModal.getByRole('button', { name: 'Confirmar Agendamento', exact: true });
  await confirmBtn.click();

  // 3. Verifica exibição do onboarding explicativo e profissional
  await expect(appointmentModal.getByRole('heading', { name: 'Cadastre seu primeiro serviço' })).toBeVisible();
  await expect(appointmentModal.getByText('Para concluir o agendamento, primeiro cadastre um serviço. Isso ajuda a organizar duração, valor e relatórios dos atendimentos.')).toBeVisible();

  // 4. Clica no botão de adicionar serviço do onboarding
  const onboardingAddBtn = appointmentModal.getByRole('heading', { name: 'Cadastre seu primeiro serviço' }).locator('xpath=..').getByRole('button', { name: 'Adicionar serviço' });
  await onboardingAddBtn.click();

  // 5. Verifica abertura do modal de cadastro de serviço
  await expect(page.getByRole('heading', { name: 'Novo Serviço', exact: true })).toBeVisible();

  // Preenche dados do novo serviço
  await page.getByPlaceholder('Ex: Consulta Inicial, Sessão de Fisioterapia...').fill('Consulta Avaliação Inicial');
  await page.getByRole('button', { name: 'Salvar Serviço', exact: true }).click();

  // 6. Após salvar, o modal de serviço fecha e o serviço é selecionado automaticamente no agendamento
  await expect(page.getByRole('heading', { name: 'Novo Serviço', exact: true })).toHaveCount(0);
  await expect(appointmentModal.getByRole('button', { name: 'Consulta Avaliação Inicial' })).toBeVisible();

  // Estado vazio e onboarding devem ter desaparecido imediatamente
  await expect(appointmentModal.getByText('Nenhum serviço cadastrado ainda')).toHaveCount(0);
  await expect(appointmentModal.getByRole('heading', { name: 'Cadastre seu primeiro serviço' })).toHaveCount(0);
});

test('Novo Agendamento: conta com serviços existentes preserva dropdown normal sem onboarding', async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/agenda');

  // Abre o modal de Novo Agendamento (sem interceptar /v1/services)
  await page.getByRole('button', { name: 'Agendar', exact: true }).click();
  const appointmentModal = page.getByRole('heading', { name: 'Novo Agendamento', exact: true }).locator('xpath=../../..');
  await expect(appointmentModal).toBeVisible();

  // Não deve exibir o estado vazio nem onboarding
  await expect(appointmentModal.getByText('Nenhum serviço cadastrado ainda')).toHaveCount(0);
  await expect(appointmentModal.getByRole('heading', { name: 'Cadastre seu primeiro serviço' })).toHaveCount(0);
});
