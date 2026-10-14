import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { Building2, ShieldCheck, Users, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

type Patient = { id: string; full_name: string; birth_date: string; identifier_suffix: string };

export function InvitePatientSharing({
  targetId,
  targetName,
  onFinish
}: {
  targetId: string;
  targetName: string;
  onFinish: () => Promise<void>;
}) {
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [source, setSource] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [scopes, setScopes] = useState(['patient']);
  const [version, setVersion] = useState('');
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sharing, setSharing] = useState(false);
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [separate, setSeparate] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<any[]>([]);

  useEffect(() => {
    ApiClient.get<any>('/v1/patient-sharing/sources?targetTenantId=' + encodeURIComponent(targetId))
      .then(d => {
        const foundSources = d.sources || [];
        setSources(foundSources);
        setAvailableScopes(d.scopes || []);
        setVersion(d.consentVersion);
        if (foundSources.length === 0) {
          // Sem autoridade em outras clínicas para compartilhar: avança direto
          void onFinish();
          return;
        }
        if (foundSources.length === 1) setSource(foundSources[0].id);
      })
      .catch(e => setError(e.message))
      .finally(() => setBusy(false));
  }, [targetId]);

  useEffect(() => {
    setPatients([]);
    setSelected([]);
    setReview(false);
    setConfirmed(false);
    if (!source) return;
    let active = true;
    setBusy(true);
    ApiClient.get<Patient[]>('/v1/patient-sharing/sources/' + encodeURIComponent(source) + '/patients')
      .then(p => {
        if (active) setPatients(p);
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [source]);

  const visible = patients.filter(p =>
    (p.full_name + ' ' + (p.identifier_suffix || '')).toLowerCase().includes(search.toLowerCase())
  );

  const finish = async () => {
    setBusy(true);
    try {
      await onFinish();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await ApiClient.post<any>('/v1/patient-sharing', {
        sourceTenantId: source,
        targetTenantId: targetId,
        patientIds: selected,
        scopes,
        confirmed,
        consentVersion: version,
        keepSeparate: separate
      });
      if (result.duplicates) {
        setDuplicates(result.duplicates);
        setConfirmed(false);
        setBusy(false);
        return;
      }
      await onFinish();
    } catch (e: any) {
      setError(e.message || 'Falha ao compartilhar.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-teal-100/60 via-emerald-50/30 to-transparent blur-3xl -z-10 pointer-events-none" />

      <div className="w-full max-w-xl space-y-5">
        <div className="text-center space-y-2 select-none">
          <div className="flex items-center justify-center mb-1">
            <img src="/brand/zemda-logo.png" alt="Zemda" className="h-10 w-auto object-contain drop-shadow-xs" />
          </div>
          <p className="text-xs text-teal-700 font-bold uppercase tracking-widest">Saúde e Gestão em Harmonia</p>
        </div>

        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 space-y-5 text-left">
          <div className="flex items-center gap-3.5 pb-2 border-b border-slate-100">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100 shrink-0">
              <CheckCircle2 className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">Vínculo Confirmado</span>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Seu acesso à {targetName} está vinculado</h1>
            </div>
          </div>

          {error && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {!sharing ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Deseja vincular também pacientes e dados da sua clínica atual?
                </h2>
                <p className="text-xs text-slate-500">
                  O compartilhamento de pacientes é estritamente opcional. Você pode optar por manter seus atendimentos totalmente separados.
                </p>
              </div>

              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  className="w-full p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/80 text-left transition-all cursor-pointer disabled:opacity-50"
                  onClick={finish}
                >
                  <span className="font-bold text-slate-900 text-sm block">Somente meu acesso profissional</span>
                  <span className="block font-normal text-xs text-slate-500 mt-1">
                    Seus pacientes e dados clínicos anteriores continuarão restritos à sua clínica de origem.
                  </span>
                </button>

                {sources.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    className="w-full p-4 rounded-2xl border-2 border-teal-500 hover:border-teal-600 bg-teal-50/40 hover:bg-teal-50/70 text-left transition-all cursor-pointer disabled:opacity-50"
                    onClick={() => setSharing(true)}
                  >
                    <span className="font-bold text-teal-900 text-sm block flex items-center gap-2">
                      <Users className="w-4 h-4 text-teal-600" />
                      Vincular pacientes e dados
                    </span>
                    <span className="block font-normal text-xs text-teal-700 mt-1">
                      Selecione a clínica de origem, os pacientes e os escopos clínicos que deseja disponibilizar à {targetName}.
                    </span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!review ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Clínica de origem</label>
                    <select
                      className="w-full min-h-11 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 bg-white"
                      value={source}
                      onChange={e => setSource(e.target.value)}
                    >
                      <option value="">Selecione a clínica de origem</option>
                      {sources.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <h2 className="font-bold text-slate-900 text-sm">Vincular pacientes à {targetName}</h2>
                    <input
                      aria-label="Buscar pacientes"
                      className="w-full min-h-11 border border-slate-200 rounded-xl p-3 text-xs"
                      placeholder="Buscar por nome ou final do identificador"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || !patients.length}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        onClick={() => setSelected(patients.map(p => p.id))}
                      >
                        Todos os pacientes ({patients.length})
                      </button>
                      <button
                        type="button"
                        disabled={!selected.length}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
                        onClick={() => setSelected([])}
                      >
                        Remover seleção
                      </button>
                    </div>

                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl p-2">
                      {visible.length === 0 ? (
                        <p className="text-xs text-slate-400 p-3 text-center">Nenhum paciente encontrado.</p>
                      ) : (
                        visible.map(p => (
                          <label key={p.id} className="flex gap-3 items-center min-h-12 py-2 px-1 hover:bg-slate-50 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 accent-teal-600 rounded"
                              checked={selected.includes(p.id)}
                              onChange={e =>
                                setSelected(prev =>
                                  e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                                )
                              }
                            />
                            <span className="text-xs font-semibold text-slate-800 min-w-0">
                              {p.full_name}
                              <small className="block text-[11px] text-slate-500 font-normal">
                                {p.birth_date} • Identificador: {p.identifier_suffix || 'não informado'}
                              </small>
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">{selected.length} pacientes selecionados</p>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-700">Informações assistenciais autorizadas:</p>
                    <div className="space-y-1.5">
                      {([
                        ['records', 'Prontuário, evoluções, anamneses e documentos clínicos'],
                        ['appointments', 'Uso em novos agendamentos'],
                        ['files', 'Exames, fotos e anexos clínicos']
                      ] as const).map(([scope, label]) => (
                        <label key={scope} className="flex gap-2.5 items-center text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-teal-600 rounded"
                            checked={scopes.includes(scope)}
                            onChange={e =>
                              setScopes(prev =>
                                e.target.checked
                                  ? Array.from(new Set([...prev, scope, ...(scope === 'files' ? ['records'] : [])]))
                                  : prev.filter(
                                      s => s !== scope && (scope !== 'records' || (s !== 'files' && !s.startsWith('module:')))
                                    )
                              )
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>

                    {scopes.includes('records') && availableScopes.some(s => s.startsWith('module:')) && (
                      <fieldset className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 mt-2">
                        <legend className="text-[11px] font-bold text-slate-600 px-1">Módulos especializados:</legend>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {availableScopes
                            .filter(s => s.startsWith('module:'))
                            .map(scope => (
                              <label key={scope} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 shrink-0 accent-teal-600 rounded"
                                  checked={scopes.includes(scope)}
                                  onChange={e =>
                                    setScopes(prev =>
                                      e.target.checked ? [...prev, scope] : prev.filter(s => s !== scope)
                                    )
                                  }
                                />
                                <span className="truncate">{scope.slice(7)}</span>
                              </label>
                            ))}
                        </div>
                      </fieldset>
                    )}

                    <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                      O histórico só fica visível a profissionais autorizados no módulo. Notas privadas, dados financeiros ou administrativos continuam restritos à origem.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={busy || !selected.length}
                      className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      onClick={() => {
                        setReview(true);
                        setConfirmed(false);
                      }}
                    >
                      Revisar compartilhamento ({selected.length})
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <h2 className="font-bold text-slate-900 text-sm">Confirme o compartilhamento</h2>

                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-1.5">
                    <p>
                      <strong>Origem:</strong> {sources.find(s => s.id === source)?.name}
                    </p>
                    <p>
                      <strong>Destino:</strong> {targetName}
                    </p>
                    <p>
                      <strong>Pacientes:</strong> {selected.length} {selected.length === 1 ? 'paciente' : 'pacientes'}
                    </p>
                    <p>
                      <strong>Escopos:</strong>{' '}
                      {scopes.includes('records') ? 'Cadastro e histórico clínico' : 'Cadastro'}
                      {scopes.includes('appointments') ? ' • Novos agendamentos' : ''}
                      {scopes.includes('files') ? ' • Anexos e exames' : ''}
                    </p>
                    <p>
                      <strong>Módulos:</strong>{' '}
                      {scopes.filter(s => s.startsWith('module:')).map(s => s.slice(7)).join(', ') || 'Somente Geral'}
                    </p>
                  </div>

                  {duplicates.length > 0 && (
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 space-y-2">
                      <p className="font-bold">Cadastros correspondentes encontrados na clínica de destino:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {duplicates.map(d => (
                          <li key={d.patientId}>{d.name}</li>
                        ))}
                      </ul>
                      <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-teal-600 rounded"
                          checked={separate}
                          onChange={e => setSeparate(e.target.checked)}
                        />
                        <span>Manter registros separados, sem mesclar prontuários.</span>
                      </label>
                    </div>
                  )}

                  <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-teal-600 rounded"
                      checked={confirmed}
                      onChange={e => setConfirmed(e.target.checked)}
                    />
                    <span className="leading-relaxed">
                      Confirmo que desejo disponibilizar os pacientes e dados selecionados à {targetName} e estou ciente de que usuários autorizados dessa clínica poderão acessá-los conforme suas permissões.
                    </span>
                  </label>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      disabled={busy || !confirmed || (duplicates.length > 0 && !separate)}
                      className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl font-bold text-sm shadow-md shadow-teal-700/15 transition-all cursor-pointer disabled:opacity-50"
                      onClick={save}
                    >
                      Confirmar compartilhamento e entrar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-semibold transition-colors cursor-pointer"
                      onClick={() => {
                        setReview(false);
                        setDuplicates([]);
                        setSeparate(false);
                      }}
                    >
                      Voltar à seleção
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors cursor-pointer pt-1"
                onClick={finish}
              >
                Entrar na clínica sem compartilhar pacientes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

