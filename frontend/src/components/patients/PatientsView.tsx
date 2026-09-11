import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Patient } from '../../types';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  Baby,
  Calendar,
  Shield,
  X,
  CheckCircle2,
  FileText
} from 'lucide-react';

interface PatientsViewProps {
  onOpenNewPatient: () => void;
}

export const PatientsView: React.FC<PatientsViewProps> = ({ onOpenNewPatient }) => {
  const { clientTermLabel } = useAuth();
  const { showToast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const url = searchTerm ? `/v1/patients?search=${encodeURIComponent(searchTerm)}` : '/v1/patients';
      const data = await ApiClient.get<Patient[]>(url);
      setPatients(data);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar lista de pacientes', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [searchTerm]);

  const handleOpenDetail = async (patientId: string) => {
    try {
      const data = await ApiClient.get<any>(`/v1/patients/${patientId}`);
      setSelectedPatient(data);
    } catch (err: any) {
      showToast('Erro ao carregar detalhes do paciente', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Gestão de {clientTermLabel}s
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastros completos, contatos de emergência e responsáveis legais para menores.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={`Buscar ${clientTermLabel.toLowerCase()}...`}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={onOpenNewPatient}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Novo {clientTermLabel}
          </button>
        </div>
      </div>

      {/* Table List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-6 py-3.5">{clientTermLabel}</th>
                <th className="px-6 py-3.5">Telefone / WhatsApp</th>
                <th className="px-6 py-3.5">E-mail</th>
                <th className="px-6 py-3.5">Perfil</th>
                <th className="px-6 py-3.5 text-center">Atendimentos</th>
                <th className="px-6 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Nenhum {clientTermLabel.toLowerCase()} encontrado.
                  </td>
                </tr>
              ) : (
                patients.map(p => (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    onClick={() => handleOpenDetail(p.id)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{p.full_name}</div>
                      {p.cpf && <div className="text-[11px] text-slate-400">CPF: {p.cpf}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                        <Phone className="w-3.5 h-3.5 text-teal-600" />
                        {p.phone}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{p.email || '—'}</td>
                    <td className="px-6 py-4">
                      {p.is_child ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">
                          <Baby className="w-3 h-3" /> Pediátrico / Menor
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          Adulto
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-slate-800">
                      {p.total_appointments || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(p.id);
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patient Details Drawer / Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase">Ficha Cadastral</span>
                <h3 className="text-xl font-bold text-slate-900">{selectedPatient.patient.full_name}</h3>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-slate-400 font-medium">WhatsApp / Telefone:</span>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.patient.phone}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">E-mail:</span>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.patient.email || 'Não informado'}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Data de Nascimento:</span>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.patient.birth_date || 'Não informada'}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">CPF:</span>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedPatient.patient.cpf || 'Não informado'}</p>
                </div>
              </div>

              {/* Responsáveis Legais se Pediátrico */}
              {selectedPatient.patient.is_child === 1 && (
                <div className="p-4 bg-pink-50/60 rounded-2xl border border-pink-100 space-y-2">
                  <h4 className="font-bold text-pink-900 text-xs flex items-center gap-1.5">
                    <Baby className="w-4 h-4" /> Responsáveis Legais Registrados
                  </h4>
                  {(selectedPatient.guardians || []).map((g: any) => (
                    <div key={g.id} className="bg-white p-2.5 rounded-xl border border-pink-200 text-slate-700">
                      <div className="font-bold text-slate-900">{g.full_name} ({g.relationship})</div>
                      <div className="text-slate-500 mt-0.5">Telefone: {g.phone} • CPF: {g.cpf || '—'}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Histórico Recente */}
              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                  Histórico Recente de Atendimentos
                </h4>
                {(selectedPatient.recentAppointments || []).length === 0 ? (
                  <p className="text-slate-400 italic">Nenhum atendimento anterior registrado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedPatient.recentAppointments.map((a: any) => (
                      <div key={a.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{a.service_name}</div>
                          <div className="text-slate-400 text-[11px]">{a.professional_name} • {a.start_time.split('T')[0]}</div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
