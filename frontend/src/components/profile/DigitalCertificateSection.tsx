import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Plus,
  KeyRound,
  ExternalLink,
  Award,
  Calendar,
  Fingerprint,
  Building2,
  Lock,
  Clock
} from 'lucide-react';
import { useProfessionalCertificate } from '../../hooks/useProfessionalCertificate';
import { ConnectCertificateModal } from './ConnectCertificateModal';
import { useAuth } from '../../context/AuthContext';

export const DigitalCertificateSection: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    loading,
    certificate,
    status,
    hasValidCertificate,
    reload,
    connectCertificate,
    validateCertificate,
    disconnectCertificate
  } = useProfessionalCertificate();

  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [validating, setValidating] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);

  const handleValidate = async () => {
    if (!certificate?.id) return;
    try {
      setValidating(true);
      await validateCertificate(certificate.id);
    } finally {
      setValidating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!certificate?.id) return;
    if (!window.confirm('Tem certeza de que deseja desconectar este certificado digital ICP-Brasil? Novas emissões de documentos não poderão ser assinadas via ICP-Brasil até que um novo certificado seja configurado.')) {
      return;
    }
    try {
      setDisconnecting(true);
      await disconnectCertificate(certificate.id);
    } finally {
      setDisconnecting(false);
    }
  };

  const renderStatusBadge = () => {
    switch (status) {
      case 'valid':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Conectado & Válido
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            Expirado
          </span>
        );
      case 'revoked':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            Revogado
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Pendente de Ativação
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">
            <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
            Erro de Validação
          </span>
        );
      case 'not_configured':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
            Não Configurado
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 text-xs">
      {/* Banner Explicativo */}
      <div className="p-4 bg-gradient-to-r from-teal-50 to-slate-50 border border-teal-200 rounded-2xl flex items-start gap-3 text-slate-700 leading-relaxed">
        <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-slate-900 text-sm">Certificado Digital ICP-Brasil</h4>
            {renderStatusBadge()}
          </div>
          <p className="text-slate-600 text-xs">
            Configure seu certificado digital ICP-Brasil uma única vez nesta seção. Ele será utilizado automaticamente sempre que você optar por assinar receitas, atestados, relatórios e prontuários com validade jurídica plena (padrão PAdES ITI).
          </p>
        </div>
      </div>

      {/* Conteúdo Principal */}
      {loading ? (
        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
          <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 font-medium text-xs">Consultando status do certificado digital...</p>
        </div>
      ) : !certificate || status === 'not_configured' ? (
        /* Estado: Não Configurado */
        <div className="p-8 text-center bg-slate-50/80 rounded-2xl border border-dashed border-slate-300 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto shadow-2xs">
            <KeyRound className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h5 className="font-bold text-slate-800 text-sm">Nenhum Certificado ICP-Brasil Configurado</h5>
            <p className="text-slate-500 text-xs leading-relaxed">
              Conecte seu certificado em nuvem (BirdID, VIDaaS, SafeID, NeoID, Certisign) ou certificado A1 para emitir documentos com assinatura digital PAdES reconhecida por cartórios, farmácias e órgãos de saúde.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsConnectModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Conectar Certificado ICP-Brasil</span>
            </button>
          </div>
        </div>
      ) : (
        /* Estado: Conectado (Válido, Expirado ou com Aviso) */
        <div className="space-y-4">
          {/* Card de Metadados do Certificado */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Award className="w-4 h-4 text-teal-400" />
                <span className="font-bold text-xs">Dados Oficiais da Cadeia de Certificação</span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-slate-800 px-2.5 py-0.5 rounded-md text-teal-300">
                Padrão PAdES
              </span>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Nome do Titular</span>
                <strong className="text-slate-900 text-sm block">{certificate.subject_name}</strong>
                <span className="text-slate-500 text-[11px] font-mono">CPF: {certificate.subject_cpf_cnpj}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Autoridade Certificadora (Emissor)</span>
                <strong className="text-slate-800 block">{certificate.issuer}</strong>
                <span className="text-slate-500 text-[11px]">Provedor: {certificate.provider}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Número de Série</span>
                <code className="text-slate-700 font-mono text-[11px] break-all block">{certificate.serial_number}</code>
                <span className="text-slate-500 text-[10px]">Tipo: {certificate.certificate_type === 'remote' ? 'PSC em Nuvem' : 'Certificado A1'}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Período de Validade</span>
                <div className="text-slate-700 font-medium">
                  {new Date(certificate.valid_from).toLocaleDateString('pt-BR')} até{' '}
                  <strong className={status === 'expired' ? 'text-rose-600' : 'text-emerald-700'}>
                    {new Date(certificate.valid_until).toLocaleDateString('pt-BR')}
                  </strong>
                </div>
                <span className="text-slate-400 text-[10px] block mt-0.5">
                  Última validação: {new Date(certificate.last_validated_at).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            {/* Aviso especial se expirado */}
            {status === 'expired' && (
              <div className="p-3 bg-rose-50 border-t border-rose-200 text-rose-800 flex items-center gap-2 text-xs">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>Atenção:</strong> Este certificado ICP-Brasil expirou e não pode ser utilizado para novas assinaturas. Desconecte-o e conecte um certificado renovado.
                </span>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={validating}
                onClick={handleValidate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} />
                <span>{validating ? 'Validando...' : 'Validar novamente'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsConnectModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Substituir / Conectar Outro</span>
              </button>
            </div>

            <button
              type="button"
              disabled={disconnecting}
              onClick={handleDisconnect}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{disconnecting ? 'Desconectando...' : 'Desconectar'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Conexão */}
      <ConnectCertificateModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        defaultSignerName={currentUser?.name || ''}
        onConnect={connectCertificate}
      />
    </div>
  );
};
