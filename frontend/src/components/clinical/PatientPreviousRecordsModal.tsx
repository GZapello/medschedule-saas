import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  FileText,
  X,
  Search,
  Printer,
  Calendar,
  User,
  ShieldCheck,
  Lock,
  Clock,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface PatientPreviousRecordsModalProps {
  isOpen?: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

interface ClinicalRecordItem {
  id: string;
  patient_id: string;
  professional_id: string;
  professional_name?: string;
  profession_name?: string;
  specialty_or_module?: string;
  title: string;
  clinical_evolution: string;
  conduct_plan?: string;
  consultation_date: string;
  consultation_time?: string;
  is_sealed: number;
  sealed_at?: string;
  signature_hash?: string;
  signed_at?: string;
  signer_name?: string;
  signer_registration?: string;
  created_at: string;
}

export const PatientPreviousRecordsModal: React.FC<PatientPreviousRecordsModalProps> = ({
  isOpen = true,
  onClose,
  patientId,
  patientName
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(false);
  const [records, setRecords] = useState<ClinicalRecordItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && patientId) {
      setLoading(true);
      setSelectedRecordId(null);
      ApiClient.get<ClinicalRecordItem[]>(`/v1/clinical-records/patient/${patientId}`)
        .then(data => {
          const list = Array.isArray(data) ? data : [];
          // Ordena da mais recente para a mais antiga
          list.sort((a, b) => {
            const dateA = new Date((a.consultation_date || a.created_at || '').replace(' ', 'T')).getTime();
            const dateB = new Date((b.consultation_date || b.created_at || '').replace(' ', 'T')).getTime();
            return dateB - dateA;
          });
          setRecords(list);
          if (list.length > 0) {
            setSelectedRecordId(list[0].id);
          }
        })
        .catch(err => {
          console.error('Erro ao carregar prontuários anteriores:', err);
          showToast('Erro ao consultar histórico de prontuários', 'error');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, patientId]);

  if (!isOpen) return null;

  const filteredRecords = records.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.title || '').toLowerCase().includes(term) ||
      (r.clinical_evolution || '').toLowerCase().includes(term) ||
      (r.professional_name || '').toLowerCase().includes(term) ||
      (r.specialty_or_module || '').toLowerCase().includes(term) ||
      (r.consultation_date || '').includes(term)
    );
  });

  const selectedRecord = records.find(r => r.id === selectedRecordId) || filteredRecords[0] || null;

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const clean = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
      return new Date(clean).toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static"
      role="dialog"
      aria-modal="true"
      aria-label="Histórico de Prontuários Anteriores"
    >
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full">
        {/* Header do Modal */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/80 border border-indigo-400/40 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                Prontuários & Evoluções Anteriores
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Somente Leitura
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Paciente: <strong className="text-white font-bold">{patientName || 'Selecionado'}</strong> • {records.length} {records.length === 1 ? 'registro encontrado' : 'registros encontrados'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={records.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all cursor-pointer disabled:opacity-40"
              title="Imprimir ou salvar em PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              title="Fechar prontuários anteriores"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Busca rápida */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3 print:hidden">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por termo na evolução, conduta, profissional ou data..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2 py-1"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Conteúdo com Layout Dividido: Lista à Esquerda e Detalhe à Direita */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Coluna da Esquerda: Lista de Evoluções */}
          <div className="md:col-span-5 border-r border-slate-200 overflow-y-auto max-h-[58vh] md:max-h-[68vh] p-3 space-y-2 bg-slate-50/50 print:hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <Clock className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-2" />
                Carregando histórico do prontuário…
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                {searchTerm ? 'Nenhuma evolução corresponde à busca.' : 'Nenhum prontuário anterior registrado para este paciente.'}
              </div>
            ) : (
              filteredRecords.map(rec => {
                const isSelected = selectedRecord?.id === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedRecordId(rec.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-100/70 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-600" />
                        {formatDate(rec.consultation_date || rec.created_at)}
                        {rec.consultation_time && <span className="text-slate-500 font-normal">às {rec.consultation_time}</span>}
                      </span>

                      {rec.is_sealed === 1 || rec.sealed_at ? (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Lock className="w-2.5 h-2.5" /> Lacrado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Rascunho
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-slate-800 line-clamp-1">
                      {rec.title || 'Evolução Clínica'}
                    </h4>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="truncate">{rec.professional_name || 'Profissional'}</span>
                      {rec.specialty_or_module && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                          {rec.specialty_or_module}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                      {rec.clinical_evolution || 'Sem texto de evolução.'}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Coluna da Direita: Leitura Completa e Detalhes */}
          <div className="md:col-span-7 overflow-y-auto max-h-[68vh] p-5 sm:p-6 bg-white space-y-4 print:max-h-none print:p-0">
            {selectedRecord ? (
              <div className="space-y-4">
                {/* Cabeçalho da Evolução */}
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Consulta em {formatDate(selectedRecord.consultation_date || selectedRecord.created_at)}
                      {selectedRecord.consultation_time && ` às ${selectedRecord.consultation_time}`}
                    </span>

                    <div className="flex items-center gap-2">
                      {selectedRecord.specialty_or_module && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {selectedRecord.specialty_or_module}
                        </span>
                      )}
                      {selectedRecord.is_sealed === 1 || selectedRecord.sealed_at ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Lock className="w-3 h-3" /> Prontuário Lacrado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Em Aberto
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-lg font-black text-slate-900 tracking-tight mt-2">
                    {selectedRecord.title || 'Evolução Clínica'}
                  </h3>

                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Responsável: <strong className="text-slate-700 font-semibold">{selectedRecord.professional_name || 'Profissional'}</strong>
                    {selectedRecord.profession_name && ` (${selectedRecord.profession_name})`}
                  </p>
                </div>

                {/* Texto da Evolução Clínica */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Evolução Clínica & Observações
                  </h4>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans shadow-inner">
                    {selectedRecord.clinical_evolution || 'Sem registro detalhado de evolução.'}
                  </div>
                </div>

                {/* Conduta Terapêutica / Próximos Passos */}
                {selectedRecord.conduct_plan && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Conduta Terapêutica & Recomendações
                    </h4>
                    <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {selectedRecord.conduct_plan}
                    </div>
                  </div>
                )}

                {/* Bloco de Assinatura Digital e Lacre */}
                {(selectedRecord.signature_hash || selectedRecord.signer_name) && (
                  <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Assinado e Certificado Digitalmente</span>
                    </div>
                    {selectedRecord.signer_name && (
                      <p>
                        Assinado por: <strong>{selectedRecord.signer_name}</strong>
                        {selectedRecord.signer_registration && ` (${selectedRecord.signer_registration})`}
                      </p>
                    )}
                    {selectedRecord.signed_at && (
                      <p className="text-[11px] text-emerald-800/80">
                        Data e hora do registro: {formatDate(selectedRecord.signed_at)}
                      </p>
                    )}
                    {selectedRecord.signature_hash && (
                      <p className="text-[10px] text-slate-400 font-mono break-all pt-1">
                        HASH: {selectedRecord.signature_hash}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-8 text-center text-xs text-slate-400">
                Selecione uma evolução à esquerda para visualizar todos os detalhes.
              </div>
            )}
          </div>
        </div>

        {/* Rodapé informativo */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 print:hidden">
          <span className="text-[11px]">
            Registros protegidos e inalteráveis conforme normas do CFM / Conselhos de Saúde e LGPD.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors cursor-pointer text-xs"
          >
            Voltar ao Atendimento
          </button>
        </div>
      </div>
    </div>
  );
};
