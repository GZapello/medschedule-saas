import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  X,
  Clock,
  Calendar,
  User,
  ShieldCheck,
  AlertTriangle,
  HeartPulse,
  Pill,
  Save,
  CheckCircle2,
  Share2,
  FileText,
  Phone,
  MessageCircle,
  Building2,
  Stethoscope,
  ChevronRight
} from 'lucide-react';
import { ReferralModal } from './ReferralModal';
import { FinishConsultationModal } from './FinishConsultationModal';

interface QuickConsultationModalProps {
  appointment: {
    id: string;
    patient_id: string;
    patient_name?: string;
    patient_phone?: string;
    patient_birth_date?: string;
    professional_id: string;
    professional_name?: string;
    service_id: string;
    service_name?: string;
    start_time: string;
    end_time?: string;
    modality?: string;
    status?: string;
  };
  onClose: () => void;
  onFinished: () => void;
}

export const QuickConsultationModal: React.FC<QuickConsultationModalProps> = ({
  appointment,
  onClose,
  onFinished
}) => {
  const { currentTenant, clientTermLabel } = useAuth();
  const { showToast } = useToast();

  const [loadingPatient, setLoadingPatient] = useState<boolean>(true);
  const [patientData, setPatientData] = useState<any>(null);
  const [allergiesList, setAllergiesList] = useState<any[]>([]);
  const [medicationsList, setMedicationsList] = useState<any[]>([]);

  // Campos clínicos
  const [title, setTitle] = useState<string>(
    `Consulta de ${appointment.service_name || 'Rotina'}`
  );
  const [clinicalEvolution, setClinicalEvolution] = useState<string>('');
  const [technicalNotes, setTechnicalNotes] = useState<string>('');
  const [isSealed, setIsSealed] = useState<boolean>(false);

  // Status de autosave
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Sub-modais
  const [showReferralModal, setShowReferralModal] = useState<boolean>(false);
  const [showFinishModal, setShowFinishModal] = useState<boolean>(false);
  const [savingRecord, setSavingRecord] = useState<boolean>(false);

  const DRAFT_KEY = `zemda_quick_consult_${appointment.id}`;
  const debounceTimerRef = useRef<any>(null);

  // 1. Carrega dados completos do paciente e histórico clínico
  useEffect(() => {
    async function loadPatientDetails() {
      try {
        setLoadingPatient(true);
        const [patRes, allergiesRes, medsRes] = await Promise.allSettled([
          ApiClient.get<any>(`/v1/patients/${appointment.patient_id}`),
          ApiClient.get<any[]>(`/v1/patients/${appointment.patient_id}/allergies`),
          ApiClient.get<any[]>(`/v1/patients/${appointment.patient_id}/medications`)
        ]);

        if (patRes.status === 'fulfilled') {
          setPatientData(patRes.value);
        }
        if (allergiesRes.status === 'fulfilled' && Array.isArray(allergiesRes.value)) {
          setAllergiesList(allergiesRes.value);
        }
        if (medsRes.status === 'fulfilled' && Array.isArray(medsRes.value)) {
          setMedicationsList(medsRes.value);
        }
      } catch (err: any) {
        console.warn('Erro ao carregar dados do paciente:', err);
      } finally {
        setLoadingPatient(false);
      }
    }

    loadPatientDetails();
  }, [appointment.patient_id]);

  // 2. Restaura rascunho salvo anteriormente do LocalStorage
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.clinicalEvolution) setClinicalEvolution(parsed.clinicalEvolution);
        if (parsed.technicalNotes) setTechnicalNotes(parsed.technicalNotes);
        setAutosaveStatus('saved');
        setLastSavedAt(new Date(parsed.savedAt || Date.now()));
      }
    } catch (e) {
      console.warn('Erro ao restaurar rascunho:', e);
    }
  }, [DRAFT_KEY]);

  // 3. Mecanismo de Autosave com Debounce (garantia absoluta de não perder texto)
  const triggerAutosave = (newTitle: string, newEvol: string, newNotes: string) => {
    setAutosaveStatus('saving');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        const draftObj = {
          title: newTitle,
          clinicalEvolution: newEvol,
          technicalNotes: newNotes,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draftObj));
        setAutosaveStatus('saved');
        setLastSavedAt(new Date());
      } catch (err) {
        console.error('Erro no autosave:', err);
        setAutosaveStatus('error');
      }
    }, 600);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    triggerAutosave(val, clinicalEvolution, technicalNotes);
  };

  const handleEvolutionChange = (val: string) => {
    setClinicalEvolution(val);
    triggerAutosave(title, val, technicalNotes);
  };

  const handleNotesChange = (val: string) => {
    setTechnicalNotes(val);
    triggerAutosave(title, clinicalEvolution, val);
  };

  // 4. Salvar Rascunho Manualmente
  const handleManualSaveDraft = () => {
    try {
      const draftObj = {
        title,
        clinicalEvolution,
        technicalNotes,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftObj));
      setAutosaveStatus('saved');
      setLastSavedAt(new Date());
      showToast('Rascunho salvo com segurança no dispositivo!', 'success');
    } catch (e: any) {
      showToast('Erro ao salvar rascunho localmente', 'error');
    }
  };

  // 5. Salvar Evolução Direto no Prontuário Eletrônico
  const handleSaveEvolution = async () => {
    if (!clinicalEvolution.trim()) {
      showToast('Digite a evolução clínica do atendimento antes de salvar', 'error');
      return;
    }

    try {
      setSavingRecord(true);
      const sessionDate = appointment.start_time ? appointment.start_time.split('T')[0] : new Date().toISOString().split('T')[0];

      await ApiClient.post('/v1/clinical-records', {
        patientId: appointment.patient_id,
        appointmentId: appointment.id,
        professionalId: appointment.professional_id,
        sessionDate,
        title: title.trim() || `Consulta de ${appointment.service_name || 'Rotina'}`,
        clinicalEvolution: clinicalEvolution.trim(),
        technicalNotes: technicalNotes.trim() || null,
        isSealed
      });

      showToast('Evolução clínica gravada com sucesso no prontuário oficial!', 'success');
      // Atualiza status do agendamento para in_progress se ainda estiver scheduled
      if (appointment.status === 'scheduled' || appointment.status === 'confirmed') {
        try {
          await ApiClient.put(`/v1/appointments/${appointment.id}/status`, {
            status: 'in_progress'
          });
        } catch (e) {
          // Ignora
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao gravar evolução no prontuário', 'error');
    } finally {
      setSavingRecord(false);
    }
  };

  // Calcula idade a partir da data de nascimento
  const calculateAge = (birthDateString?: string) => {
    if (!birthDateString) return null;
    const today = new Date();
    const birth = new Date(birthDateString);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? `${age} anos` : null;
  };

  const patientName = patientData?.full_name || appointment.patient_name || 'Paciente';
  const patientPhone = patientData?.phone || patientData?.mobile || appointment.patient_phone || '';
  const patientBirth = patientData?.birth_date || appointment.patient_birth_date || '';
  const patientAge = calculateAge(patientBirth);
  const cleanPhone = patientPhone.replace(/\D/g, '');

  const appointmentDate = appointment.start_time ? appointment.start_time.split('T')[0] : '';
  const appointmentTime = appointment.start_time ? appointment.start_time.split('T')[1]?.slice(0, 5) : '';

  // Alertas de alergias
  const hasAllergies = (allergiesList && allergiesList.length > 0) || (patientData?.allergies && patientData.allergies.trim().length > 0);
  const allergiesText = allergiesList.length > 0
    ? allergiesList.map(a => a.allergen || a.name).join(', ')
    : patientData?.allergies || '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 flex flex-col max-h-[96vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* TOP BAR: Identidade Zemda & Fechar */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-xs font-black tracking-wider uppercase text-teal-400">
                Atendimento Rápido
              </span>
            </div>
            <span className="text-slate-500">•</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentTenant?.trade_name || currentTenant?.name || 'Clínica'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicador de Autosave */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px]">
              {autosaveStatus === 'saving' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span className="text-amber-300">Salvando rascunho...</span>
                </>
              )}
              {autosaveStatus === 'saved' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-300">
                    Salvo localmente {lastSavedAt ? `às ${lastSavedAt.toLocaleTimeString().slice(0, 5)}` : ''}
                  </span>
                </>
              )}
              {autosaveStatus === 'error' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  <span className="text-rose-300">Erro ao salvar localmente</span>
                </>
              )}
              {autosaveStatus === 'idle' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="text-slate-400">Rascunho protegido</span>
                </>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
              title="Fechar (seu rascunho está seguro)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CORPO PRINCIPAL COM SCROLL */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50">
          
          {/* BANNER 1: DADOS ESSENCIAIS DO PACIENTE */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              
              {/* Identificação do Paciente */}
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-teal-500 text-white flex items-center justify-center font-bold text-lg shadow-sm flex-shrink-0">
                  {patientName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">
                      {patientName}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {clientTermLabel}
                    </span>
                    {patientData?.is_child === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Pediátrico
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                    {patientAge && (
                      <span className="font-semibold text-slate-700">
                        {patientAge} {patientBirth ? `(${new Date(patientBirth + 'T12:00:00').toLocaleDateString('pt-BR')})` : ''}
                      </span>
                    )}
                    {patientPhone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {patientPhone}
                        {cleanPhone.length >= 10 && (
                          <a
                            href={`https://wa.me/55${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700 font-bold ml-1"
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Informações da Consulta Atual */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 lg:w-auto w-full">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Data & Horário</span>
                  <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    {appointmentDate ? new Date(appointmentDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                    {appointmentTime && <span className="text-indigo-600 ml-0.5">às {appointmentTime}</span>}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Profissional</span>
                  <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <Stethoscope className="w-3.5 h-3.5 text-teal-500" />
                    {appointment.professional_name || 'Profissional'}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Procedimento</span>
                  <p className="font-bold text-slate-800 truncate mt-0.5">
                    {appointment.service_name || 'Atendimento Geral'}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* BANNER 2: ALERTAS CLÍNICOS VISÍVEIS (Alergias, Medicamentos, Observações) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* Alergias: Vermelho se houver, ou indicação segura */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                hasAllergies
                  ? 'bg-rose-50/80 border-rose-200 text-rose-900 shadow-xs'
                  : 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {hasAllergies ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
                <span className="font-bold text-xs uppercase tracking-wider">
                  {hasAllergies ? 'Alergias Relatadas' : 'Alergias'}
                </span>
              </div>
              <p className="text-xs leading-relaxed font-medium">
                {hasAllergies ? allergiesText : 'Nenhuma alergia conhecida relatada.'}
              </p>
            </div>

            {/* Medicamentos de uso contínuo */}
            <div className="p-3.5 rounded-2xl border bg-blue-50/50 border-blue-200 text-blue-950">
              <div className="flex items-center gap-2 mb-1">
                <Pill className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-xs uppercase tracking-wider">
                  Medicamentos Contínuos
                </span>
              </div>
              <p className="text-xs leading-relaxed font-medium">
                {medicationsList.length > 0
                  ? medicationsList.map(m => `${m.name} ${m.dosage || ''}`).join(', ')
                  : patientData?.continuous_medications || 'Nenhum medicamento contínuo registrado.'}
              </p>
            </div>

            {/* Observações importantes */}
            <div className="p-3.5 rounded-2xl border bg-amber-50/50 border-amber-200 text-amber-950">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-xs uppercase tracking-wider">
                  Observações & Alertas
                </span>
              </div>
              <p className="text-xs leading-relaxed font-medium line-clamp-2">
                {patientData?.notes || 'Sem observações administrativas ou clínicas adicionais.'}
              </p>
            </div>

          </div>

          {/* ÁREA CENTRAL: EVOLUÇÃO CLÍNICA COM AUTOSAVE INTEGRADO */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex-1">
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">
                  Título da Consulta / Sessão
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Ex: Consulta Inicial, Sessão 3 de Fisioterapia, Retorno Clínico..."
                  className="w-full text-base font-bold text-slate-800 border border-slate-200 rounded-xl px-3.5 py-2 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowReferralModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                  title="Encaminhar paciente para outro colega profissional da clínica"
                >
                  <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Encaminhar</span>
                </button>
              </div>
            </div>

            {/* Campo Principal de Evolução */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Evolução Clínica & Conduta Terapêutica *
                </label>
                <span className="text-[11px] text-slate-400">
                  {clinicalEvolution.length} caracteres
                </span>
              </div>
              <textarea
                rows={10}
                value={clinicalEvolution}
                onChange={e => handleEvolutionChange(e.target.value)}
                placeholder="Descreva a queixa principal, anamnese, exame clínico, procedimentos realizados, evolução do paciente e conduta adotada nesta sessão..."
                className="w-full text-sm leading-relaxed p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-inner resize-y font-sans text-slate-800"
              />
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                Texto salvo continuamente contra perdas acidentais no navegador e recuperável a qualquer momento.
              </p>
            </div>

            {/* Anotações Técnicas / Orientações */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Orientações Complementares / Tarefas para Casa
              </label>
              <textarea
                rows={3}
                value={technicalNotes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Orientações de cuidados, observações para a equipe ou metas para o próximo retorno..."
                className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50"
              />
            </div>

            {/* Checkbox de Lacração */}
            <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80 flex items-center gap-3">
              <input
                type="checkbox"
                id="sealRecord"
                checked={isSealed}
                onChange={e => setIsSealed(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded-sm cursor-pointer"
              />
              <label htmlFor="sealRecord" className="text-xs font-medium text-amber-950 cursor-pointer">
                <span className="font-bold">Lacrar prontuário eletrônico:</span> impede edições futuras neste registro clínico para total conformidade jurídica.
              </label>
            </div>

          </div>

        </div>

        {/* BARRA DE AÇÕES INFERIOR */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualSaveDraft}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Rascunho</span>
            </button>

            <button
              type="button"
              disabled={savingRecord}
              onClick={handleSaveEvolution}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
              <span>{savingRecord ? 'Gravando...' : 'Salvar Evolução'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Fechar
            </button>

            <button
              type="button"
              onClick={() => setShowFinishModal(true)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md shadow-teal-500/20 transition-all cursor-pointer"
            >
              <span>Finalizar Atendimento</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* MODAL DE ENCAMINHAMENTO INTERPROFISSIONAL */}
      {showReferralModal && (
        <ReferralModal
          isOpen={true}
          patientId={appointment.patient_id}
          patientName={patientName}
          originAppointmentId={appointment.id}
          onClose={() => setShowReferralModal(false)}
          onSuccess={() => {
            setShowReferralModal(false);
            showToast('Encaminhamento interprofissional registrado com sucesso!', 'success');
          }}
        />
      )}

      {/* MODAL DE PÓS-ATENDIMENTO / DOCUMENTOS / RETORNO */}
      {showFinishModal && (
        <FinishConsultationModal
          appointment={{
            id: appointment.id,
            patient_id: appointment.patient_id,
            patient_name: patientName,
            professional_id: appointment.professional_id,
            professional_name: appointment.professional_name,
            service_id: appointment.service_id,
            service_name: appointment.service_name,
            start_time: appointment.start_time
          }}
          onClose={() => setShowFinishModal(false)}
          onFinished={() => {
            setShowFinishModal(false);
            onFinished();
            onClose();
          }}
        />
      )}

    </div>
  );
};
