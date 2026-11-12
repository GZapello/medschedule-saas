import React, { useState, useEffect, useCallback } from 'react';
import { ApiClient as api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  PreConsultationBodyMapSimple,
  PatientBodyMapRegion
} from './PreConsultationBodyMapSimple';
import {
  FileText,
  Plus,
  Copy,
  Archive,
  Edit3,
  X,
  Check,
  Share2,
  Link2,
  ShieldAlert,
  Activity,
  ArrowUp,
  ArrowDown,
  Trash2,
  Send,
  RefreshCw,
  Ban,
  CheckCircle2,
  Clock
} from 'lucide-react';

export interface PreConsultationFieldItem {
  id: string;
  type:
    | 'short_text'
    | 'long_text'
    | 'single_choice'
    | 'multiple_choice'
    | 'checkbox'
    | 'scale'
    | 'date'
    | 'file'
    | 'image'
    | 'zemda360_body_map';
  label: string;
  instructions?: string;
  required?: boolean;
  order: number;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

export interface PreConsultationFormTemplate {
  id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  purpose?: string | null;
  profession_id?: string | null;
  visibility: 'clinic' | 'private';
  include_zemda360_body_map: boolean;
  version: number;
  status: 'active' | 'archived';
  total_submissions?: number;
  fields: PreConsultationFieldItem[];
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  single_choice: 'Seleção única',
  multiple_choice: 'Múltipla escolha',
  checkbox: 'Caixa de confirmação (Sim/Não)',
  scale: 'Escala numérica (0 a 10)',
  date: 'Data',
  file: 'Arquivo ou imagem opcional',
  zemda360_body_map: 'Mapa corporal — Zemda360'
};

export const PRE_CONSULTATION_BADGE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  not_sent: {
    label: 'Formulário não enviado',
    className: 'bg-slate-100 text-slate-600 border-slate-200'
  },
  pending: {
    label: 'Aguardando resposta',
    className: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  submitted: {
    label: 'Respondido',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  responded: {
    label: 'Respondido',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  expired: {
    label: 'Expirado',
    className: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  revoked: {
    label: 'Link revogado',
    className: 'bg-slate-100 text-slate-500 border-slate-200'
  }
};

/**
 * 4.1. Modal da Biblioteca "Formulários de Pré-consulta"
 */
export const PreConsultationFormsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [forms, setForms] = useState<PreConsultationFormTemplate[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canUseBodyMap, setCanUseBodyMap] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);

  // Estado de edição / criação
  const [editingForm, setEditingForm] = useState<PreConsultationFormTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [visibility, setVisibility] = useState<'clinic' | 'private'>('clinic');
  const [includeBodyMap, setIncludeBodyMap] = useState(false);
  const [fields, setFields] = useState<PreConsultationFieldItem[]>([]);
  const [saving, setSaving] = useState(false);

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{
        forms: PreConsultationFormTemplate[];
        permissions: {
          canManageForms: boolean;
          canUseZemda360BodyMap: boolean;
        };
      }>(`/v1/pre-consultation/forms?includeArchived=${showArchived ? '1' : '0'}`);
      setForms(res.forms || []);
      setCanManage(Boolean(res.permissions?.canManageForms));
      setCanUseBodyMap(Boolean(res.permissions?.canUseZemda360BodyMap));
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar Formulários de Pré-consulta', 'error');
    } finally {
      setLoading(false);
    }
  }, [showArchived, showToast]);

  useEffect(() => {
    if (isOpen) {
      loadForms();
    }
  }, [isOpen, loadForms]);

  if (!isOpen) return null;

  const startCreate = () => {
    setEditingForm(null);
    setIsCreating(true);
    setTitle('');
    setPurpose('Primeira Consulta');
    setDescription('');
    setInstructions('Preencha as informações abaixo com antecedência para agilizar seu atendimento.');
    setVisibility('clinic');
    setIncludeBodyMap(false);
    setFields([
      {
        id: 'fld-1',
        type: 'long_text',
        label: 'Qual é o motivo principal da sua consulta?',
        instructions: '',
        required: true,
        order: 1
      }
    ]);
  };

  const startEdit = (form: PreConsultationFormTemplate) => {
    setEditingForm(form);
    setIsCreating(true);
    setTitle(form.title);
    setPurpose(form.purpose || '');
    setDescription(form.description || '');
    setInstructions(form.instructions || '');
    setVisibility(form.visibility || 'clinic');
    setIncludeBodyMap(Boolean(form.include_zemda360_body_map));
    setFields(
      Array.isArray(form.fields)
        ? form.fields.filter(f => f.type !== 'zemda360_body_map')
        : []
    );
  };

  const handleAddField = () => {
    setFields(prev => [
      ...prev,
      {
        id: `fld-${Date.now().toString(36)}`,
        type: 'short_text',
        label: 'Nova pergunta',
        instructions: '',
        required: false,
        order: prev.length + 1,
        options: ['Opção 1', 'Opção 2']
      }
    ]);
  };

  const handleMoveField = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    const copy = [...fields];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    setFields(copy.map((f, i) => ({ ...f, order: i + 1 })));
  };

  const handleSaveForm = async () => {
    if (!title.trim()) {
      showToast('Informe um título para o formulário.', 'info');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        purpose: purpose.trim() || null,
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        visibility,
        includeZemda360BodyMap: canUseBodyMap ? includeBodyMap : false,
        fields: fields.map((f, idx) => ({ ...f, order: idx + 1 }))
      };

      if (editingForm) {
        await api.put(`/v1/pre-consultation/forms/${editingForm.id}`, payload);
        showToast('Formulário atualizado (nova versão gerada preservando submissões anteriores).', 'success');
      } else {
        await api.post('/v1/pre-consultation/forms', payload);
        showToast('Formulário de Pré-consulta criado com sucesso!', 'success');
      }
      setIsCreating(false);
      setEditingForm(null);
      await loadForms();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao salvar formulário', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (formId: string) => {
    try {
      await api.post(`/v1/pre-consultation/forms/${formId}/duplicate`, {});
      showToast('Formulário duplicado com sucesso!', 'success');
      await loadForms();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao duplicar formulário', 'error');
    }
  };

  const handleArchiveToggle = async (form: PreConsultationFormTemplate) => {
    try {
      const restore = form.status === 'archived';
      await api.patch(`/v1/pre-consultation/forms/${form.id}/archive`, { restore });
      showToast(restore ? 'Formulário restaurado!' : 'Formulário arquivado!', 'success');
      await loadForms();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao arquivar formulário', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Formulários de Pré-consulta
              </h2>
              <p className="text-xs text-slate-500">
                Biblioteca própria de questionários prévios ao atendimento (independente dos Termos de Consentimento)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          {isCreating ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">
                  {editingForm
                    ? `Editar Modelo (criará versão v${(editingForm.version || 1) + 1})`
                    : 'Novo Formulário de Pré-consulta'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingForm(null);
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Voltar para a biblioteca
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Título do Formulário *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Ex.: Pré-consulta Ortopédica / Primeira Consulta"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Finalidade / Especialidade
                  </label>
                  <input
                    type="text"
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    placeholder="Ex.: Primeira consulta, Retorno..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Instruções ao Paciente
                  </label>
                  <input
                    type="text"
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    placeholder="Orientações breves exibidas no topo do formulário público"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Visibilidade na Clínica
                  </label>
                  <select
                    value={visibility}
                    onChange={e => setVisibility(e.target.value as 'clinic' | 'private')}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="clinic">Compartilhado na clínica (todos podem enviar)</option>
                    <option value="private">Privado do meu perfil profissional</option>
                  </select>
                </div>
              </div>

              {/* Opção de Mapa Corporal Zemda360 (somente se profissão compatível) */}
              {canUseBodyMap && (
                <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-indigo-950">
                        Incluir campo "Mapa corporal — Zemda360"
                      </p>
                      <p className="text-[11px] text-indigo-800">
                        Permite ao paciente apontar regiões de dor, desconforto ou queixa em uma versão simplificada do corpo (Frente e Costas).
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeBodyMap}
                    onChange={e => setIncludeBodyMap(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </div>
              )}

              {/* Lista de Campos */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Campos do Formulário ({fields.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar pergunta
                  </button>
                </div>

                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col gap-2.5"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                      <div className="sm:col-span-6">
                        <input
                          type="text"
                          value={field.label}
                          onChange={e => {
                            const val = e.target.value;
                            setFields(prev =>
                              prev.map((f, i) => (i === index ? { ...f, label: val } : f))
                            );
                          }}
                          placeholder="Pergunta ou título do campo"
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <select
                          value={field.type}
                          onChange={e => {
                            const nextType = e.target.value as PreConsultationFieldItem['type'];
                            setFields(prev =>
                              prev.map((f, i) => (i === index ? { ...f, type: nextType } : f))
                            );
                          }}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                        >
                          {Object.entries(FIELD_TYPE_LABELS)
                            .filter(([k]) => k !== 'zemda360_body_map')
                            .map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3 flex items-center justify-end gap-2">
                        <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={e => {
                              const reqVal = e.target.checked;
                              setFields(prev =>
                                prev.map((f, i) => (i === index ? { ...f, required: reqVal } : f))
                              );
                            }}
                            className="accent-teal-600"
                          />
                          Obrigatório
                        </label>
                        <button
                          type="button"
                          onClick={() => handleMoveField(index, -1)}
                          disabled={index === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Subir"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveField(index, 1)}
                          disabled={index === fields.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Descer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFields(prev => prev.filter((_, i) => i !== index))}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remover pergunta"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {(field.type === 'single_choice' || field.type === 'multiple_choice') && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          Opções (separadas por vírgula)
                        </label>
                        <input
                          type="text"
                          value={(field.options || []).join(', ')}
                          onChange={e => {
                            const opts = e.target.value
                              .split(',')
                              .map(s => s.trim())
                              .filter(Boolean);
                            setFields(prev =>
                              prev.map((f, i) => (i === index ? { ...f, options: opts } : f))
                            );
                          }}
                          placeholder="Opção 1, Opção 2, Opção 3"
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingForm(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveForm}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  {saving ? 'Salvando...' : editingForm ? 'Salvar Nova Versão' : 'Criar Formulário'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={e => setShowArchived(e.target.checked)}
                      className="accent-teal-600"
                    />
                    Mostrar arquivados
                  </label>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Novo Formulário de Pré-consulta
                  </button>
                )}
              </div>

              {loading ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Carregando biblioteca de formulários...
                </div>
              ) : forms.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Nenhum modelo encontrado.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {forms.map(form => (
                    <div
                      key={form.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                        form.status === 'archived'
                          ? 'bg-slate-50 border-slate-200 opacity-75'
                          : 'bg-white border-slate-200 hover:border-teal-300 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-extrabold text-slate-900">
                            {form.title}
                          </h4>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                              v{form.version || 1}
                            </span>
                            {form.include_zemda360_body_map && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                                Zemda360
                              </span>
                            )}
                          </div>
                        </div>
                        {form.purpose && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                            {form.purpose}
                          </span>
                        )}
                        {form.description && (
                          <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2">
                            {form.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {(form.fields || []).length} campo(s) • {form.visibility === 'private' ? 'Privado' : 'Clínica'}
                        </span>
                        {canManage && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(form)}
                              className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg cursor-pointer"
                              title="Editar modelo"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicate(form.id)}
                              className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg cursor-pointer"
                              title="Duplicar modelo"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchiveToggle(form)}
                              className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg cursor-pointer"
                              title={form.status === 'archived' ? 'Restaurar' : 'Arquivar'}
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * 4.2, 4.4 & 4.5. Modal de Envio, Status e Visualização Clínica da Pré-consulta de um Agendamento
 */
export const PreConsultationAppointmentModal: React.FC<{
  appointmentId: string | null;
  patientName?: string;
  onClose: () => void;
  onUpdated?: () => void;
}> = ({ appointmentId, patientName, onClose, onUpdated }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [forms, setForms] = useState<PreConsultationFormTemplate[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [importingMap, setImportingMap] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadDetails = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    try {
      const [subRes, formsRes] = await Promise.all([
        api.get<any>(`/v1/pre-consultation/appointments/${appointmentId}`),
        api.get<{ forms: PreConsultationFormTemplate[] }>('/v1/pre-consultation/forms')
      ]);
      setData(subRes);
      const list = formsRes.forms || [];
      setForms(list);
      if (subRes?.submission?.formId) {
        setSelectedFormId(subRes.submission.formId);
      } else if (list.length > 0) {
        setSelectedFormId(list[0].id);
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar Pré-consulta do agendamento', 'error');
    } finally {
      setLoading(false);
    }
  }, [appointmentId, showToast]);

  useEffect(() => {
    if (appointmentId) {
      loadDetails();
    }
  }, [appointmentId, loadDetails]);

  if (!appointmentId) return null;

  const handlePrepareOrResend = async () => {
    if (!selectedFormId) {
      showToast('Selecione um modelo de formulário.', 'info');
      return;
    }
    setSending(true);
    try {
      await api.post(`/v1/pre-consultation/appointments/${appointmentId}/prepare-send`, {
        formId: selectedFormId
      });
      showToast('Link seguro de Pré-consulta preparado com sucesso!', 'success');
      await loadDetails();
      onUpdated?.();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao gerar link de Pré-consulta', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async () => {
    if (!data?.submission?.id) return;
    try {
      await api.post(`/v1/pre-consultation/submissions/${data.submission.id}/revoke`, {});
      showToast('Link de Pré-consulta revogado.', 'info');
      await loadDetails();
      onUpdated?.();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao revogar link', 'error');
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Link seguro copiado para a área de transferência!', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Não foi possível copiar automaticamente.', 'info');
    }
  };

  const handleImportBodyMap = async () => {
    if (!data?.submission?.id) return;
    setImportingMap(true);
    try {
      const res = await api.post<any>(
        `/v1/pre-consultation/submissions/${data.submission.id}/import-body-map`,
        {}
      );
      showToast(res.message || 'Mapa Corporal importado para a avaliação clínica!', 'success');
      await loadDetails();
      onUpdated?.();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao importar Mapa Corporal para o prontuário', 'error');
    } finally {
      setImportingMap(false);
    }
  };

  const sub = data?.submission;
  const statusKey = data?.status || 'not_sent';
  const badge = PRE_CONSULTATION_BADGE_CONFIG[statusKey] || PRE_CONSULTATION_BADGE_CONFIG.not_sent;

  return (
    <div className="fixed inset-0 z-[9992] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Pré-consulta Digital {patientName ? `— ${patientName}` : ''}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Envio de link seguro e acompanhamento de respostas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          {loading ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Carregando informações da Pré-consulta...
            </div>
          ) : (
            <>
              {/* Seção de preparação de envio / reenvio */}
              {statusKey !== 'submitted' && (
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col gap-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Modelo de Formulário de Pré-consulta
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={selectedFormId}
                      onChange={e => setSelectedFormId(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                    >
                      {forms.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.title} (v{f.version || 1})
                          {f.include_zemda360_body_map ? ' • Com Mapa Zemda360' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={sending || !selectedFormId}
                      onClick={handlePrepareOrResend}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer shrink-0"
                    >
                      {sub ? <RefreshCw className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                      {sending
                        ? 'Gerando link...'
                        : sub
                        ? 'Gerar novo link / Reenviar'
                        : 'Preparar envio do formulário'}
                    </button>
                  </div>
                </div>
              )}

              {/* Ações de compartilhamento quando há link pendente */}
              {sub && statusKey === 'pending' && (
                <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/40 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-950">
                      Link seguro pronto para envio ({sub.formTitle} • v{sub.formVersion})
                    </span>
                    <button
                      type="button"
                      onClick={handleRevoke}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      <Ban className="w-3 h-3" /> Revogar link
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
                    <input
                      type="text"
                      readOnly
                      value={sub.publicUrl}
                      className="flex-1 text-xs text-slate-600 bg-transparent outline-none px-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyLink(sub.publicUrl)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
                      {copied ? 'Copiado' : 'Copiar link'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={sub.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                    >
                      <Share2 className="w-3.5 h-3.5" /> Compartilhar via WhatsApp
                    </a>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Válido até{' '}
                      {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('pt-BR') : 'o atendimento'}
                    </span>
                  </div>
                </div>
              )}

              {/* Visualização de Respostas (ou Aviso de Sigilo para Recepção) */}
              {sub && statusKey === 'submitted' && (
                <div className="flex flex-col gap-4">
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-xs font-bold text-emerald-950">
                        Respondido por: {sub.respondentName || 'Paciente'}
                        {sub.isGuardian ? ` (Responsável legal)` : ''}
                      </p>
                      <p className="text-[11px] text-emerald-800">
                        Formulário: {sub.formTitle} (Versão v{sub.formVersion} preservada)
                      </p>
                    </div>
                    {sub.submittedAt && (
                      <span className="text-[11px] font-semibold text-emerald-800">
                        Recebido em {String(sub.submittedAt).replace('T', ' ').slice(0, 16)}
                      </span>
                    )}
                  </div>

                  {data.clinicalRestricted ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          Respostas clínicas protegidas por sigilo profissional
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          A recepção visualiza apenas o status administrativo de preenchimento. O conteúdo das respostas e o mapa corporal ficam disponíveis exclusivamente para o profissional responsável no prontuário.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Respostas dos campos */}
                      <div className="flex flex-col gap-2.5">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                          Respostas Informadas pelo Paciente
                        </h4>
                        {(sub.fields || [])
                          .filter((f: any) => f.type !== 'zemda360_body_map')
                          .map((f: PreConsultationFieldItem) => {
                            const ans = sub.answers ? sub.answers[f.id] : undefined;
                            const displayAns = Array.isArray(ans)
                              ? ans.join(', ')
                              : typeof ans === 'boolean'
                              ? ans
                                ? 'Sim'
                                : 'Não'
                              : ans !== undefined && ans !== null && String(ans).trim() !== ''
                              ? String(ans)
                              : 'Não informado';
                            return (
                              <div
                                key={f.id}
                                className="p-3 rounded-xl border border-slate-100 bg-slate-50/70"
                              >
                                <p className="text-xs font-bold text-slate-700">{f.label}</p>
                                <p className="text-xs text-slate-900 mt-1 whitespace-pre-wrap">
                                  {displayAns}
                                </p>
                              </div>
                            );
                          })}
                      </div>

                      {/* Mapa Corporal Zemda360 Informado pelo Paciente + Importação Opcional */}
                      {sub.bodyMap && Array.isArray(sub.bodyMap.regions) && sub.bodyMap.regions.length > 0 && (
                        <div className="flex flex-col gap-3">
                          <PreConsultationBodyMapSimple
                            regions={sub.bodyMap.regions as PatientBodyMapRegion[]}
                            readOnly
                          />
                          <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/60 flex items-center justify-between flex-wrap gap-3">
                            <div>
                              <p className="text-xs font-bold text-indigo-950">
                                Revisão Clínica — Zemda360
                              </p>
                              <p className="text-[11px] text-indigo-800">
                                {sub.bodyMapImportedAt
                                  ? `Marcações já importadas para a avaliação clínica em ${String(sub.bodyMapImportedAt).replace('T', ' ').slice(0, 16)}.`
                                  : 'Deseja importar as regiões demarcadas pelo paciente para a avaliação clínica do Zemda360?'}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={importingMap}
                              onClick={handleImportBodyMap}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              {importingMap
                                ? 'Importando...'
                                : sub.bodyMapImportedAt
                                ? 'Reimportar para Avaliação Zemda360'
                                : 'Importar para Avaliação Clínica (Zemda360)'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
