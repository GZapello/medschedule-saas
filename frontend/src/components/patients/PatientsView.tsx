import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Patient } from '../../types';
import { PatientProfileModal } from './PatientProfileModal';
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
  FileText,
  UploadCloud
} from 'lucide-react';

interface PatientsViewProps {
  onOpenNewPatient: () => void;
  onNavigate?: (view: string) => void;
}

export const PatientsView: React.FC<PatientsViewProps> = ({ onOpenNewPatient, onNavigate }) => {
  const { clientTermLabel } = useAuth();
  const { showToast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

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

  const handleOpenDetail = (patientId: string) => {
    setSelectedPatientId(patientId);
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

          {onNavigate && (
            <button
              onClick={() => onNavigate('import')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all whitespace-nowrap cursor-pointer"
              title="Importar de Word (.docx) ou Planilhas (.xlsx/.csv)"
            >
              <UploadCloud className="w-4 h-4 text-teal-600" />
              Importar
            </button>
          )}

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

      {/* Complete 360 Patient Profile Modal */}
      {selectedPatientId && (
        <PatientProfileModal
          patientId={selectedPatientId}
          onClose={() => setSelectedPatientId(null)}
          onUpdated={fetchPatients}
        />
      )}
    </div>
  );
};
