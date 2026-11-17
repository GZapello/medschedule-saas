import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiClient } from '../src/api/client';
import { ToastProvider } from '../src/context/ToastContext';
import { FinancialView } from '../src/components/financial/FinancialView';
import { ServiceRecurrenceConfigPanel } from '../src/components/services/ServiceRecurrenceConfigPanel';

// Mock global AuthContext module behavior via esbuild alias or direct harness?
// Notice FinancialView imports useAuth from ../../context/AuthContext; we can override via window mock if needed,
// OR render AuthContext.Provider directly with a seeded localStorage user & token!
// Even cleaner: import AuthProvider and mock ApiClient!
import { AuthProvider } from '../src/context/AuthContext';

declare global {
  interface Window {
    __postedConsumption?: any;
    __setScenario?: (scenario: 'studio_admin' | 'studio_staff_only' | 'clinic_admin') => void;
  }
}

let currentScenario: 'studio_admin' | 'studio_staff_only' | 'clinic_admin' = 'studio_admin';
let consumptionsDb: any[] = [
  {
    id: 'cons-1',
    patient_id: 'pat-1',
    patient_name: 'Aluno João Silva',
    product_name_snapshot: 'Barrinha de Proteína',
    sale_unit_snapshot: 'un',
    quantity: 1,
    unit_price_cents: 800,
    total_amount_cents: 800,
    paid_amount_cents: 0,
    payment_status: 'pending',
    created_by_name: 'Gestor',
    created_at: '2026-11-17T10:00:00Z'
  }
];

function applyAuthStorage(scenario: 'studio_admin' | 'studio_staff_only' | 'clinic_admin') {
  currentScenario = scenario;
  const user =
    scenario === 'studio_staff_only'
      ? {
          id: 'u-staff',
          userId: 'u-staff',
          name: 'Instrutor Consumo',
          email: 'staff@studio.test',
          role: 'professional',
          permissions: ['create_student_consumption']
        }
      : {
          id: 'u-adm',
          userId: 'u-adm',
          name: 'Gestor',
          email: 'adm@studio.test',
          role: 'clinic_admin',
          permissions: []
        };
  const tenant =
    scenario === 'clinic_admin'
      ? {
          id: 't-clinic',
          name: 'Clínica Padrão',
          establishment_profile: 'clinic'
        }
      : {
          id: 't-studio',
          name: 'Studio Zen',
          establishment_profile: 'studio'
        };
  localStorage.setItem('auth_token', 'mock-jwt-token');
  localStorage.setItem('active_tenant_id', tenant.id);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('tenant', JSON.stringify(tenant));
}

applyAuthStorage('studio_admin');

ApiClient.get = async (path: string): Promise<any> => {
  if (path.startsWith('/v1/auth/me')) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const tenant = JSON.parse(localStorage.getItem('tenant') || '{}');
    return {
      user: {
        ...user,
        permissions_json: JSON.stringify(user.permissions || [])
      },
      tenant,
      tenants: [tenant]
    };
  }
  if (path.startsWith('/v1/tenants/current')) {
    return JSON.parse(localStorage.getItem('tenant') || '{}');
  }
  if (path.startsWith('/v1/studio/consumptions/sellable-products')) {
    return {
      products: [
        { id: 'inv-water', name: 'Água Mineral 500ml', quantity: 20, unit: 'un', sale_unit: 'garrafa', sale_price: 5 },
        { id: 'inv-bar', name: 'Barrinha de Proteína', quantity: 10, unit: 'un', sale_unit: 'un', sale_price: 8 }
      ]
    };
  }
  if (path.startsWith('/v1/studio/consumptions/student/')) {
    return {
      pendingProductsCents: 800,
      pendingTuitionsCents: 18000,
      consolidatedPendingCents: 18800,
      consumptions: consumptionsDb
    };
  }
  if (path.startsWith('/v1/studio/consumptions')) {
    return {
      consumptions: consumptionsDb,
      summary: {
        totalPendingCents: consumptionsDb.filter(c => c.payment_status === 'pending').reduce((s, c) => s + c.total_amount_cents, 0),
        totalPaidCents: consumptionsDb.filter(c => c.payment_status === 'paid').reduce((s, c) => s + c.total_amount_cents, 0),
        totalCancelledCents: 0,
        countPending: consumptionsDb.filter(c => c.payment_status === 'pending').length,
        countPaid: consumptionsDb.filter(c => c.payment_status === 'paid').length,
        countTotal: consumptionsDb.length
      }
    };
  }
  if (path.startsWith('/v1/patients')) {
    return [{ id: 'pat-1', full_name: 'Aluno João Silva', phone: '11999887766' }];
  }
  if (path.startsWith('/v1/payments')) {
    return { payments: [], totalPaid: 0, totalPending: 0 };
  }
  if (path.startsWith('/v1/accounts-payable')) {
    return { payables: [], metrics: { totalPending: 0, totalOverdue: 0, totalPaidMonth: 0, totalRecords: 0 } };
  }
  if (path.startsWith('/v1/cash-register/current')) {
    return { openRegister: null };
  }
  if (path.startsWith('/v1/cash-register/history')) {
    return [];
  }
  return {};
};

ApiClient.post = async (path: string, body: any): Promise<any> => {
  if (path === '/v1/studio/consumptions') {
    window.__postedConsumption = body;
    const item = {
      id: 'cons-new-' + Date.now(),
      patient_id: body.patientId,
      patient_name: 'Aluno João Silva',
      product_name_snapshot: body.inventoryItemId === 'inv-water' ? 'Água Mineral 500ml' : 'Barrinha de Proteína',
      sale_unit_snapshot: body.inventoryItemId === 'inv-water' ? 'garrafa' : 'un',
      quantity: body.quantity,
      unit_price_cents: body.inventoryItemId === 'inv-water' ? 500 : 800,
      total_amount_cents: Math.round(body.quantity * (body.inventoryItemId === 'inv-water' ? 500 : 800)),
      paid_amount_cents: body.paymentStatus === 'paid' ? Math.round(body.quantity * (body.inventoryItemId === 'inv-water' ? 500 : 800)) : 0,
      payment_status: body.paymentStatus,
      payment_method: body.paymentMethod || null,
      created_by_name: 'Instrutor Consumo',
      created_at: '2026-11-17T11:00:00Z'
    };
    consumptionsDb = [item, ...consumptionsDb];
    return { success: true, consumption: item };
  }
  return { success: true };
};

function Harness() {
  const [kind, setKind] = useState<'group' | 'individual'>('group');
  const [recState, setRecState] = useState({
    allowRecurrence: true,
    allowedFrequencies: ['weekly'] as any[],
    allowedWeekdays: [1, 3, 5],
    defaultFrequency: 'weekly' as any,
    customIntervals: [] as any[],
    defaultCustomInterval: null as any,
    allowedPlanDurations: ['1_month', '3_months', '12_months'] as any[],
    defaultPlanDuration: '1_month' as any
  });
  const [scenarioTick, setScenarioTick] = useState(0);
  const [scenarioName, setScenarioName] = useState<'studio_admin' | 'studio_staff_only' | 'clinic_admin'>('studio_admin');

  window.__setScenario = sc => {
    applyAuthStorage(sc);
    setScenarioName(sc);
    setScenarioTick(t => t + 1);
  };

  return (
    <ToastProvider>
      <AuthProvider key={scenarioTick}>
        <div className="p-4 space-y-6 max-w-6xl mx-auto" data-scenario={scenarioName} data-scenario-tick={scenarioTick}>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setKind(prev => (prev === 'group' ? 'individual' : 'group'))}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold"
              >
                Alternar Tipo Aula ({kind})
              </button>
            </div>
            <ServiceRecurrenceConfigPanel
              allowRecurrence={recState.allowRecurrence}
              allowedFrequencies={recState.allowedFrequencies}
              allowedWeekdays={recState.allowedWeekdays}
              defaultFrequency={recState.defaultFrequency}
              customIntervals={recState.customIntervals}
              defaultCustomInterval={recState.defaultCustomInterval}
              allowedPlanDurations={recState.allowedPlanDurations}
              defaultPlanDuration={recState.defaultPlanDuration}
              serviceKind={kind}
              scheduledWeekdays={[1, 3, 5]}
              onChange={next => setRecState(next)}
            />
          </div>

          <FinancialView key={`fin-${scenarioTick}`} initialTab="transactions" />
        </div>
      </AuthProvider>
    </ToastProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
