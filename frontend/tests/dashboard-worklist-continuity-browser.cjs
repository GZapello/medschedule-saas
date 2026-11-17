const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-worklist-ui-'));

const fixtureTsx = `
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TodayWorklist } from '../src/components/dashboard/TodayWorklist';
import { DashboardView } from '../src/components/dashboard/DashboardView';

const state: any = (window as any).__wlTestState = {
  metricsCalls: 0,
  navigations: [],
  patientClicks: [],
  continuedItems: [],
  resumedItems: [],
  statusMutationCalls: 0,
  appointmentCreationCalls: 0,
  worklist: {
    unfinished: [
      {
        id: 'apt-stu-1',
        patient_id: 'pat-stu-1',
        patient_name: 'Aluna Beatriz Moura',
        professional_id: 'pro-stu-1',
        professional_name: 'Instrutor Rodrigo Lima',
        service_id: 'srv-stu-1',
        service_name: 'Pilates Studio Coletivo',
        service_kind: 'group',
        service_domain: 'studio',
        occurrence_id: 'occ-1',
        clinical_module: 'ZemdaPersonal',
        resolved_module: 'ZemdaPersonal',
        module_label: 'ZemdaPersonal',
        is_studio_session: true,
        status: 'in_progress',
        status_label: 'Em andamento',
        start_time: '2026-11-17T14:00:00',
        attendance_start_at: '2026-11-17T14:05:00',
        reference_at: '2026-11-17T17:05:00.000Z',
        elapsed_minutes: 35,
        elapsed_label: 'há 35 min'
      },
      {
        id: 'apt-clin-1',
        patient_id: 'pat-clin-1',
        patient_name: 'Paciente Carlos Eduardo',
        professional_id: 'pro-fisio-1',
        professional_name: 'Dra. Sofia Fisio',
        service_id: 'srv-fisio-1',
        service_name: 'Sessão de Fisioterapia',
        service_kind: 'individual',
        service_domain: 'clinical',
        clinical_module: 'ZemdaFisio',
        resolved_module: 'ZemdaFisio',
        module_label: 'ZemdaFisio',
        is_studio_session: false,
        status: 'in_progress',
        status_label: 'Em andamento',
        start_time: '2026-11-17T15:00:00',
        attendance_start_at: '2026-11-17T15:02:00',
        reference_at: '2026-11-17T18:02:00.000Z',
        elapsed_minutes: 135,
        elapsed_label: 'há 2h 15min'
      }
    ],
    drafts: [
      {
        id: 'drf-psico-1',
        patient_id: 'pat-psico-1',
        patient_name: 'Paciente Fernanda Dias',
        appointment_id: null,
        module_type: 'ZemdaPsico',
        resolved_module: 'ZemdaPsico',
        module_label: 'ZemdaPsico',
        service_name: 'Psicoterapia Individual',
        professional_name: 'Dr. Bruno Psico',
        is_studio_session: false,
        status_label: 'Rascunho',
        updated_at: '2026-11-17 16:30:00',
        reference_at: '2026-11-17T16:30:00.000Z',
        elapsed_minutes: 290,
        elapsed_label: 'há 4h 50min'
      }
    ],
    exams: [],
    examCount: 0,
    returns: [],
    alerts: [],
    serviceReminders: [],
    serviceRemindersCount: 0
  }
};

const origFetch = window.fetch.bind(window);
window.fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : String(input?.url || '');
  const method = String(init?.method || 'GET').toUpperCase();

  if (method === 'PUT' && url.includes('/status')) {
    state.statusMutationCalls += 1;
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (method === 'POST' && url.includes('/v1/appointments') && !url.includes('/finish')) {
    state.appointmentCreationCalls += 1;
    return new Response(JSON.stringify({ id: 'unexpected' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/v1/dashboard/metrics')) {
    state.metricsCalls += 1;
    return new Response(JSON.stringify({
      permissions: { finance: false },
      checkin: { hasReceptionTeam: false, clinicCheckinEnabled: true },
      worklist: state.worklist,
      today: { date: '2026-11-17', total: state.worklist.unfinished.length, appointments: state.worklist.unfinished },
      monthly: { totalAppointments: 2, completed: 0, noShow: 0, cancelled: 0, newPatients: 0, occupancyRate: 10 },
      totals: { active_professionals: 2, active_services: 3, active_rooms: 1 },
      chart: []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/v1/appointments/apt-clin-1/completion')) {
    return new Response(JSON.stringify({ alreadyCompleted: false, awaitingPayment: false, moduleType: 'ZemdaFisio' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url.includes('/v1/appointments/apt-clin-1')) {
    return new Response(JSON.stringify({
      appointment: {
        ...state.worklist.unfinished[1],
        patient_phone: '11999990000'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/v1/clinical/draft/')) {
    return new Response(JSON.stringify({ draft: { id: 'drf-1', draftData: { subjective: 'Texto preservado' } } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url.includes('/v1/physiotherapy/')) {
    return new Response(JSON.stringify({ assessments: [], evolutions: [], patient: { id: 'pat-clin-1', full_name: 'Paciente Carlos Eduardo' }, profile: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (url.includes('/v1/patients/') || url.includes('/v1/clinic/settings') || url.includes('/v1/checkin') || url.includes('/v1/auth/')) {
    return new Response(JSON.stringify({ id: 'pat-clin-1', full_name: 'Paciente Carlos Eduardo', patients: [], appointments: [], waitingCount: 0, waitingPatients: [], previousAlerts: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function Harness() {
  const q = new URLSearchParams(location.search);
  const mode = q.get('mode') || 'worklist';
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick(t => t + 1);
    window.addEventListener('zemda-appointment-updated', refresh);
    window.addEventListener('zemda-draft-updated', refresh);
    return () => {
      window.removeEventListener('zemda-appointment-updated', refresh);
      window.removeEventListener('zemda-draft-updated', refresh);
    };
  }, []);

  if (mode === 'dashboard') {
    return (
      <div className="p-4 bg-slate-50 min-h-screen" data-tick={tick}>
        <DashboardView
          onNavigate={(view, subId) => state.navigations.push({ view, subId: subId || null })}
          onOpenNewAppointment={() => {}}
          onOpenNewPatient={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-50 min-h-screen" data-tick={tick}>
      <TodayWorklist
        data={{ ...state.worklist }}
        onNavigate={(view, subId) => state.navigations.push({ view, subId: subId || null })}
        onPatient={(id) => state.patientClicks.push(id)}
        onContinueAttendance={(item) => state.continuedItems.push(item)}
        onResumeDraft={(item) => state.resumedItems.push(item)}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
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
        name: 'stubs',
        setup(b) {
          b.onLoad({ filter: /AuthContext\.tsx$/ }, () => ({
            contents: `
              const q = new URLSearchParams(location.search);
              const rec = q.get('role') === 'receptionist';
              export const useAuth = () => ({
                currentUser: { id: 'u-1', name: 'Profissional Teste', role: rec ? 'receptionist' : 'professional' },
                currentTenant: { id: 't-1', name: 'Espaço Misto', establishment_profile: 'mixed' },
                isClinicAdmin: false,
                isProfessional: !rec,
                isReceptionist: rec,
                isZemdaFisio: true,
                isPhysiotherapist: true,
                clientTermLabel: 'Paciente',
                hasCapability: () => true,
                hasPermission: () => true
              });
            `,
            loader: 'tsx'
          }));
          b.onLoad({ filter: /ToastContext\.tsx$/ }, () => ({
            contents: `export const useToast = () => ({ showToast: () => {} });`,
            loader: 'tsx'
          }));
          b.onLoad({ filter: /useGoogleCalendarStatus\.ts$/ }, () => ({
            contents: `export const useGoogleCalendarStatus = () => ({ connected: false, loading: false, connecting: false, connectGoogleCalendar: async () => {} });`,
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
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.setDefaultTimeout(10000);

      // 1. Standalone TodayWorklist checks: metadata, priority order, compact responsive cards, action callbacks
      await page.goto(`${base}?mode=worklist&w=${width}`);
      const cardSection = page.getByTestId('worklist-attendances-drafts');
      await cardSection.waitFor();

      const text = await cardSection.textContent();
      assert.ok(text.includes('Atendimentos e rascunhos'));
      assert.ok(text.includes('Aluna Beatriz Moura'));
      assert.ok(text.includes('Pilates Studio Coletivo'));
      assert.ok(text.includes('Instrutor Rodrigo Lima'));
      assert.ok(text.includes('ZemdaPersonal'));
      assert.ok(text.includes('Turma Coletiva'));
      assert.ok(text.includes('há 35 min'));

      assert.ok(text.includes('Paciente Carlos Eduardo'));
      assert.ok(text.includes('Sessão de Fisioterapia'));
      assert.ok(text.includes('Dra. Sofia Fisio'));
      assert.ok(text.includes('ZemdaFisio'));
      assert.ok(text.includes('há 2h 15min'));

      assert.ok(text.includes('Paciente Fernanda Dias'));
      assert.ok(text.includes('Psicoterapia Individual'));
      assert.ok(text.includes('Dr. Bruno Psico'));
      assert.ok(text.includes('ZemdaPsico'));
      assert.ok(text.includes('Rascunho'));
      assert.ok(text.includes('há 4h 50min'));

      // Em andamento cards appear BEFORE Rascunho cards
      const attPos = text.indexOf('Paciente Carlos Eduardo');
      const drfPos = text.indexOf('Paciente Fernanda Dias');
      assert.ok(attPos > -1 && drfPos > attPos, 'Em andamento prioritized before Rascunho');

      // Responsive layout check
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No horizontal overflow at ${width}px`);

      // Click Continuar atendimento & Retomar rascunho
      await page.getByTestId('worklist-continue-apt-stu-1').click();
      await page.getByTestId('worklist-resume-drf-psico-1').click();
      const callbacks = await page.evaluate(() => ({
        continued: window.__wlTestState.continuedItems.map(i => i.id),
        resumed: window.__wlTestState.resumedItems.map(i => i.id)
      }));
      assert.deepEqual(callbacks.continued, ['apt-stu-1']);
      assert.deepEqual(callbacks.resumed, ['drf-psico-1']);

      // Reactive removal -> when empty, component hides completely!
      await page.evaluate(() => {
        window.__wlTestState.worklist.unfinished = [];
        window.__wlTestState.worklist.drafts = [];
        window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
      });
      await cardSection.waitFor({ state: 'hidden' });

      // 2. Receptionist cannot trigger Continuar atendimento or Retomar rascunho
      await page.goto(`${base}?mode=worklist&role=receptionist&w=${width}`);
      await page.getByTestId('worklist-attendances-drafts').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Continuar atendimento' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Retomar rascunho' }).count(), 0);

      // 3. Full DashboardView integration: Studio continue redirects to zemda-personal with active session & zero /status or POST /appointments duplication,
      //    and Clinical draft/attendance updates reactively on status change without reload!
      await page.goto(`${base}?mode=dashboard&w=${width}`);
      await page.getByTestId('worklist-continue-apt-stu-1').waitFor();
      await page.getByTestId('worklist-continue-apt-stu-1').click();
      const stuRedirectCheck = await page.evaluate(() => ({
        nav: window.__wlTestState.navigations,
        studioRaw: sessionStorage.getItem('zemda_active_studio_session'),
        statusCalls: window.__wlTestState.statusMutationCalls,
        postCalls: window.__wlTestState.appointmentCreationCalls
      }));
      assert.equal(stuRedirectCheck.nav[0]?.view, 'zemda-personal');
      assert.ok(JSON.parse(stuRedirectCheck.studioRaw).appointmentId === 'apt-stu-1');
      assert.equal(stuRedirectCheck.statusCalls, 0, 'Continuing attendance MUST NOT call PUT /status or duplicate');
      assert.equal(stuRedirectCheck.postCalls, 0, 'Continuing attendance MUST NOT POST duplicate appointment');

      await page.getByTestId('worklist-resume-drf-psico-1').click();
      const drfNav = await page.evaluate(() => window.__wlTestState.navigations);
      assert.deepEqual(drfNav[1], { view: 'zemda-psico', subId: 'pat-psico-1' });

      // Simulate completion event in DashboardView -> auto-fetches metrics & removes item without page reload
      const callsBefore = await page.evaluate(() => window.__wlTestState.metricsCalls);
      await page.evaluate(() => {
        window.__wlTestState.worklist.unfinished = [];
        window.__wlTestState.worklist.drafts = [];
        window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
      });
      await page.getByTestId('worklist-attendances-drafts').waitFor({ state: 'hidden' });
      const callsAfter = await page.evaluate(() => window.__wlTestState.metricsCalls);
      assert.ok(callsAfter > callsBefore, 'DashboardView automatically refreshes metrics without manual reload');

      await page.close();
      console.log(`PASS ${width}px: Atendimentos e rascunhos UI, prioridade, metadados, Studio/Clínico, remoção reativa e permissões`);
    }

    assert.deepEqual(errors, []);
    console.log('PASS dashboard worklist continuity browser suite zero errors.');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
