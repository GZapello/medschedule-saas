import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Patient, ClinicalRecord } from '../../types';
import {
  FileText,
  ShieldCheck,
  Lock,
  Plus,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  X,
  AlertCircle
} from 'lucide-react';

export const ClinicalRecordsView: React.FC = () => {
  const { clientTermLabel } = useAuth();
  const { showToast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Modal Nova Evolução
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [clinicalEvolution, setClinicalEvolution] = useState<string>('');
  const [technicalNotes, setTechnicalNotes] = useState<string>('');
  const [isSealed, setIsSealed] = useState<boolean>(false);

  useEffect(() => {
    async function loadPatients() {
      try {
        const data = await ApiClient.get<Patient[]>('/v1/patients');
        setPatients(data);
        if (data.length > 0) {
          setSelectedPatientId(data[0].id);
        }
      } catch (err: any) {
        showToast('Erro ao carregar lista de pacientes', 'error');
      }
    }
    loadPatients();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      async function loadRecords() {
        try {
          setLoading(true);
          const data = await ApiClient.get<ClinicalRecord[]>(`/v1/clinical-records/patient/${selectedPatientId}`);
          setRecords(data);
        } catch (err: any) {
          showToast(err.message || 'Erro ao carregar prontuário', 'error');
        } finally {
          setLoading(false);
        }
      }
      loadRecords();
    }
  }, [selectedPatientId]);

  const handleSaveRecord = async () => {
    if (!title || !clinicalEvolution) {
      showToast('Título e anotação da evolução são obrigatórios', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/clinical-records', {
        patientId: selectedPatientId,
        sessionDate,
        title,
        clinicalEvolution,
        technicalNotes: technicalNotes || null,
        isSealed
      });

      showToast('Evolução clínica gravada com sucesso!', 'success');
      setShowNewModal(false);
      setTitle('');
      setClinicalEvolution('');
      setTechnicalNotes('');
      setIsSealed(false);

      // Recarrega
      const data = await ApiClient.get<ClinicalRecord[]>(`/v1/clinical-records/patient/${selectedPatientId}`);
      setRecords(data);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar evolução', 'error');
    }
  };

  const currentPatient = patients.find(p => p.id === selectedPatientId);

  return (
    <div className="space-y-6">
      {/* LGPD Banner */}
      <div className="bg-indigo-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Prontuário Eletrônico & Sigilo Profissional</h3>
            <p className="text-xs text-indigo-200">
              Conformidade rigorosa com a LGPD e conselhos de classe. Acesso restrito e auditado.
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-block text-xs font-semibold px-3 py-1 bg-white/10 rounded-full border border-white/20">
          Criptografia & Auditoria Ativa
        </span>
      </div>

      {/* Patient Selector & Action */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
            Selecione o {clientTermLabel}:
          </label>
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            className="w-full sm:w-72 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name} {p.is_child ? '(Pediátrico)' : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Nova Evolução Clínica
        </button>
      </div>

      {/* Records Timeline */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Carregando histórico do prontuário...
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
            <p className="font-medium text-sm text-slate-600">Nenhum registro clínico cadastrado para este paciente.</p>
            <p className="text-xs text-slate-400 mt-1">Clique em "Nova Evolução Clínica" para iniciar o prontuário.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-indigo-200 ml-4 pl-6 space-y-6">
            {records.map(r => (
              <div key={r.id} className="relative bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                {/* Timeline Dot */}
                <div className="absolute -left-[31px] top-6 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white shadow-xs" />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-base">{r.title}</h4>
                      {r.is_sealed === 1 && (
                        <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <Lock className="w-3 h-3" /> Prontuário Lacrado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Atendido por <span className="font-semibold text-slate-700">{r.professional_name}</span> ({r.registration_number})
                    </p>
                  </div>

                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                    Sessão em: {r.session_date}
                  </span>
                </div>

                {/* Clinical Evolution Text */}
                <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                  <div>
                    <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">
                      Evolução da Sessão / Conduta Clínica
                    </h5>
                    <p className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 whitespace-pre-wrap">
                      {r.clinical_evolution}
                    </p>
                  </div>

                  {r.technical_notes && (
                    <div>
                      <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">
                        Anotações Técnicas & Encaminhamentos
                      </h5>
                      <p className="bg-teal-50/50 p-3 rounded-xl border border-teal-100 text-teal-900 whitespace-pre-wrap">
                        {r.technical_notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Nova Evolução */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase">Novo Registro Clínico</span>
                <h3 className="text-xl font-bold text-slate-900">{currentPatient?.full_name}</h3>
              </div>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data do Atendimento *</label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={e => setSessionDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Título da Sessão *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Ex: Sessão 5 - Regulação Emocional"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Evolução Clínica / Anotações do Atendimento *
                </label>
                <textarea
                  rows={5}
                  value={clinicalEvolution}
                  onChange={e => setClinicalEvolution(e.target.value)}
                  placeholder="Descreva a evolução do paciente, intervenções aplicadas e resposta terapêutica..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Anotações Técnicas / Plano para Próxima Sessão
                </label>
                <textarea
                  rows={2}
                  value={technicalNotes}
                  onChange={e => setTechnicalNotes(e.target.value)}
                  placeholder="Orientações dadas aos pais, atividades para casa ou lembretes clínicos..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="sealCheck"
                  checked={isSealed}
                  onChange={e => setIsSealed(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-sm"
                />
                <label htmlFor="sealCheck" className="text-xs font-semibold text-amber-900 cursor-pointer">
                  Lacrar e finalizar prontuário (bloqueia edições futuras para validade jurídica)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveRecord}
                  className="px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar no Prontuário
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
