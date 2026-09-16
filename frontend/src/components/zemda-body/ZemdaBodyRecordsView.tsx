import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Patient } from '../../types';
import { ZemdaBodyModal } from './ZemdaBodyModal';
import {
  Activity,
  User,
  Calendar,
  Eye,
  ShieldCheck,
  AlertCircle,
  FileText,
  Clock,
  Layers
} from 'lucide-react';

export const ZemdaBodyRecordsView: React.FC = () => {
  const { clientTermLabel } = useAuth();
  const { showToast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Modal para visualização de uma avaliação selecionada
  const [viewingAssessment, setViewingAssessment] = useState<any | null>(null);

  // Carrega lista de pacientes
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

  // Carrega avaliações do paciente selecionado
  const fetchAssessments = async (patientId: string) => {
    try {
      setLoading(true);
      const list = await ApiClient.get<any[]>(`/v1/body-assessments/patient/${patientId}`);
      setAssessments(list || []);
    } catch (err: any) {
      showToast(err.message || 'Erro ao buscar mapas corporais', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      fetchAssessments(selectedPatientId);
    }
  }, [selectedPatientId]);

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              ZemdaBody • Mapas Corporais Clínicos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Histórico de avaliações corporais, marcadores anatômicos e desenhos clínicos por paciente.
            </p>
          </div>
        </div>

        {/* Seletor de Paciente */}
        <div className="flex items-center gap-2 max-w-sm w-full">
          <label className="text-xs font-bold text-slate-500 whitespace-nowrap">
            {clientTermLabel}:
          </label>
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name} {p.cpf ? `(${p.cpf})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Aviso de Orientação */}
      <div className="bg-teal-50/60 border border-teal-200/80 p-4 rounded-2xl flex items-center justify-between gap-3 text-xs text-teal-950">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0" />
          <span>
            Esta visualização exibe o <strong>histórico das avaliações corporais</strong> realizadas nos atendimentos. Para registrar novos dados e desenhos sobre o mapa, inicie uma consulta pela <strong>Agenda</strong>.
          </span>
        </div>
      </div>

      {/* Lista de Avaliações Corporais Existentes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>Mapas Corporais Realizados</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {assessments.length}
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Carregando avaliações corporais...
          </div>
        ) : assessments.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Activity className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Nenhum mapa corporal registrado</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Nenhuma avaliação corporal foi realizada para este paciente ainda. Os mapas criados durante as consultas aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {assessments.map(item => (
              <div
                key={item.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-teal-600" />
                      {item.assessment_date ? new Date(item.assessment_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
                    </span>

                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Módulo: {item.module || 'Geral'}
                    </span>

                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                      Modelo: {item.body_model === 'male' ? 'Masculino' : 'Feminino'}
                    </span>

                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                      {item.total_markers || 0} marcadores registrados
                    </span>
                  </div>

                  <p className="text-xs text-slate-500">
                    Profissional: <strong className="text-slate-700">{item.professional_name || 'Profissional'}</strong>
                    {item.notes ? ` • Obs: "${item.notes}"` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setViewingAssessment(item)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Visualizar mapa corporal</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Visualização do Mapa */}
      {viewingAssessment && (
        <ZemdaBodyModal
          isOpen={!!viewingAssessment}
          onClose={() => setViewingAssessment(null)}
          patientId={viewingAssessment.patient_id}
          patientName={selectedPatient?.full_name}
          appointmentId={viewingAssessment.appointment_id}
          professionalId={viewingAssessment.professional_id}
          professionalName={viewingAssessment.professional_name}
          module={viewingAssessment.module}
          initialBodyModel={viewingAssessment.body_model}
          readOnly={true}
        />
      )}
    </div>
  );
};
