import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Patient } from '../../types';
import { ZemdaBodyModal } from './ZemdaBodyModal';
import { ZemdaBodyCanvas } from './ZemdaBodyCanvas';
import { getRegionLabel } from './bodyRegionsData';
import {
  Activity,
  User,
  Calendar,
  Eye,
  ShieldCheck,
  AlertCircle,
  FileText,
  Clock,
  Layers,
  GitCompare,
  Plus,
  CheckSquare,
  Square,
  X
} from 'lucide-react';

export const ZemdaBodyRecordsView: React.FC = () => {
  const { clientTermLabel } = useAuth();
  const { showToast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Modal para visualização de uma avaliação individual
  const [viewingAssessment, setViewingAssessment] = useState<any | null>(null);

  // Modal para criação de nova avaliação direta
  const [creatingNew, setCreatingNew] = useState<boolean>(false);

  // Comparação entre duas avaliações
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [comparingData, setComparingData] = useState<{ assessA: any; assessB: any } | null>(null);
  const [loadingCompare, setLoadingCompare] = useState<boolean>(false);

  // Carrega lista de pacientes
  useEffect(() => {
    async function loadPatients() {
      try {
        const data = await ApiClient.get<Patient[]>('/v1/patients');
        setPatients(data || []);
        if (data && data.length > 0) {
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
      setSelectedForCompare([]);
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

  // Selecionar para comparação
  const toggleSelectForCompare = (id: string) => {
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare(selectedForCompare.filter(x => x !== id));
    } else {
      if (selectedForCompare.length >= 2) {
        setSelectedForCompare([selectedForCompare[1], id]);
      } else {
        setSelectedForCompare([...selectedForCompare, id]);
      }
    }
  };

  // Abrir modal de comparação
  const handleOpenComparison = async () => {
    if (selectedForCompare.length !== 2) {
      showToast('Selecione exatamente 2 avaliações para comparar', 'info');
      return;
    }

    try {
      setLoadingCompare(true);
      const [resA, resB] = await Promise.all([
        ApiClient.get<any>(`/v1/body-assessments/${selectedForCompare[0]}`),
        ApiClient.get<any>(`/v1/body-assessments/${selectedForCompare[1]}`)
      ]);

      setComparingData({
        assessA: resA,
        assessB: resB
      });
    } catch (err: any) {
      showToast('Erro ao carregar dados para comparação', 'error');
    } finally {
      setLoadingCompare(false);
    }
  };

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
              Histórico completo de avaliações corporais, comparações temporais e marcadores anatômicos.
            </p>
          </div>
        </div>

        {/* Seletor de Paciente e Botão de Nova Avaliação */}
        <div className="flex items-center gap-3 flex-wrap max-w-lg w-full justify-end">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <label className="text-xs font-bold text-slate-500 whitespace-nowrap">
              {clientTermLabel}:
            </label>
            <select
              value={selectedPatientId}
              onChange={e => setSelectedPatientId(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {patients.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.cpf ? `(${p.cpf})` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setCreatingNew(true)}
            disabled={!selectedPatientId}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Avaliação</span>
          </button>
        </div>
      </div>

      {/* Barra de Ação de Comparação quando há seleções */}
      {selectedForCompare.length > 0 && (
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-4 rounded-2xl text-white flex items-center justify-between shadow-md animate-in fade-in">
          <div className="flex items-center gap-3 text-xs font-bold">
            <GitCompare className="w-5 h-5" />
            <span>
              {selectedForCompare.length} de 2 avaliações selecionadas para comparação temporal
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedForCompare([])}
              className="px-3 py-1.5 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-xl transition-colors cursor-pointer"
            >
              Limpar seleção
            </button>
            <button
              type="button"
              onClick={handleOpenComparison}
              disabled={selectedForCompare.length !== 2 || loadingCompare}
              className="px-4 py-1.5 text-xs font-bold bg-white text-teal-800 hover:bg-teal-50 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {loadingCompare ? 'Carregando...' : 'Comparar Avaliações'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de Avaliações Corporais Existentes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>Histórico de Mapas Corporais Realizados</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {assessments.length}
            </span>
          </h3>
          <span className="text-xs text-slate-400">
            Marque 2 caixas para comparar a evolução entre duas datas
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Carregando histórico de mapas corporais...
          </div>
        ) : assessments.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Activity className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Nenhum mapa corporal registrado</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Nenhuma avaliação corporal foi realizada para este paciente ainda. Clique em <strong>Nova Avaliação</strong> para iniciar um novo registro.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {assessments.map(item => {
              const isChecked = selectedForCompare.includes(item.id);
              return (
                <div
                  key={item.id}
                  className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    isChecked ? 'bg-teal-50/50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    {/* Checkbox de comparação */}
                    <button
                      type="button"
                      onClick={() => toggleSelectForCompare(item.id)}
                      className="mt-0.5 sm:mt-0 text-teal-600 hover:text-teal-700 cursor-pointer"
                      title="Selecionar para comparação"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300 hover:text-slate-400" />
                      )}
                    </button>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-teal-600" />
                          {item.assessment_date
                            ? new Date(item.assessment_date + 'T12:00:00').toLocaleDateString('pt-BR')
                            : 'Data não informada'}
                        </span>

                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Módulo: {item.module || 'Geral'}
                        </span>

                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                          Modelo: {item.body_model === 'male' ? 'Masculino' : 'Feminino'}
                        </span>

                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                          {item.total_markers || 0} marcadores
                        </span>

                        {item.total_views_drawn > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            Possui desenhos manuais
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500">
                        Profissional:{' '}
                        <strong className="text-slate-700">{item.professional_name || 'Profissional'}</strong>
                        {item.notes ? ` • Obs: "${item.notes}"` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => setViewingAssessment(item)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Visualizar / Editar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Visualização ou Edição */}
      {viewingAssessment && (
        <ZemdaBodyModal
          isOpen={!!viewingAssessment}
          onClose={() => {
            setViewingAssessment(null);
            if (selectedPatientId) fetchAssessments(selectedPatientId);
          }}
          patientId={viewingAssessment.patient_id}
          patientName={selectedPatient?.full_name}
          appointmentId={viewingAssessment.appointment_id}
          professionalId={viewingAssessment.professional_id}
          professionalName={viewingAssessment.professional_name}
          module={viewingAssessment.module}
          initialBodyModel={viewingAssessment.body_model}
          readOnly={false}
        />
      )}

      {/* Modal de Nova Avaliação */}
      {creatingNew && selectedPatient && (
        <ZemdaBodyModal
          isOpen={creatingNew}
          onClose={() => {
            setCreatingNew(false);
            if (selectedPatientId) fetchAssessments(selectedPatientId);
          }}
          patientId={selectedPatient.id}
          patientName={selectedPatient.full_name}
          module="general"
          readOnly={false}
        />
      )}

      {/* Modal de Comparação Lado a Lado de Duas Avaliações */}
      {comparingData && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in">
          <div className="bg-slate-50 rounded-3xl max-w-7xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header da Comparação */}
            <div className="p-4 sm:p-5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <GitCompare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Comparação Temporal de Mapas Corporais
                  </h3>
                  <p className="text-xs text-slate-500">
                    Paciente: <strong>{selectedPatient?.full_name}</strong> • Análise comparativa direta
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setComparingData(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo: Comparativo Lado a Lado */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Avaliação A */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Avaliação 1
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900 mt-1">
                      {comparingData.assessA.assessment?.assessment_date
                        ? new Date(comparingData.assessA.assessment.assessment_date + 'T12:00:00').toLocaleDateString('pt-BR')
                        : 'Data'}
                    </h4>
                  </div>
                  <span className="text-xs text-slate-500">
                    Prof.: {comparingData.assessA.assessment?.professional_name || 'Profissional'}
                  </span>
                </div>

                <div className="flex justify-center">
                  <ZemdaBodyCanvas
                    bodyModel={comparingData.assessA.assessment?.body_model || 'female'}
                    selectedRegions={
                      comparingData.assessA.markers?.map((m: any) => m.body_region) || []
                    }
                    onToggleRegion={() => {}}
                    tool="select"
                    drawings={comparingData.assessA.drawings?.front || []}
                    onSaveDrawings={() => {}}
                    readOnly={true}
                  />
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <strong>Anotações / Observações:</strong>
                  <p className="mt-1 italic">
                    {comparingData.assessA.assessment?.notes || 'Nenhuma observação registrada.'}
                  </p>
                </div>
              </div>

              {/* Avaliação B */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Avaliação 2
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900 mt-1">
                      {comparingData.assessB.assessment?.assessment_date
                        ? new Date(comparingData.assessB.assessment.assessment_date + 'T12:00:00').toLocaleDateString('pt-BR')
                        : 'Data'}
                    </h4>
                  </div>
                  <span className="text-xs text-slate-500">
                    Prof.: {comparingData.assessB.assessment?.professional_name || 'Profissional'}
                  </span>
                </div>

                <div className="flex justify-center">
                  <ZemdaBodyCanvas
                    bodyModel={comparingData.assessB.assessment?.body_model || 'female'}
                    selectedRegions={
                      comparingData.assessB.markers?.map((m: any) => m.body_region) || []
                    }
                    onToggleRegion={() => {}}
                    tool="select"
                    drawings={comparingData.assessB.drawings?.front || []}
                    onSaveDrawings={() => {}}
                    readOnly={true}
                  />
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <strong>Anotações / Observações:</strong>
                  <p className="mt-1 italic">
                    {comparingData.assessB.assessment?.notes || 'Nenhuma observação registrada.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
