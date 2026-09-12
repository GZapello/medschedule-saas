import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Download,
  Eye,
  RefreshCw,
  Users,
  Calendar,
  Layers,
  Sparkles,
  Search,
  Check,
  X,
  FileCheck
} from 'lucide-react';

interface ColumnMapping {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
}

interface TargetFieldDef {
  field: string;
  label: string;
  required: boolean;
}

interface DuplicateRowPreview {
  rowIndex: number;
  data: Record<string, string>;
  isDuplicate: boolean;
  matchedPatient: { id: string; full_name: string; cpf?: string; phone?: string } | null;
  matchReason: string;
  suggestedAction: 'update' | 'create_new' | 'skip';
}

interface ImportBatch {
  id: string;
  file_name: string;
  file_type: string;
  total_records: number;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  errors_json: string;
  imported_by_name?: string;
  created_at: string;
}

interface ImportDataViewProps {
  onNavigate?: (view: string) => void;
}

export const ImportDataView: React.FC<ImportDataViewProps> = ({ onNavigate }) => {
  const { currentTenant, isClinicAdmin } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Arquivo
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [parsing, setParsing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dados do Parse
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [availableFields, setAvailableFields] = useState<TargetFieldDef[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [previewRows, setPreviewRows] = useState<DuplicateRowPreview[]>([]);
  const [duplicateDecisions, setDuplicateDecisions] = useState<Record<number, 'update' | 'create_new' | 'skip'>>({});
  const [importHistoricalAppointments, setImportHistoricalAppointments] = useState<boolean>(true);

  // Execução
  const [executing, setExecuting] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [importResult, setImportResult] = useState<any | null>(null);

  // Histórico de Lotes
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Carregar lotes ao entrar na aba histórico
  useEffect(() => {
    if (activeTab === 'history') {
      fetchBatches();
    }
  }, [activeTab]);

  const fetchBatches = async () => {
    try {
      setLoadingBatches(true);
      const data = await ApiClient.get<ImportBatch[]>('/v1/import/batches');
      setBatches(data);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar histórico de importações', 'error');
    } finally {
      setLoadingBatches(false);
    }
  };

  // Leitura do Arquivo e Conversão Base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validExtensions = ['.docx', '.xlsx', '.xls', '.csv', '.txt'];
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
    if (!validExtensions.includes(ext)) {
      showToast('Formato inválido. Selecione um arquivo .docx, .xlsx, .csv ou .txt', 'error');
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || '';
      setFileBase64(base64);
    };
    reader.readAsDataURL(selectedFile);
  };

  // Enviar para API para Parse e Heurística
  const handleProcessFile = async () => {
    if (!file || !fileBase64) {
      showToast('Selecione um arquivo para continuar', 'error');
      return;
    }

    try {
      setParsing(true);
      const res = await ApiClient.post<any>('/v1/import/parse-file', {
        fileName: file.name,
        fileBase64
      });

      setHeaders(res.headers || []);
      setColumnMappings(res.columnMappings || []);
      setAvailableFields(res.availableTargetFields || []);
      setAllRows(res.allRows || []);
      setPreviewRows(res.previewRows || []);

      // Inicializa decisões de duplicata
      const decisions: Record<number, 'update' | 'create_new' | 'skip'> = {};
      (res.previewRows || []).forEach((row: DuplicateRowPreview) => {
        decisions[row.rowIndex] = row.suggestedAction;
      });
      setDuplicateDecisions(decisions);

      setCurrentStep(2);
      showToast('Arquivo analisado com sucesso! Revise o mapeamento de colunas.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao analisar arquivo', 'error');
    } finally {
      setParsing(false);
    }
  };

  // Atualizar mapeamento de coluna pelo usuário
  const handleMappingChange = (sourceCol: string, targetField: string | null) => {
    setColumnMappings(prev =>
      prev.map(m => (m.sourceColumn === sourceCol ? { ...m, targetField, confidence: targetField ? 100 : 0 } : m))
    );
  };

  // Atualizar decisão de duplicata individual
  const handleDecisionChange = (rowIndex: number, decision: 'update' | 'create_new' | 'skip') => {
    setDuplicateDecisions(prev => ({
      ...prev,
      [rowIndex]: decision
    }));
  };

  // Ações em massa para duplicatas
  const handleBulkDecision = (decision: 'update' | 'create_new' | 'skip') => {
    const updated = { ...duplicateDecisions };
    previewRows.forEach(row => {
      if (row.isDuplicate) {
        updated[row.rowIndex] = decision;
      }
    });
    setDuplicateDecisions(updated);
    showToast(`Aplicado "${decision === 'update' ? 'Atualizar existentes' : decision === 'create_new' ? 'Criar novos' : 'Ignorar'}" para todas as duplicatas.`, 'info');
  };

  // Executar Importação
  const handleExecuteImport = async () => {
    // Validar se 'full_name' está mapeado
    const hasName = columnMappings.some(m => m.targetField === 'full_name');
    if (!hasName) {
      showToast('O mapeamento da coluna "Nome Completo" é obrigatório.', 'error');
      setCurrentStep(2);
      return;
    }

    try {
      setExecuting(true);
      setCurrentStep(4);
      setProgressPercent(15);

      const timer = setInterval(() => {
        setProgressPercent(p => (p < 85 ? p + 15 : p));
      }, 400);

      const res = await ApiClient.post<any>('/v1/import/execute', {
        fileName: file?.name,
        fileType: file?.name.split('.').pop()?.toLowerCase(),
        columnMappings,
        rows: allRows,
        duplicateDecisions,
        importHistoricalAppointments
      });

      clearInterval(timer);
      setProgressPercent(100);
      setImportResult(res);
      setCurrentStep(5);
      showToast(res.message || 'Importação realizada com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro durante a importação', 'error');
      setCurrentStep(3);
    } finally {
      setExecuting(false);
    }
  };

  // Reverter Lote (Rollback)
  const handleRollbackBatch = async (batchId: string) => {
    if (!window.confirm(`Atenção: Deseja realmente reverter o lote #${batchId}? Todos os pacientes criados e consultas importadas nesta operação serão permanentemente removidos.`)) {
      return;
    }

    try {
      setRollingBackId(batchId);
      const res = await ApiClient.post<any>(`/v1/import/batches/${batchId}/rollback`);
      showToast(res.message || 'Lote revertido com sucesso!', 'success');
      if (activeTab === 'history') {
        fetchBatches();
      } else {
        resetImport();
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao reverter o lote', 'error');
    } finally {
      setRollingBackId(null);
    }
  };

  // Resetar para nova importação
  const resetImport = () => {
    setFile(null);
    setFileBase64('');
    setHeaders([]);
    setColumnMappings([]);
    setAllRows([]);
    setPreviewRows([]);
    setDuplicateDecisions({});
    setImportResult(null);
    setCurrentStep(1);
    setProgressPercent(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Baixar relatório de erros em CSV
  const downloadErrorReport = () => {
    if (!importResult?.errors || importResult.errors.length === 0) return;
    let csv = 'Linha,Paciente,Motivo_Erro\n';
    importResult.errors.forEach((e: any) => {
      csv += `"${e.row}","${e.patientName}","${e.reason}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `erros_importacao_${importResult.batchId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const duplicateRowsList = previewRows.filter(r => r.isDuplicate);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Importação Inteligente de Dados
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-teal-600" />
              IA Assistida
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Importe prontuários, fichas e cadastros de pacientes a partir de documentos Word (.docx), planilhas Excel (.xlsx) e tabelas CSV/TXT com mapeamento heurístico e resolução de duplicatas.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'import'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nova Importação
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Histórico de Lotes
          </button>
        </div>
      </div>

      {/* ABA 2: HISTÓRICO DE LOTES E ROLLBACK */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              Lotes Importados Anteriormente
            </h3>
            <button
              onClick={fetchBatches}
              disabled={loadingBatches}
              className="text-xs text-slate-600 hover:text-teal-600 flex items-center gap-1 font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBatches ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          {loadingBatches ? (
            <div className="py-12 text-center text-slate-400 text-xs">Carregando histórico...</div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Nenhum lote de importação registrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Identificador</th>
                    <th className="py-2.5 px-3">Arquivo Original</th>
                    <th className="py-2.5 px-3">Data / Hora</th>
                    <th className="py-2.5 px-3">Responsável</th>
                    <th className="py-2.5 px-3">Novos</th>
                    <th className="py-2.5 px-3">Atualizados</th>
                    <th className="py-2.5 px-3">Ignorados</th>
                    <th className="py-2.5 px-3">Erros</th>
                    <th className="py-2.5 px-3 text-right">Ação Reversão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-teal-700">#{b.id}</td>
                      <td className="py-3 px-3 font-medium text-slate-800 flex items-center gap-1.5">
                        {b.file_type === 'docx' ? (
                          <FileText className="w-4 h-4 text-blue-500" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        )}
                        {b.file_name}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(b.created_at).toLocaleDateString('pt-BR')} {new Date(b.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{b.imported_by_name || 'Administrador'}</td>
                      <td className="py-3 px-3 font-semibold text-emerald-600">+{b.imported_count}</td>
                      <td className="py-3 px-3 text-blue-600 font-medium">{b.updated_count}</td>
                      <td className="py-3 px-3 text-slate-400">{b.skipped_count}</td>
                      <td className="py-3 px-3 text-red-500 font-semibold">{b.error_count}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleRollbackBatch(b.id)}
                          disabled={rollingBackId === b.id}
                          className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <RotateCcw className={`w-3 h-3 ${rollingBackId === b.id ? 'animate-spin' : ''}`} />
                          {rollingBackId === b.id ? 'Revertendo...' : 'Reverter Lote'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ABA 1: FLUXO DE IMPORTAÇÃO PASSO A PASSO */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Barra de Progresso das Etapas */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between text-xs font-medium">
            <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-teal-600 font-bold' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep >= 1 ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-600'}`}>1</div>
              <span>Upload do Arquivo</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />

            <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-teal-600 font-bold' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep >= 2 ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-600'}`}>2</div>
              <span>Mapeamento de Colunas</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />

            <div className={`flex items-center gap-2 ${currentStep >= 3 ? 'text-teal-600 font-bold' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep >= 3 ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-600'}`}>3</div>
              <span>Resolução de Duplicatas</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />

            <div className={`flex items-center gap-2 ${currentStep >= 4 ? 'text-teal-600 font-bold' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep >= 4 ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-600'}`}>4</div>
              <span>Conclusão & Resumo</span>
            </div>
          </div>

          {/* PASSO 1: UPLOAD DE ARQUIVO (.docx, .xlsx, .csv, .txt) */}
          {currentStep === 1 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 space-y-6">
              <div className="text-center max-w-lg mx-auto space-y-2">
                <h3 className="text-base font-bold text-slate-900">Selecione o arquivo de prontuários ou pacientes</h3>
                <p className="text-xs text-slate-500">
                  Suportamos documentos Word com tabelas (<span className="font-mono text-slate-700">.docx</span>), planilhas Excel (<span className="font-mono text-slate-700">.xlsx</span>), tabelas separadas por vírgula (<span className="font-mono text-slate-700">.csv</span>) ou texto formatado (<span className="font-mono text-slate-700">.txt</span>).
                </p>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  file ? 'border-teal-500 bg-teal-50/30' : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="flex flex-col items-center gap-3">
                  <div className={`p-4 rounded-2xl ${file ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                    {file?.name.endsWith('.docx') ? (
                      <FileText className="w-10 h-10" />
                    ) : (
                      <UploadCloud className="w-10 h-10" />
                    )}
                  </div>

                  {file ? (
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{file.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(file.size / 1024).toFixed(1)} KB • Pronto para processamento
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">Clique para selecionar ou arraste o arquivo aqui</p>
                      <p className="text-xs text-slate-400 mt-1">DOCX, XLSX, XLS, CSV ou TXT (tamanho máx. 50MB)</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Opções de Importação Adicionais */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importHistoricalAppointments}
                    onChange={e => setImportHistoricalAppointments(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Importar histórico de consultas anteriores como atendimentos realizados
                    </p>
                    <p className="text-2xs text-slate-500">
                      Cria agendamentos históricos com status 'Concluído' sem disparar notificações por WhatsApp ou conflitar horários futuros.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                {file && (
                  <button
                    onClick={resetImport}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl"
                  >
                    Trocar Arquivo
                  </button>
                )}
                <button
                  onClick={handleProcessFile}
                  disabled={!file || parsing}
                  className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer"
                >
                  {parsing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Analisando Estrutura com IA...
                    </>
                  ) : (
                    <>
                      Continuar para Mapeamento
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* PASSO 2: MAPEAMENTO HEURÍSTICO INTERATIVO DE COLUNAS */}
          {currentStep === 2 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Mapeamento Inteligente de Campos</h3>
                  <p className="text-xs text-slate-500">
                    A IA identificou automaticamente os campos do seu arquivo. Você pode ajustar ou confirmar as associações abaixo.
                  </p>
                </div>
                <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                  {allRows.length} registros encontrados
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {columnMappings.map(mapping => {
                  const target = availableFields.find(f => f.field === mapping.targetField);
                  return (
                    <div
                      key={mapping.sourceColumn}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 font-mono truncate max-w-[180px]" title={mapping.sourceColumn}>
                          {mapping.sourceColumn}
                        </span>
                        {mapping.confidence > 0 && (
                          <span
                            className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                              mapping.confidence >= 90
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {mapping.confidence}% confiança
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-2xs text-slate-400 mb-1 font-medium">Mapear para o campo do Zemda:</label>
                        <select
                          value={mapping.targetField || ''}
                          onChange={e => handleMappingChange(mapping.sourceColumn, e.target.value || null)}
                          className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                        >
                          <option value="">-- Não importar esta coluna --</option>
                          {availableFields.map(f => (
                            <option key={f.field} value={f.field}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Amostra dos 2 primeiros valores */}
                      <div className="text-2xs text-slate-400 pt-1 truncate">
                        Exemplo:{' '}
                        <span className="text-slate-600 italic">
                          "{allRows[0]?.[mapping.sourceColumn] || '-'}"
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pré-visualização da Tabela Mapeada */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  Pré-visualização dos Primeiros Registros Mapeados
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-2xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        {columnMappings.filter(m => m.targetField).map(m => (
                          <th key={m.sourceColumn} className="p-2.5 whitespace-nowrap">
                            {availableFields.find(f => f.field === m.targetField)?.label || m.sourceColumn}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          {columnMappings.filter(m => m.targetField).map(m => (
                            <td key={m.sourceColumn} className="p-2.5 whitespace-nowrap text-slate-700">
                              {row[m.sourceColumn] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  Avançar para Duplicatas
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO 3: RESOLUÇÃO INTELIGENTE DE DUPLICATAS */}
          {currentStep === 3 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-teal-600" />
                    Detecção e Resolução de Duplicatas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Foram identificados <span className="font-bold text-amber-600">{duplicateRowsList.length} registros</span> já existentes na sua clínica (por CPF, Telefone, E-mail ou Nome).
                  </p>
                </div>

                {duplicateRowsList.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBulkDecision('update')}
                      className="px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
                    >
                      Atualizar Todos
                    </button>
                    <button
                      onClick={() => handleBulkDecision('skip')}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Ignorar Todos
                    </button>
                  </div>
                )}
              </div>

              {duplicateRowsList.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="text-sm font-bold text-emerald-900">Nenhuma duplicata detectada!</p>
                  <p className="text-xs text-emerald-700">
                    Todos os {allRows.length} registros do seu arquivo são novos e únicos no sistema da clínica.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {duplicateRowsList.map(row => {
                    const nameCol = columnMappings.find(m => m.targetField === 'full_name')?.sourceColumn;
                    const cpfCol = columnMappings.find(m => m.targetField === 'cpf')?.sourceColumn;
                    const phoneCol = columnMappings.find(m => m.targetField === 'phone')?.sourceColumn;

                    const rowName = nameCol ? row.data[nameCol] : 'Paciente';
                    const rowCpf = cpfCol ? row.data[cpfCol] : '';
                    const rowPhone = phoneCol ? row.data[phoneCol] : '';
                    const decision = duplicateDecisions[row.rowIndex] || 'update';

                    return (
                      <div
                        key={row.rowIndex}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">{rowName}</span>
                            <span className="px-2 py-0.5 rounded-full text-2xs font-semibold bg-amber-100 text-amber-800">
                              {row.matchReason}
                            </span>
                          </div>
                          <div className="text-2xs text-slate-500">
                            <strong>Arquivo:</strong> CPF: {rowCpf || '-'} | Tel: {rowPhone || '-'}
                            <br />
                            <strong>No Sistema:</strong> {row.matchedPatient?.full_name} (CPF: {row.matchedPatient?.cpf || '-'} | Tel: {row.matchedPatient?.phone || '-'})
                          </div>
                        </div>

                        {/* Botões de Ação para a linha */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleDecisionChange(row.rowIndex, 'update')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              decision === 'update'
                                ? 'bg-teal-600 text-white shadow-xs'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Atualizar
                          </button>
                          <button
                            onClick={() => handleDecisionChange(row.rowIndex, 'create_new')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              decision === 'create_new'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Criar Novo
                          </button>
                          <button
                            onClick={() => handleDecisionChange(row.rowIndex, 'skip')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              decision === 'skip'
                                ? 'bg-slate-700 text-white shadow-xs'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Ignorar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar ao Mapeamento
                </button>
                <button
                  onClick={handleExecuteImport}
                  className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  Confirmar e Iniciar Importação
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASSO 4: PROGRESSO DA EXECUÇÃO */}
          {currentStep === 4 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center space-y-6">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-14 h-14 bg-teal-50 border border-teal-200 text-teal-600 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
                  <RefreshCw className="w-7 h-7 animate-spin" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Processando e Gravando Registros...</h3>
                <p className="text-xs text-slate-500">
                  Transação atômica em andamento. Inserindo pacientes, atualizando duplicatas e vinculando atendimentos históricos com segurança.
                </p>

                {/* Barra de Progresso */}
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                  <div
                    className="bg-teal-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-600">{progressPercent}%</span>
              </div>
            </div>
          )}

          {/* PASSO 5: RESUMO FINAL DA IMPORTAÇÃO & DOWNLOAD DE LOG */}
          {currentStep === 5 && importResult && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Importação Concluída com Sucesso!</h3>
                <div className="inline-block px-3 py-1 bg-slate-100 text-slate-700 font-mono font-bold text-xs rounded-lg">
                  Lote #{importResult.batchId}
                </div>
              </div>

              {/* Cards de Métricas do Lote */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                  <span className="block text-2xl font-bold text-emerald-700">{importResult.importedCount}</span>
                  <span className="text-xs font-semibold text-emerald-900">Novos Pacientes</span>
                </div>
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-center">
                  <span className="block text-2xl font-bold text-blue-700">{importResult.updatedCount}</span>
                  <span className="text-xs font-semibold text-blue-900">Atualizados</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="block text-2xl font-bold text-slate-700">{importResult.skippedCount}</span>
                  <span className="text-xs font-semibold text-slate-600">Ignorados</span>
                </div>
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
                  <span className="block text-2xl font-bold text-red-700">{importResult.errorCount}</span>
                  <span className="text-xs font-semibold text-red-900">Erros</span>
                </div>
              </div>

              {/* Se houver erros, botão para baixar relatório */}
              {importResult.errorCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-xs font-bold text-red-800">
                      Algumas linhas não puderam ser importadas.
                    </span>
                  </div>
                  <button
                    onClick={downloadErrorReport}
                    className="px-3 py-1.5 text-xs font-semibold bg-white text-red-700 border border-red-300 rounded-lg hover:bg-red-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Relatório de Erros (.csv)
                  </button>
                </div>
              )}

              {/* Botões Finais */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                <button
                  onClick={() => handleRollbackBatch(importResult.batchId)}
                  className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reverter este lote (Desfazer)
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={resetImport}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                  >
                    Nova Importação
                  </button>
                  <button
                    onClick={() => onNavigate?.('patients')}
                    className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                  >
                    Ir para Lista de Pacientes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
