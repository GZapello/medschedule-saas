import React, { useState, useEffect } from 'react';
import {
  X,
  Link2,
  Copy,
  Check,
  Share2,
  ExternalLink,
  ShieldAlert,
  Clock,
  Calendar,
  AlertCircle,
  RefreshCw,
  Trash2,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

interface PersonalStudentLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
}

interface LinkData {
  hasLink: boolean;
  id?: string;
  status: 'active' | 'expired' | 'revoked' | 'none';
  linkUrl?: string | null;
  token?: string | null;
  createdAt?: string;
  lastAccessAt?: string | null;
  revokedAt?: string | null;
  expiresAt?: string;
  daysRemaining?: number;
  isExpired?: boolean;
  inactivityDays?: number;
}

export const PersonalStudentLinkModal: React.FC<PersonalStudentLinkModalProps> = ({
  isOpen,
  onClose,
  studentId,
  studentName
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  const fetchLinkData = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<LinkData>(`/v1/personal/students/${studentId}/access-link`);
      setLinkData(res);
    } catch (err: any) {
      console.error('Erro ao buscar link do aluno:', err);
      showToast('Erro ao carregar link do aluno', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && studentId) {
      setShowRevokeConfirm(false);
      setCopied(false);
      fetchLinkData();
    }
  }, [isOpen, studentId]);

  if (!isOpen) return null;

  const handleGenerateLink = async () => {
    try {
      setActionLoading(true);
      const res = await ApiClient.post<any>(`/v1/personal/students/${studentId}/access-link`, {});
      showToast(res.message || 'Link gerado com sucesso!', 'success');
      await fetchLinkData();
    } catch (err: any) {
      console.error('Erro ao gerar link do aluno:', err);
      showToast(err.response?.data?.error || 'Erro ao gerar link de acesso', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeLink = async () => {
    try {
      setActionLoading(true);
      await ApiClient.post(`/v1/personal/students/${studentId}/access-link/revoke`, {});
      showToast('Link do aluno revogado com sucesso!', 'success');
      setShowRevokeConfirm(false);
      await fetchLinkData();
    } catch (err: any) {
      console.error('Erro ao revogar link:', err);
      showToast('Erro ao revogar acesso do aluno', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!linkData?.linkUrl) return;
    navigator.clipboard.writeText(linkData.linkUrl);
    setCopied(true);
    showToast('Link copiado para a área de transferência!', 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleShareLink = () => {
    if (!linkData?.linkUrl) return;
    const shareText = `Olá ${studentName}, acesse seus treinos prescritos pelo ZemdaPersonal através do seu link exclusivo: ${linkData.linkUrl}`;
    
    if (navigator.share) {
      navigator.share({
        title: `Treino de ${studentName} — ZemdaPersonal`,
        text: shareText,
        url: linkData.linkUrl
      }).catch(() => {});
    } else {
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  const handleOpenLink = () => {
    if (!linkData?.linkUrl) return;
    window.open(linkData.linkUrl, '_blank');
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Nenhum acesso registrado ainda';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-inner">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Link do Aluno</h3>
              <p className="text-xs text-slate-500">
                Acesso externo aos treinos prescritos de <strong className="text-slate-700">{studentName}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-5">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              Carregando dados de acesso do aluno...
            </div>
          ) : !linkData || !linkData.hasLink || linkData.status === 'none' ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-3xl bg-teal-50 text-teal-600 mx-auto flex items-center justify-center border border-teal-100">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-sm">Nenhum Link Ativo</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Gere um link exclusivo e seguro para que o aluno visualize seus treinos prescritos e registre séries, cargas e repetições pelo smartphone.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleGenerateLink}
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 mx-auto shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  Gerar Link do Aluno
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Status Badge */}
              <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80">
                <span className="text-xs font-semibold text-slate-600">Situação do Acesso:</span>
                {linkData.status === 'active' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Ativo
                  </span>
                ) : linkData.status === 'expired' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-xl border border-amber-200">
                    <Clock className="w-3.5 h-3.5" />
                    Expirado por Inatividade
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 text-xs font-bold rounded-xl border border-rose-200">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Revogado
                  </span>
                )}
              </div>

              {/* Campo do Link (se ativo) */}
              {linkData.status === 'active' && linkData.linkUrl ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">Link Único de Execução:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={linkData.linkUrl}
                      className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 select-all focus:outline-none"
                    />
                    <button
                      onClick={handleCopyLink}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        copied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
                      }`}
                      title="Copiar Link"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>

                  {/* Ações Rápidas: Compartilhar & Abrir */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleShareLink}
                      className="flex-1 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Compartilhar via WhatsApp / App
                    </button>
                    <button
                      onClick={handleOpenLink}
                      className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="Abrir página do aluno em nova guia"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir
                    </button>
                  </div>
                </div>
              ) : linkData.status === 'expired' ? (
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-start gap-2 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Este link foi expirado automaticamente por atingir 30 dias consecutivos sem acesso do aluno.</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    O histórico, treinos prescritos e avaliações do aluno permanecem 100% preservados. Para liberar novo acesso, gere um novo link abaixo.
                  </p>
                  <button
                    onClick={handleGenerateLink}
                    disabled={actionLoading}
                    className="mt-2 w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reativar / Gerar Novo Link
                  </button>
                </div>
              ) : (
                <div className="bg-rose-50 rounded-2xl p-4 border border-rose-200 text-rose-900 space-y-2">
                  <div className="flex items-start gap-2 text-xs font-semibold">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>O acesso deste aluno foi revogado anteriormente pelo profissional.</span>
                  </div>
                  <button
                    onClick={handleGenerateLink}
                    disabled={actionLoading}
                    className="mt-2 w-full py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Gerar Novo Acesso
                  </button>
                </div>
              )}

              {/* Detalhes de Auditoria e Expiração */}
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-2.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Calendar className="w-3.5 h-3.5" /> Data de Criação:
                  </span>
                  <span className="font-semibold text-slate-700">{formatDate(linkData.createdAt)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Clock className="w-3.5 h-3.5" /> Último Acesso Válido:
                  </span>
                  <span className="font-semibold text-slate-700">{formatDate(linkData.lastAccessAt)}</span>
                </div>

                {linkData.status === 'active' && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-amber-600" /> Expiração por Inatividade:
                    </span>
                    <span className="font-bold text-amber-700">
                      {linkData.daysRemaining !== undefined && linkData.daysRemaining > 0
                        ? `Em ${linkData.daysRemaining} dias (${new Date(linkData.expiresAt || '').toLocaleDateString('pt-BR')})`
                        : 'Expirando hoje'}
                    </span>
                  </div>
                )}
              </div>

              {/* Informação sobre a Regra de Negócio */}
              <div className="text-[11px] text-slate-500 bg-slate-100/70 p-3 rounded-xl border border-slate-200/60 space-y-1">
                <div className="font-bold text-slate-700 flex items-center gap-1">
                  <Check className="w-3 h-3 text-teal-600" />
                  Prescrição em Tempo Real:
                </div>
                <p>
                  O link pertence ao aluno, não ao treino. Qualquer alteração ou nova divisão (A/B/C) prescrita por você no ZemdaPersonal aparecerá imediatamente neste mesmo link, sem necessidade de enviar outro.
                </p>
              </div>

              {/* Seção de Revogação de Acesso */}
              {linkData.status === 'active' && (
                <div className="pt-2 border-t border-slate-100">
                  {!showRevokeConfirm ? (
                    <button
                      onClick={() => setShowRevokeConfirm(true)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-xl border border-transparent hover:border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revogar Acesso do Aluno
                    </button>
                  ) : (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-2 animate-in fade-in">
                      <p className="text-xs font-bold text-rose-800">
                        Deseja revogar o link deste aluno agora?
                      </p>
                      <p className="text-[11px] text-rose-700">
                        O aluno perderá imediatamente o acesso aos treinos por esta URL. Você poderá gerar um novo link a qualquer momento.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={handleRevokeLink}
                          disabled={actionLoading}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Confirmar Revogação
                        </button>
                        <button
                          onClick={() => setShowRevokeConfirm(false)}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
