import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { Share2, AlertTriangle, CheckCircle2, ShieldOff, Building } from 'lucide-react';

export function PatientShareManagement() {
  const [shares, setShares] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = () => ApiClient.get<any[]>('/v1/patient-sharing').then(setShares).catch(e => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  if (!shares.length && !error) return null;

  return (
    <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100 shrink-0">
          <Share2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 text-sm sm:text-base">
            Compartilhamento de Pacientes com Outras Clínicas
          </h3>
          <p className="text-xs text-slate-500">
            Pacientes desta clínica disponibilizados a profissionais com múltiplos vínculos. Registros clínicos e identificação são preservados na revogação.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {shares.map(s => {
          const isActive = s.status === 'ACTIVE';
          return (
            <div key={s.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold text-slate-800 text-sm">{s.target_name}</span>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {isActive ? 'Ativo' : 'Revogado'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {s.patient_count} {s.patient_count === 1 ? 'paciente autorizado' : 'pacientes autorizados'} • Criado em{' '}
                  {new Date(s.created_at).toLocaleDateString('pt-BR')}
                  {s.revoked_at && ` • Revogado em ${new Date(s.revoked_at).toLocaleDateString('pt-BR')}`}
                </p>
              </div>

              {isActive && (
                confirm === s.id ? (
                  <div className="flex items-center gap-2 bg-rose-50/80 p-2.5 rounded-xl border border-rose-200 text-xs">
                    <span className="text-rose-800 font-medium">Confirmar encerramento do compartilhamento?</span>
                    <button
                      disabled={revoking}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                      onClick={async () => {
                        setRevoking(true);
                        try {
                          await ApiClient.post('/v1/patient-sharing/' + s.id + '/revoke', {});
                          setConfirm(null);
                          await load();
                        } catch (e: any) {
                          setError(e.message || 'Falha ao revogar compartilhamento.');
                        } finally {
                          setRevoking(false);
                        }
                      }}
                    >
                      {revoking ? 'Revogando...' : 'Confirmar'}
                    </button>
                    <button
                      disabled={revoking}
                      className="px-2.5 py-1.5 text-slate-600 hover:text-slate-800 font-medium"
                      onClick={() => setConfirm(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors cursor-pointer self-start sm:self-center"
                    onClick={() => setConfirm(s.id)}
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    <span>Revogar compartilhamento</span>
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
