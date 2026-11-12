import React, { useState, useEffect } from 'react';
import { buildApiUrl, getApiBaseUrl } from '../../api/client';
import {
  PreConsultationBodyMapSimple,
  PatientBodyMapRegion
} from './PreConsultationBodyMapSimple';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Calendar,
  User,
  Send
} from 'lucide-react';

export const PublicPreConsultationPage: React.FC<{ token: string }> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Identificação do respondente / responsável legal
  const [isGuardian, setIsGuardian] = useState(false);
  const [respondentName, setRespondentName] = useState('');
  const [respondentRelationship, setRespondentRelationship] = useState('self');
  const [guardianCpf, setGuardianCpf] = useState('');

  // Respostas
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [bodyMapRegions, setBodyMapRegions] = useState<PatientBodyMapRegion[]>([]);

  useEffect(() => {
    document.title = 'Pré-consulta Digital | Zemda';
    const upsertMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    upsertMeta('robots', 'noindex, nofollow');
    upsertMeta('referrer', 'no-referrer');
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      canonicalLink.remove();
    }
  }, []);

  useEffect(() => {
    const loadPublicForm = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = buildApiUrl(getApiBaseUrl(), `/v1/public/pre-consultation/${encodeURIComponent(token)}`);
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error || 'Este link de Pré-consulta não está mais disponível.');
          setData(json);
          return;
        }
        setData(json);
        if (json.alreadySubmitted) {
          setSubmitted(true);
        } else {
          setRespondentName(json.patientFullName || json.patientDisplayName || '');
          if (json.isChild) {
            setIsGuardian(true);
            setRespondentRelationship('mother');
            if (json.suggestedGuardianName) {
              setRespondentName(json.suggestedGuardianName);
            }
          }
        }
      } catch {
        setError('Erro de conexão ao carregar o formulário de Pré-consulta.');
      } finally {
        setLoading(false);
      }
    };
    loadPublicForm();
  }, [token]);

  const handleFieldChange = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleToggleMultiOption = (fieldId: string, option: string) => {
    setAnswers(prev => {
      const current: string[] = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
      if (current.includes(option)) {
        return { ...prev, [fieldId]: current.filter(o => o !== option) };
      }
      return { ...prev, [fieldId]: [...current, option] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!respondentName.trim()) {
      setSubmitError('Por favor, informe o nome de quem está preenchendo o formulário.');
      return;
    }

    setSubmitting(true);
    try {
      const submitUrl = buildApiUrl(getApiBaseUrl(), `/v1/public/pre-consultation/${encodeURIComponent(token)}/submit`);
      const res = await fetch(
        submitUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            respondentName: respondentName.trim(),
            respondentRelationship: isGuardian ? respondentRelationship : 'self',
            isGuardian,
            guardianName: isGuardian ? respondentName.trim() : null,
            guardianCpf: isGuardian && guardianCpf.trim() ? guardianCpf.trim() : null,
            answers,
            bodyMap:
              bodyMapRegions.length > 0
                ? { regions: bodyMapRegions }
                : null
          })
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json?.error || 'Não foi possível enviar o formulário.');
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError('Falha de conexão ao enviar suas respostas. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 max-w-md w-full text-center">
          <div className="w-10 h-10 rounded-full border-3 border-teal-600 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Carregando Pré-consulta Digital...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-8 max-w-md w-full text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-base font-extrabold text-slate-900">
            Link Indisponível
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-lg border border-emerald-100 p-8 max-w-md w-full text-center flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">
            Pré-consulta Enviada!
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Suas informações foram encaminhadas com segurança para{' '}
            <strong>{data?.professionalName || data?.clinicName || 'a clínica'}</strong>.
            Não é necessário reenviar este formulário.
          </p>
        </div>
      </div>
    );
  }

  const form = data?.form || {};
  const fields: any[] = Array.isArray(form.fields) ? form.fields : [];
  const showBodyMap =
    Boolean(form.includeZemda360BodyMap) ||
    fields.some(f => f.type === 'zemda360_body_map');

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        {/* Cabeçalho da Clínica */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" /> Pré-consulta Digital Segura
              </span>
              <h1 className="text-lg font-extrabold text-slate-900 mt-2">
                {form.title || 'Formulário de Pré-consulta'}
              </h1>
              <p className="text-xs text-slate-500">
                {data?.clinicName}
                {data?.professionalName ? ` • Profissional: ${data.professionalName}` : ''}
              </p>
            </div>
            {data?.appointmentStartTime && (
              <div className="px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>
                  {String(data.appointmentStartTime).replace('T', ' ').slice(0, 16)}
                </span>
              </div>
            )}
          </div>
          {form.instructions && (
            <div className="p-3.5 rounded-2xl bg-teal-50/60 border border-teal-100 text-xs text-slate-700 leading-relaxed">
              {form.instructions}
            </div>
          )}
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Identificação do Respondente / Responsável Legal */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Identificação do Respondente
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGuardian}
                  onChange={e => setIsGuardian(e.target.checked)}
                  className="accent-teal-600"
                />
                Estou preenchendo como responsável legal pelo(a) paciente ({data?.patientDisplayName})
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isGuardian ? 'Nome Completo do Responsável Legal *' : 'Seu Nome *'}
                </label>
                <input
                  type="text"
                  required
                  value={respondentName}
                  onChange={e => setRespondentName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {isGuardian && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vínculo / Parentesco com o Paciente
                  </label>
                  <select
                    value={respondentRelationship}
                    onChange={e => setRespondentRelationship(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    <option value="mother">Mãe</option>
                    <option value="father">Pai</option>
                    <option value="legal_guardian">Responsável Legal / Tutor</option>
                    <option value="other">Familiar / Acompanhante</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Campos do Formulário */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col gap-5">
            {fields
              .filter(f => f.type !== 'zemda360_body_map')
              .map(field => (
                <div key={field.id} className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    {field.label}{' '}
                    {field.required && <span className="text-rose-600">*</span>}
                  </label>
                  {field.instructions && (
                    <p className="text-[11px] text-slate-500">{field.instructions}</p>
                  )}

                  {field.type === 'short_text' && (
                    <input
                      type="text"
                      required={Boolean(field.required)}
                      value={answers[field.id] || ''}
                      onChange={e => handleFieldChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  )}

                  {field.type === 'long_text' && (
                    <textarea
                      rows={3}
                      required={Boolean(field.required)}
                      value={answers[field.id] || ''}
                      onChange={e => handleFieldChange(field.id, e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  )}

                  {field.type === 'date' && (
                    <input
                      type="date"
                      required={Boolean(field.required)}
                      value={answers[field.id] || ''}
                      onChange={e => handleFieldChange(field.id, e.target.value)}
                      className="w-full sm:w-56 px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  )}

                  {field.type === 'checkbox' && (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={Boolean(answers[field.id])}
                        onChange={e => handleFieldChange(field.id, e.target.checked)}
                        className="accent-teal-600"
                      />
                      Sim / Confirmo
                    </label>
                  )}

                  {field.type === 'single_choice' && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {(field.options || []).map((opt: string) => (
                        <label
                          key={opt}
                          className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={field.id}
                            checked={answers[field.id] === opt}
                            onChange={() => handleFieldChange(field.id, opt)}
                            className="accent-teal-600"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}

                  {field.type === 'multiple_choice' && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {(field.options || []).map((opt: string) => {
                        const checked =
                          Array.isArray(answers[field.id]) &&
                          answers[field.id].includes(opt);
                        return (
                          <label
                            key={opt}
                            className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleMultiOption(field.id, opt)}
                              className="accent-teal-600"
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {field.type === 'scale' && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{field.scaleMinLabel || '0 (Mínimo)'}</span>
                        <span className="font-extrabold text-teal-700 text-xs">
                          Valor selecionado: {answers[field.id] ?? 0}
                        </span>
                        <span>{field.scaleMaxLabel || '10 (Máximo)'}</span>
                      </div>
                      <input
                        type="range"
                        min={field.scaleMin ?? 0}
                        max={field.scaleMax ?? 10}
                        value={answers[field.id] ?? 0}
                        onChange={e => handleFieldChange(field.id, Number(e.target.value))}
                        className="w-full accent-teal-600 cursor-pointer"
                      />
                    </div>
                  )}

                  {(field.type === 'file' || field.type === 'image') && (
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          handleFieldChange(field.id, {
                            fileName: file.name,
                            dataUrl: String(reader.result || '').slice(0, 350000)
                          });
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="text-xs text-slate-600"
                    />
                  )}
                </div>
              ))}

            {/* Mapa Corporal Zemda360 Oficial */}
            {showBodyMap && (
              <PreConsultationBodyMapSimple
                regions={bodyMapRegions}
                onChange={setBodyMapRegions}
                initialBodyModel={data?.patientBodyModel === 'male' ? 'male' : 'female'}
              />
            )}
          </div>

          {submitError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-extrabold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Enviando respostas...' : 'Enviar Pré-consulta Digital'}
          </button>
        </form>
      </div>
    </div>
  );
};
