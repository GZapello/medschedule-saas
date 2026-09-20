import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ClinicalFileUploader, FileUploadedInfo } from './ClinicalFileUploader';
import {
  Plus,
  FileText,
  ShieldCheck,
  Calendar,
  User,
  Paperclip,
  Trash2,
  Edit2,
  ExternalLink,
  Download,
  AlertCircle,
  CheckCircle2,
  Info,
  Lock,
  Search,
  Filter
} from 'lucide-react';

export interface ExternalTest {
  id: string;
  tenantId: string;
  patientId: string;
  professionalId?: string;
  professionalName?: string;
  appointmentId?: string | null;
  moduleType: string;
  category: string;
  testName: string;
  testDate: string;
  referredBy?: string;
  resultSummary?: string;
  notes?: string;
  fileId?: string | null;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileUrl?: string | null;
  isSealed?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalTestsManagerProps {
  patientId: string;
  moduleType:
    | 'ZemdaPsico'
    | 'ZemdaFono'
    | 'ZemdaTO'
    | 'ZemdaNutri'
    | 'ZemdaFisio'
    | 'ZemdaOdonto'
    | 'ZemdaPP'
    | 'ZemdaPersonal'
    | string;
  appointmentId?: string;
  accentColor?: 'sky' | 'indigo' | 'purple' | 'emerald' | 'teal' | 'rose' | 'amber' | 'blue';
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
  className?: string;
}

const CATEGORY_OPTIONS = [
  'Teste/Instrumento Externo',
  'Documento Externo',
  'Protocolo',
  'Escala',
  'Planilha de Resultados',
  'Outro'
];

export const ExternalTestsManager: React.FC<ExternalTestsManagerProps> = ({
  patientId,
  moduleType,
  appointmentId,
  accentColor = 'sky',
  title = 'Testes Externos, Protocolos & Anexos',
  subtitle = 'Anexe testes escaneados, relatórios externos, protocolos, planilhas ou documentos recebidos de outras instituições.',
  readOnly = false,
  className = ''
}) => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [tests, setTests] = useState<ExternalTest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);

  // Form states
  const [formTestName, setFormTestName] = useState('');
  const [formCategory, setFormCategory] = useState('Teste/Instrumento Externo');
  const [formTestDate, setFormTestDate] = useState(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  );
  const [formProfessionalName, setFormProfessionalName] = useState(currentUser?.name || '');
  const [formReferredBy, setFormReferredBy] = useState('');
  const [formResultSummary, setFormResultSummary] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Anexo temporário selecionado no uploader
  const [attachedFileInfo, setAttachedFileInfo] = useState<{
    fileId?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    fileUrl?: string;
  } | null>(null);

  // Carrega testes
  const loadTests = async () => {
    if (!patientId) return;
    try {
      setLoading(true);
      const data = await ApiClient.get<ExternalTest[]>(
        `/v1/external-tests?patientId=${encodeURIComponent(patientId)}&moduleType=${encodeURIComponent(moduleType)}`
      );
      setTests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('[ExternalTestsManager] Erro ao carregar testes:', err);
      showToast('Erro ao carregar testes externos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTests();
  }, [patientId, moduleType]);

  const handleOpenNewModal = () => {
    setEditingTestId(null);
    setFormTestName('');
    setFormCategory('Teste/Instrumento Externo');
    setFormTestDate(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    );
    setFormProfessionalName(currentUser?.name || '');
    setFormReferredBy('');
    setFormResultSummary('');
    setFormNotes('');
    setAttachedFileInfo(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (test: ExternalTest) => {
    setEditingTestId(test.id);
    setFormTestName(test.testName || '');
    setFormCategory(test.category || 'Teste/Instrumento Externo');
    setFormTestDate(test.testDate || '');
    setFormProfessionalName(test.professionalName || currentUser?.name || '');
    setFormReferredBy(test.referredBy || '');
    setFormResultSummary(test.resultSummary || '');
    setFormNotes(test.notes || '');
    setAttachedFileInfo(
      test.fileId || test.fileName
        ? {
            fileId: test.fileId || undefined,
            fileName: test.fileName || undefined,
            fileType: test.fileType || undefined,
            fileSize: test.fileSize || undefined,
            fileUrl: test.fileUrl || undefined
          }
        : null
    );
    setIsModalOpen(true);
  };

  const handleSaveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    if (!formTestName.trim()) {
      showToast('Informe o nome do teste/instrumento', 'info');
      return;
    }

    try {
      setSaving(true);
      await ApiClient.post('/v1/external-tests', {
        id: editingTestId || undefined,
        patientId,
        appointmentId: appointmentId || undefined,
        moduleType,
        category: formCategory,
        testName: formTestName.trim(),
        testDate: formTestDate,
        professionalName: formProfessionalName.trim() || undefined,
        referredBy: formReferredBy.trim() || undefined,
        resultSummary: formResultSummary.trim() || undefined,
        notes: formNotes.trim() || undefined,
        fileId: attachedFileInfo?.fileId || undefined,
        fileName: attachedFileInfo?.fileName || undefined,
        fileType: attachedFileInfo?.fileType || undefined,
        fileSize: attachedFileInfo?.fileSize || undefined
      });

      showToast(editingTestId ? 'Teste externo atualizado com sucesso!' : 'Teste externo adicionado com sucesso!', 'success');
      setIsModalOpen(false);
      await loadTests();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar teste externo', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTest = async (test: ExternalTest) => {
    if (test.isSealed) {
      showToast('Este teste faz parte de um prontuário selado e não pode ser excluído.', 'info');
      return;
    }

    if (!window.confirm(`Deseja excluir o teste externo "${test.testName}"?`)) return;

    try {
      await ApiClient.delete(`/v1/external-tests/${test.id}`);
      setTests(prev => prev.filter(t => t.id !== test.id));
      showToast('Teste externo removido com sucesso', 'info');
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir teste externo', 'error');
    }
  };

  // Cores dinâmicas
  const getColorClasses = () => {
    switch (accentColor) {
      case 'indigo':
        return {
          btn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          border: 'border-indigo-200',
          badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          headerIcon: 'text-indigo-600'
        };
      case 'purple':
        return {
          btn: 'bg-purple-600 hover:bg-purple-700 text-white',
          border: 'border-purple-200',
          badge: 'bg-purple-50 text-purple-700 border-purple-200',
          headerIcon: 'text-purple-600'
        };
      case 'emerald':
        return {
          btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          border: 'border-emerald-200',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          headerIcon: 'text-emerald-600'
        };
      case 'teal':
        return {
          btn: 'bg-teal-600 hover:bg-teal-700 text-white',
          border: 'border-teal-200',
          badge: 'bg-teal-50 text-teal-700 border-teal-200',
          headerIcon: 'text-teal-600'
        };
      case 'rose':
        return {
          btn: 'bg-rose-600 hover:bg-rose-700 text-white',
          border: 'border-rose-200',
          badge: 'bg-rose-50 text-rose-700 border-rose-200',
          headerIcon: 'text-rose-600'
        };
      case 'amber':
        return {
          btn: 'bg-amber-600 hover:bg-amber-700 text-white',
          border: 'border-amber-200',
          badge: 'bg-amber-50 text-amber-800 border-amber-200',
          headerIcon: 'text-amber-600'
        };
      default:
        return {
          btn: 'bg-sky-600 hover:bg-sky-700 text-white',
          border: 'border-sky-200',
          badge: 'bg-sky-50 text-sky-800 border-sky-200',
          headerIcon: 'text-sky-600'
        };
    }
  };

  const colors = getColorClasses();

  return (
    <div className={`bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6 ${className}`}>
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <FileText className={`w-5 h-5 ${colors.headerIcon}`} />
            <span>{title}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={handleOpenNewModal}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer ${colors.btn}`}
          >
            <Plus className="w-4 h-4" />
            <span>+ Adicionar Teste Externo</span>
          </button>
        )}
      </div>

      {/* Alerta Ético SATEPSI para Módulo de Psicologia */}
      {moduleType === 'ZemdaPsico' && (
        <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="block font-bold">Diretrizes Éticas e Resguardo CFP / SATEPSI</strong>
            <p className="leading-relaxed text-[11px] text-amber-800">
              Em conformidade com as resoluções do CFP e SATEPSI, este registro armazena anexos, laudos e documentos externos sob sigilo profissional. O Zemda não reproduz nem interpreta automaticamente itens de testes psicológicos privativos.
            </p>
          </div>
        </div>
      )}

      {/* Lista de Testes Cadastrados */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          Carregando testes e anexos...
        </div>
      ) : tests.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2 text-xs text-slate-400">
          <Paperclip className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-600">Nenhum teste externo ou anexo registrado para este paciente.</p>
          <p className="text-[11px]">
            Clique em <strong>[ + Adicionar Teste Externo ]</strong> para anexar relatórios, fotos de protocolos, planilhas ou documentos recebidos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map(test => (
            <div
              key={test.id}
              className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-2xs space-y-3"
            >
              {/* Topo do Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900">{test.testName}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors.badge}`}>
                    {test.category}
                  </span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {test.testDate ? new Date(test.testDate).toLocaleDateString('pt-BR') : 'Data n/d'}
                  </span>
                  {test.referredBy && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      Origem / Encaminhado por: {test.referredBy}
                    </span>
                  )}
                  {test.isSealed && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Selado
                    </span>
                  )}
                </div>

                {!readOnly && (
                  <div className="flex items-center gap-1">
                    {!test.isSealed && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(test)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Editar dados"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!test.isSealed && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTest(test)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remover teste"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Resultado / Síntese */}
              {test.resultSummary && (
                <div className="text-xs bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100 text-emerald-900">
                  <strong className="font-bold text-emerald-800">Resultado / Síntese: </strong>
                  <span>{test.resultSummary}</span>
                </div>
              )}

              {/* Observações / Parecer */}
              {test.notes && (
                <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-slate-700 leading-relaxed">
                  <strong className="font-bold text-slate-800">Observações: </strong>
                  <span>{test.notes}</span>
                </div>
              )}

              {/* Visualização do Arquivo Anexado Integrado com ClinicalFileUploader */}
              {(test.fileId || test.fileUrl || test.fileName) && (
                <div className="pt-1">
                  <ClinicalFileUploader
                    patientId={patientId}
                    appointmentId={test.appointmentId || undefined}
                    category="clinical_tests"
                    moduleType={moduleType}
                    initialFileId={test.fileId || undefined}
                    initialUrl={test.fileUrl || undefined}
                    initialFilename={test.fileName || undefined}
                    initialMimeType={test.fileType || undefined}
                    initialFileSize={test.fileSize || undefined}
                    disabled={true}
                    isSealed={test.isSealed || readOnly}
                    label="Arquivo / Documento Anexado:"
                  />
                </div>
              )}

              {/* Rodapé: Profissional que registrou */}
              {test.professionalName && (
                <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    Responsável: <strong>{test.professionalName}</strong>
                  </span>
                  <span>Registrado em {new Date(test.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Cabeçalho do Modal */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className={`w-4 h-4 ${colors.headerIcon}`} />
                  <span>{editingTestId ? 'Editar Teste Externo' : 'Adicionar Teste Externo'}</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Preencha as informações do teste/instrumento e anexe o documento ou imagem correspondente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo do Formulário */}
            <form onSubmit={handleSaveTest} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Nome do Teste */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome do Teste / Instrumento *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Escala Vineland, TDE-II, Relatório Neuropsicológico, Protocolo Pollock..."
                    value={formTestName}
                    onChange={e => setFormTestName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {/* Tipo / Categoria */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tipo / Categoria *
                  </label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                  >
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Data de Aplicação */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data de Aplicação *
                  </label>
                  <input
                    type="date"
                    required
                    value={formTestDate}
                    onChange={e => setFormTestDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {/* Profissional Responsável */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Profissional Responsável
                  </label>
                  <input
                    type="text"
                    placeholder="Nome do profissional..."
                    value={formProfessionalName}
                    onChange={e => setFormProfessionalName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {/* Encaminhado por / Origem */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Encaminhado por / Instituição de Origem
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Escola, Neurologista, Clínica anterior..."
                    value={formReferredBy}
                    onChange={e => setFormReferredBy(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Resultado / Síntese */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Resultado / Síntese
                </label>
                <input
                  type="text"
                  placeholder="Ex: Escore Z -1.5, Percentil 70, Dentro dos limites esperados, TAV Nível 4..."
                  value={formResultSummary}
                  onChange={e => setFormResultSummary(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Observações Clínicas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações Clínicas
                </label>
                <textarea
                  rows={2}
                  placeholder="Anotações contextuais sobre a aplicação ou interpretação do documento..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Uploader de Anexo com Suporte Universal a JPG, PNG, PDF, DOCX, XLSX, CSV */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="block text-xs font-bold text-slate-700">
                  Arquivo Anexado (Foto, Escaneamento, PDF, Word, Excel ou CSV):
                </span>
                <ClinicalFileUploader
                  patientId={patientId}
                  appointmentId={appointmentId}
                  category="clinical_tests"
                  moduleType={moduleType}
                  initialFileId={attachedFileInfo?.fileId}
                  initialUrl={attachedFileInfo?.fileUrl}
                  initialFilename={attachedFileInfo?.fileName}
                  initialMimeType={attachedFileInfo?.fileType}
                  initialFileSize={attachedFileInfo?.fileSize}
                  label=""
                  buttonText="+ Selecionar Arquivo do Teste"
                  onUploaded={(fileInfo: FileUploadedInfo) => {
                    setAttachedFileInfo({
                      fileId: fileInfo.id || fileInfo.fileId,
                      fileName: fileInfo.originalFilename || fileInfo.filename,
                      fileType: fileInfo.mimeType,
                      fileSize: fileInfo.fileSize,
                      fileUrl: fileInfo.url
                    });
                  }}
                  onRemoved={() => {
                    setAttachedFileInfo(null);
                  }}
                />
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-5 py-2 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${colors.btn}`}
                >
                  {saving ? 'Salvando...' : editingTestId ? 'Salvar Alterações' : 'Adicionar Teste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
