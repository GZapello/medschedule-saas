import React, { useState } from 'react';
import { X, Printer, FileText, Download, Dumbbell, Activity, Check } from 'lucide-react';
import { Student, Workout, Assessment } from './types';
import { useAuth } from '../../context/AuthContext';

interface PersonalPdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  workouts: Workout[];
  latestAssessment?: Assessment | null;
}

export const PersonalPdfExportModal: React.FC<PersonalPdfExportModalProps> = ({
  isOpen,
  onClose,
  student,
  workouts,
  latestAssessment
}) => {
  const { currentTenant, currentUser } = useAuth();
  const [exportType, setExportType] = useState<'full_workout' | 'compact_workout' | 'assessment_report'>('full_workout');

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header no Modal (oculto na impressão) */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Exportação & Impressão PDF</h3>
              <p className="text-xs text-slate-500">
                Gere fichas de treino diagramadas ou laudos completos de avaliação física.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar em PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Seletor de Modelo (oculto na impressão) */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-2 print:hidden">
          <span className="text-xs font-semibold text-slate-500">Modelo do Documento:</span>
          <button
            onClick={() => setExportType('full_workout')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
              exportType === 'full_workout' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Ficha Completa de Treino (com Fotos)
          </button>
          <button
            onClick={() => setExportType('compact_workout')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
              exportType === 'compact_workout' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Ficha Compacta (Prancheta)
          </button>
          <button
            onClick={() => setExportType('assessment_report')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
              exportType === 'assessment_report' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Relatório de Avaliação Física
          </button>
        </div>

        {/* Folha de Pré-visualização / Impressão */}
        <div className="p-8 overflow-y-auto flex-1 bg-slate-100/50 print:p-0 print:bg-white">
          <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-full space-y-6">
            {/* Cabeçalho Oficial */}
            <div className="flex items-center justify-between pb-4 border-b-2 border-slate-800">
              <div>
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {currentTenant?.name || 'Zemda Saúde & Treinamento'}
                </h1>
                <p className="text-xs text-slate-600">
                  Módulo ZemdaPersonal • Prescrição Técnica de Treinamento
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>Data: {new Date().toLocaleDateString('pt-BR')}</div>
                <div>Treinador: {currentUser?.name || 'Personal Trainer'}</div>
              </div>
            </div>

            {/* Ficha do Aluno */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Aluno</span>
                <strong className="text-slate-800">{student.name}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Objetivo</span>
                <strong className="text-slate-800">{student.goal || 'Hipertrofia / Saúde'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Peso / Altura</span>
                <strong className="text-slate-800">
                  {student.current_weight ? `${student.current_weight} kg` : '—'} /{' '}
                  {student.height ? `${student.height} cm` : '—'}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Frequência</span>
                <strong className="text-slate-800">{student.weekly_frequency || 3}x por semana</strong>
              </div>
            </div>

            {/* Conteúdo: Ficha de Treino */}
            {(exportType === 'full_workout' || exportType === 'compact_workout') && (
              <div className="space-y-6">
                {workouts.map((w) => (
                  <div key={w.id} className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm bg-emerald-500 px-2 py-0.5 rounded-lg text-slate-950">
                          {w.division}
                        </span>
                        <h4 className="font-bold text-sm">{w.title}</h4>
                      </div>
                      <span className="text-xs text-slate-300">{w.structure_type || 'Rotina Personal'}</span>
                    </div>

                    {w.notes && (
                      <p className="text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {w.notes}
                      </p>
                    )}

                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                          <th className="py-2 px-2">#</th>
                          {exportType === 'full_workout' && <th className="py-2 px-2">Foto</th>}
                          <th className="py-2 px-2">Exercício</th>
                          <th className="py-2 px-2 text-center">Séries</th>
                          <th className="py-2 px-2 text-center">Reps</th>
                          <th className="py-2 px-2 text-center">Carga</th>
                          <th className="py-2 px-2 text-center">Descanso</th>
                          <th className="py-2 px-2 text-center">Cadência</th>
                          <th className="py-2 px-2">Método</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {w.exercises?.map((ex, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-2 font-bold text-slate-400">{idx + 1}</td>
                            {exportType === 'full_workout' && (
                              <td className="py-1 px-2">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center">
                                  {ex.photo_url ? (
                                    <img src={ex.photo_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <Dumbbell className="w-3.5 h-3.5 text-slate-300" />
                                  )}
                                </div>
                              </td>
                            )}
                            <td className="py-2 px-2 font-bold text-slate-800">
                              {ex.name}
                              {ex.notes && <span className="block text-[10px] font-normal text-slate-500">{ex.notes}</span>}
                            </td>
                            <td className="py-2 px-2 text-center font-bold text-slate-800">{ex.sets}</td>
                            <td className="py-2 px-2 text-center text-slate-700">{ex.reps}</td>
                            <td className="py-2 px-2 text-center font-bold text-emerald-700">{ex.load_kg ? `${ex.load_kg}kg` : '—'}</td>
                            <td className="py-2 px-2 text-center text-slate-600">{ex.rest_seconds}s</td>
                            <td className="py-2 px-2 text-center text-slate-600">{ex.cadence || '—'}</td>
                            <td className="py-2 px-2 font-semibold text-slate-700">{ex.technique || 'Direta'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* Conteúdo: Relatório de Avaliação Física */}
            {exportType === 'assessment_report' && latestAssessment && (
              <div className="space-y-6">
                <div className="bg-purple-900 text-white p-4 rounded-xl flex items-center justify-between">
                  <h4 className="font-bold text-sm">Avaliação Física de {new Date(latestAssessment.assessment_date).toLocaleDateString('pt-BR')}</h4>
                  <span className="text-xs text-purple-200">Protocolo: {latestAssessment.protocol || 'Pollock 7'}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Peso Total</span>
                    <strong className="text-lg text-slate-800">{latestAssessment.weight} kg</strong>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-amber-700 uppercase font-bold block">% Gordura</span>
                    <strong className="text-lg text-amber-800">{latestAssessment.body_fat_percentage}%</strong>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[10px] text-emerald-700 uppercase font-bold block">Massa Magra</span>
                    <strong className="text-lg text-emerald-800">{latestAssessment.lean_mass_kg} kg</strong>
                  </div>
                  <div className="bg-cyan-50 p-3 rounded-xl border border-cyan-200">
                    <span className="text-[10px] text-cyan-700 uppercase font-bold block">Massa Muscular (Est.)</span>
                    <strong className="text-lg text-cyan-800">{latestAssessment.muscle_mass_kg} kg</strong>
                  </div>
                </div>

                {/* Perímetros */}
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Perímetros Corporais (cm)</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 bg-slate-50 rounded-lg">Tórax: <strong>{latestAssessment.chest_cm || '—'} cm</strong></div>
                    <div className="p-2 bg-slate-50 rounded-lg">Cintura: <strong>{latestAssessment.waist_cm || '—'} cm</strong></div>
                    <div className="p-2 bg-slate-50 rounded-lg">Abdômen: <strong>{latestAssessment.abdomen_cm || '—'} cm</strong></div>
                    <div className="p-2 bg-slate-50 rounded-lg">Quadril: <strong>{latestAssessment.hip_cm || '—'} cm</strong></div>
                    <div className="p-2 bg-slate-50 rounded-lg">Braço Dir. (Contraído): <strong>{latestAssessment.arm_right_flexed || '—'} cm</strong></div>
                    <div className="p-2 bg-slate-50 rounded-lg">Braço Esq. (Contraído): <strong>{latestAssessment.arm_left_flexed || '—'} cm</strong></div>
                    <div className="p-2 bg-slate-50 rounded-lg">Coxa Dir.: <strong>{latestAssessment.thigh_right_med || '—'} cm</strong></div>
                    <div className="p-2 bg-slate-50 rounded-lg">Panturrilha Dir.: <strong>{latestAssessment.calf_right || '—'} cm</strong></div>
                  </div>
                </div>

                {latestAssessment.notes && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <strong className="block text-[10px] uppercase text-slate-500 mb-1">Parecer do Avaliador</strong>
                    <p className="text-slate-700 italic">{latestAssessment.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Rodapé de Assinatura */}
            <div className="pt-12 flex items-center justify-between text-xs text-slate-500 border-t border-slate-200">
              <div className="text-center w-64 border-t border-slate-400 pt-1">
                <strong>{currentUser?.name || 'Personal Trainer'}</strong>
                <div className="text-[10px]">CREF / Responsável Técnico</div>
              </div>
              <div className="text-center w-64 border-t border-slate-400 pt-1">
                <strong>{student.name}</strong>
                <div className="text-[10px]">Assinatura do Aluno</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
