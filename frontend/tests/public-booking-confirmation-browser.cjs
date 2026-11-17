const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-booking-confirm-ui-'));

const fixtureTsx = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicBookingView } from '../src/components/public-booking/PublicBookingView';
import { NotificationBell } from '../src/components/common/NotificationBell';

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'clinic';

(window as any).__bellState = (window as any).__bellState || {
  notifications: [
    {
      id: 'intn-clinic-1',
      tenantId: 't-1',
      recipientUserId: 'u-1',
      category: 'public_booking',
      establishmentMode: 'clinic',
      requestId: 'pbr-c1',
      requestStatus: 'awaiting_confirmation',
      confirmed: false,
      confirmedAt: null,
      confirmedByUserId: null,
      expiresAt: null,
      whatsappPhone: '+5511991112222',
      establishmentName: 'Clínica Vida',
      modality: 'presential',
      planDurationLabel: null,
      weeklyFrequency: null,
      title: 'Nova solicitação de agendamento',
      summary: 'Maria Paciente solicitou Consulta Psicológica (Presencial) — 20/05/2026 às 09h às 09h50',
      studentOrPatientName: 'Maria Paciente',
      serviceOrClassName: 'Consulta Psicológica',
      weekdaysLabel: 'quarta-feira',
      timeRangeLabel: '09h às 09h50',
      startDateLabel: '20/05/2026',
      startDateIso: '2026-05-20T09:00:00',
      professionalNames: 'Dr. Marcos',
      classGroupLabel: null,
      sessionsCount: 1,
      appointmentId: null,
      occurrenceId: null,
      seriesId: null,
      packageContractId: null,
      readAt: null,
      createdAt: '2026-05-15T12:00:00.000Z',
      createdAtLabel: '15/05/2026 às 09:00'
    },
    {
      id: 'intn-studio-1',
      tenantId: 't-1',
      recipientUserId: 'u-1',
      category: 'public_booking',
      establishmentMode: 'studio',
      requestId: 'pbr-s1',
      requestStatus: 'awaiting_confirmation',
      confirmed: false,
      confirmedAt: null,
      confirmedByUserId: null,
      expiresAt: null,
      whatsappPhone: '11988887777',
      establishmentName: 'Studio Movimento',
      modality: 'online',
      planDurationLabel: 'Mensal (1 mês)',
      weeklyFrequency: 2,
      title: 'Nova solicitação de agendamento',
      summary: 'Ana Aluna solicitou Pilates Turma (2x/semana • Mensal (1 mês))',
      studentOrPatientName: 'Ana Aluna',
      serviceOrClassName: 'Pilates Turma',
      weekdaysLabel: 'segunda e quarta-feira',
      timeRangeLabel: '08h às 08h50',
      startDateLabel: '25/05/2026',
      startDateIso: '2026-05-25T08:00:00',
      professionalNames: 'Prof. Carla',
      classGroupLabel: 'Turma • 8 aulas (Mensal (1 mês))',
      sessionsCount: 8,
      appointmentId: null,
      occurrenceId: null,
      seriesId: null,
      packageContractId: null,
      readAt: null,
      createdAt: '2026-05-15T12:05:00.000Z',
      createdAtLabel: '15/05/2026 às 09:05'
    }
  ],
  conflictOnFirstConfirm: false,
  navigatedTo: null
};

const origFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const st = (window as any).__bellState;

  if (url.includes('/v1/internal-notifications/unread-count')) {
    const active = st.notifications.filter((n: any) =>
      n.requestStatus === 'awaiting_confirmation' ||
      (n.requestStatus === 'confirmed' && n.expiresAt && Date.parse(n.expiresAt) > Date.now())
    );
    return new Response(JSON.stringify({
      unreadCount: active.filter((n: any) => !n.readAt).length,
      activeCount: active.length,
      pendingCount: active.filter((n: any) => n.requestStatus === 'awaiting_confirmation').length
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/v1/internal-notifications/mark-read')) {
    const body = JSON.parse(String(init?.body || '{}'));
    const ids: string[] = Array.isArray(body.notificationIds) ? body.notificationIds : [];
    for (const n of st.notifications) {
      if (body.markAll || ids.includes(n.id)) n.readAt = new Date().toISOString();
    }
    const active = st.notifications.filter((n: any) =>
      n.requestStatus === 'awaiting_confirmation' ||
      (n.requestStatus === 'confirmed' && n.expiresAt && Date.parse(n.expiresAt) > Date.now())
    );
    return new Response(JSON.stringify({
      updated: ids.length,
      unreadCount: active.filter((n: any) => !n.readAt).length,
      activeCount: active.length,
      pendingCount: active.filter((n: any) => n.requestStatus === 'awaiting_confirmation').length
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const confirmMatch = url.match(/\\/v1\\/internal-notifications\\/([^/]+)\\/confirm/);
  if (confirmMatch) {
    const targetId = decodeURIComponent(confirmMatch[1]);
    if (st.conflictOnFirstConfirm) {
      st.conflictOnFirstConfirm = false;
      return new Response(JSON.stringify({
        error: 'Este horário já foi ocupado na agenda definitiva.',
        code: 'PROFESSIONAL_SLOT_OCCUPIED'
      }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    const item = st.notifications.find((n: any) => n.id === targetId);
    const nowIso = new Date().toISOString();
    const expIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    item.requestStatus = 'confirmed';
    item.confirmed = true;
    item.confirmedAt = nowIso;
    item.expiresAt = expIso;
    item.appointmentId = targetId === 'intn-studio-1' ? 'apt-st-1' : 'apt-cl-1';
    const active = st.notifications.filter((n: any) =>
      n.requestStatus === 'awaiting_confirmation' ||
      (n.requestStatus === 'confirmed' && n.expiresAt && Date.parse(n.expiresAt) > Date.now())
    );
    return new Response(JSON.stringify({
      success: true,
      notification: item,
      appointmentId: item.appointmentId,
      unreadCount: active.filter((n: any) => !n.readAt).length,
      activeCount: active.length,
      pendingCount: active.filter((n: any) => n.requestStatus === 'awaiting_confirmation').length
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/v1/internal-notifications')) {
    const active = st.notifications.filter((n: any) =>
      n.requestStatus === 'awaiting_confirmation' ||
      (n.requestStatus === 'confirmed' && n.expiresAt && Date.parse(n.expiresAt) > Date.now())
    );
    return new Response(JSON.stringify({
      notifications: active,
      unreadCount: active.filter((n: any) => !n.readAt).length,
      activeCount: active.length,
      pendingCount: active.filter((n: any) => n.requestStatus === 'awaiting_confirmation').length
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/v1/public/tenants/')) {
    const isStudio = mode === 'studio';
    return new Response(JSON.stringify({
      tenant: {
        slug: isStudio ? 'studio-movimento' : 'clinica-vida',
        name: isStudio ? 'Studio Movimento' : 'Clínica Vida',
        trade_name: isStudio ? 'Studio Movimento' : 'Clínica Vida',
        establishment_profile: isStudio ? 'studio' : 'clinic',
        public_booking_enabled: 1
      },
      professionals: [
        {
          id: 'p-1',
          name: isStudio ? 'Prof. Carla' : 'Dr. Marcos',
          specialty_name: isStudio ? 'Pilates' : 'Psicologia',
          profession_name: isStudio ? 'Educação Física' : 'Psicologia',
          slug: 'p-1'
        }
      ],
      services: [
        {
          id: 's-1',
          name: isStudio ? 'Pilates Studio' : 'Consulta Clínica',
          duration_minutes: 50,
          modality: 'both',
          service_domain: isStudio ? 'studio' : 'clinic',
          service_kind: 'individual',
          billing_mode: isStudio ? 'monthly' : 'per_session',
          linked_professionals: [{ id: 'p-1', name: isStudio ? 'Prof. Carla' : 'Dr. Marcos' }],
          allow_recurrence: isStudio ? 1 : 0,
          allowed_recurrence_frequencies: isStudio ? ['weekly'] : [],
          allowed_plan_durations: isStudio ? ['1_month'] : []
        }
      ],
      packages: []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/v1/public/slots/available') || url.includes('/v1/public/studio/slots')) {
    const slotObj = {
      time: '09:00',
      date: '2027-01-06',
      startTime: '2027-01-06T09:00:00',
      endTime: '2027-01-06T09:50:00',
      professionalId: 'p-1',
      professionalName: mode === 'studio' ? 'Prof. Carla' : 'Dr. Marcos',
      modality: 'presential',
      allowedModalities: ['presential', 'online'],
      durationMinutes: 50,
      remainingSpots: 1,
      available: true
    };
    return new Response(JSON.stringify({
      slots: [slotObj],
      upcomingSlots: [slotObj],
      linkedProfessionals: [{ id: 'p-1', name: mode === 'studio' ? 'Prof. Carla' : 'Dr. Marcos' }],
      allowedModalities: ['presential', 'online']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/v1/public/studio/bookings')) {
    return new Response(JSON.stringify({
      mode: 'service',
      requestId: 'pbr-ui-s1',
      requestNumber: 'SOL-2026-0099',
      status: 'awaiting_confirmation',
      requiresConfirmation: true,
      paymentPending: false,
      appointments: [
        {
          id: 'req-slot-1',
          status: 'awaiting_confirmation',
          serviceId: 's-1',
          serviceName: 'Pilates Studio',
          professionalId: 'p-1',
          professionalName: 'Prof. Carla',
          modality: 'presential',
          startTime: '2026-06-10T09:00:00',
          endTime: '2026-06-10T09:50:00'
        }
      ],
      requestedSummary: {
        serviceName: 'Pilates Studio',
        professionalNames: 'Prof. Carla',
        weekdaysLabel: 'quarta-feira',
        timeRangeLabel: '09h às 09h50',
        weeklyFrequency: 1,
        planDurationLabel: 'Mensal (1 mês)',
        modality: 'presential',
        sessionsCount: 4
      }
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }

  if (url.includes('/v1/public/appointments')) {
    return new Response(JSON.stringify({
      id: 'pbr-ui-c1',
      requestId: 'pbr-ui-c1',
      requestNumber: 'SOL-2026-0088',
      status: 'awaiting_confirmation',
      requiresConfirmation: true,
      startTime: '2026-06-10T09:00:00',
      endTime: '2026-06-10T09:50:00',
      modality: 'presential'
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }

  return origFetch(input, init);
};

function App() {
  const [nav, setNav] = useState<string>('dashboard');
  if (mode === 'bell') {
    return (
      <div className="p-4 min-h-screen bg-slate-50 flex justify-between items-start">
        <div data-testid="nav-state">{nav}</div>
        <NotificationBell onNavigate={(v) => { (window as any).__bellState.navigatedTo = v; setNav(v); }} />
      </div>
    );
  }
  return <PublicBookingView tenantSlug={mode === 'studio' ? 'studio-movimento' : 'clinica-vida'} bookingSequence={1} />;
}

createRoot(document.getElementById('root')!).render(<App />);
`;

(async () => {
  await build({
    stdin: { contents: fixtureTsx, resolveDir: __dirname, loader: 'tsx' },
    bundle: true,
    outfile: path.join(out, 'test.js'),
    jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
    plugins: [
      {
        name: 'auth-stub',
        setup(b) {
          b.onLoad({ filter: /AuthContext\.tsx$/ }, () => ({
            contents: `const q = new URLSearchParams(location.search); const role = q.get('role') || 'admin'; export const useAuth = () => ({ currentUser: { id: 'u-1', name: 'Gestor' }, currentTenant: { id: 't-1', name: 'Clínica Vida', trade_name: 'Clínica Vida', establishment_profile: 'mixed' }, isClinicAdmin: role === 'admin', isProfessional: role === 'professional', isReceptionist: role === 'receptionist', isSuperAdmin: false, isSandboxSession: false });`,
            loader: 'tsx'
          }));
        }
      }
    ]
  });

  const assets = path.join(root, 'dist/assets');
  const css = fs.readdirSync(assets).find(f => /^index-.*\.css$/.test(f));
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(assets, css), 'utf8')}</style><div id="root"></div><script>${fs.readFileSync(path.join(out, 'test.js'), 'utf8')}</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.setDefaultTimeout(10000);

      // 1. Studio 6th screen: "Solicitação recebida!", "Aguardando confirmação", NO payment pending banner, NO .ics while pending
      await page.goto(`${base}?mode=studio`);
      await page.getByRole('button', { name: /^Agendar uma aula/ }).click();
      await page.getByRole('button', { name: /Pilates Studio/ }).click();
      const singleBtn = page.getByRole('button', { name: /Aula avulsa/ });
      await singleBtn.waitFor();
      await singleBtn.click();
      await page.getByRole('button', { name: /09:00/ }).first().click();
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      await page.getByRole('button', { name: /Informar meus dados/ }).click();
      await page.getByPlaceholder('Digite seu nome completo').fill('Ana Studio');
      await page.getByPlaceholder('(11) 99999-9999').fill('11988887777');
      await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
      await page.getByRole('heading', { name: 'Solicitação recebida!', exact: true }).waitFor();
      assert.equal(await page.getByRole('status').textContent(), 'Aguardando confirmação');
      assert.equal(await page.getByText(/Status financeiro: Pagamento pendente/i).count(), 0);
      assert.equal(await page.getByRole('button', { name: /Adicionar ao calendário/i }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

      // 2. NotificationBell flow: pending -> open & mark read still keeps pending -> conflict -> confirm -> Ver na agenda + WhatsApp -> expiry
      await page.goto(`${base}?mode=bell&role=receptionist`);
      assert.equal(await page.getByTestId('navbar-notifications-bell').count(), 0, 'Receptionist sees no bell');

      await page.goto(`${base}?mode=bell&role=admin`);
      await page.getByTestId('navbar-notifications-bell').waitFor();
      await page.getByTestId('navbar-notifications-bell').click();
      await page.getByTestId('navbar-notifications-panel').waitFor();

      // Pending state checks
      assert.equal(await page.getByTestId('notification-status-intn-clinic-1').textContent(), 'Aguardando confirmação');
      assert.equal(await page.getByTestId('notification-confirm-intn-clinic-1').count(), 1);
      assert.equal(await page.getByTestId('notification-calendar-intn-clinic-1').count(), 0);
      assert.equal(await page.getByTestId('notification-whatsapp-intn-clinic-1').count(), 0);

      // Closing & reopening preserves pending items even after mark-read
      await page.keyboard.press('Escape');
      await page.getByTestId('navbar-notifications-panel').waitFor({ state: 'hidden' });
      assert.equal(await page.getByTestId('navbar-notifications-bell').count(), 1, 'Bell stays visible while awaiting confirmation');
      await page.getByTestId('navbar-notifications-bell').click();
      await page.getByTestId('notification-confirm-intn-clinic-1').waitFor();

      // Test conflict feedback inline without removing item
      await page.evaluate(() => { window.__bellState.conflictOnFirstConfirm = true; });
      await page.getByTestId('notification-confirm-intn-clinic-1').click();
      await page.getByTestId('notification-error-intn-clinic-1').waitFor();
      assert.equal(await page.getByTestId('notification-status-intn-clinic-1').textContent(), 'Aguardando confirmação');

      // Now confirm Clinic + Studio items
      await page.getByTestId('notification-confirm-intn-clinic-1').click();
      await page.getByTestId('notification-calendar-intn-clinic-1').waitFor();
      assert.equal(await page.getByTestId('notification-status-intn-clinic-1').textContent(), 'Confirmado');
      assert.equal(await page.getByTestId('notification-confirm-intn-clinic-1').count(), 0);
      const clinicWaHref = await page.getByTestId('notification-whatsapp-intn-clinic-1').getAttribute('href');
      assert.ok(clinicWaHref && clinicWaHref.startsWith('https://wa.me/5511991112222?text='));
      assert.ok(decodeURIComponent(clinicWaHref).includes('Sua solicitação de atendimento (Consulta Psicológica) na Clínica Vida'));

      await page.getByTestId('notification-confirm-intn-studio-1').click();
      await page.getByTestId('notification-calendar-intn-studio-1').waitFor();
      const studioWaHref = await page.getByTestId('notification-whatsapp-intn-studio-1').getAttribute('href');
      assert.ok(studioWaHref && studioWaHref.startsWith('https://wa.me/5511988887777?text='));
      assert.ok(decodeURIComponent(studioWaHref).includes('Pilates Turma'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

      // Ver na agenda navigates & stores session focus date
      await page.getByTestId('notification-calendar-intn-studio-1').click();
      assert.equal(await page.getByTestId('nav-state').textContent(), 'calendar');
      const storedFocus = await page.evaluate(() => JSON.parse(sessionStorage.getItem('zemda_focus_appointment') || '{}'));
      assert.equal(storedFocus.appointmentId, 'apt-st-1');
      assert.equal(storedFocus.startTime, '2026-05-25T08:00:00');

      await page.close();
      console.log(`PASS ${width}px: Studio 6a tela limpa, NotificationBell pendente->conflito->confirmado->WhatsApp+Agenda, permissão e zero overflow`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS browser suite zero console/page errors.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
