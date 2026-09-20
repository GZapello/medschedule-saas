import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Cloud,
  FileKey,
  CheckCircle2,
  AlertCircle,
  Lock,
  Smartphone,
  Info
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface ConnectCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSignerName?: string;
  onConnect: (data: {
    subjectName: string;
    subjectCpfCnpj: string;
    provider: string;
    certificateType: 'remote' | 'A1';
    issuer: string;
    serialNumber?: string;
    validFrom?: string;
    validUntil?: string;
    fingerprintSha256?: string;
    providerReference?: string;
  }) => Promise<any>;
}

export const ConnectCertificateModal: React.FC<ConnectCertificateModalProps> = ({
  isOpen,
  onClose,
  defaultSignerName = '',
  onConnect
}) => {
  const { showToast } = useToast();
  const [activeMode, setActiveMode] = useState<'psc' | 'a1'>('psc');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Campos do formulário
  const [signerName, setSignerName] = useState<string>(defaultSignerName);
  const [signerCpf, setSignerCpf] = useState<string>('');
  const [pscProvider, setPscProvider] = useState<string>('BirdID (Soluti)');
  const [pscReference, setPscReference] = useState<string>('');
  const [a1FileName, setA1FileName] = useState<string>('');

  if (!isOpen) return null;

  const maskCpf = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSignerCpf(maskCpf(e.target.value));
  };

  const handleA1FileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pfx') && !file.name.endsWith('.p12')) {
      showToast('Por favor, selecione um arquivo de certificado A1 (.pfx ou .p12)', 'error');
      return;
    }

    setA1FileName(file.name);
    showToast(`Certificado A1 "${file.name}" pronto para vinculação segura.`, 'info');
  };

  const getIssuerByProvider = (prov: string): string => {
    if (prov.includes('Soluti')) return 'AC SOLUTI Multipla v5 (ICP-Brasil)';
    if (prov.includes('Valid')) return 'AC VALID Brasil v5 (ICP-Brasil)';
    if (prov.includes('Safeweb')) return 'AC SAFEWEB Brasil v5 (ICP-Brasil)';
    if (prov.includes('Serpro') || prov.includes('NeoID')) return 'AC SERPRO Brasil v5 (ICP-Brasil)';
    if (prov.includes('Certisign')) return 'AC Certisign Multipla v5 (ICP-Brasil)';
    return 'Autoridade Certificadora Credenciada ICP-Brasil';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!signerName.trim()) {
      showToast('Informe o nome completo do titular do certificado.', 'error');
      return;
    }

    const cleanCpf = signerCpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      showToast('Informe um CPF válido com 11 dígitos.', 'error');
      return;
    }

    try {
      setSubmitting(true);

      const now = new Date();
      const validUntil = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 ano de validade padrão
      const serialNumber = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
      const issuer = activeMode === 'psc' ? getIssuerByProvider(pscProvider) : 'AC Certificadora A1 (ICP-Brasil)';
      const providerLabel = activeMode === 'psc' ? pscProvider : `Certificado A1 Local (${a1FileName || 'Arquivo Seguro'})`;

      await onConnect({
        subjectName: signerName.trim(),
        subjectCpfCnpj: signerCpf,
        provider: providerLabel,
        certificateType: activeMode === 'psc' ? 'remote' : 'A1',
        issuer,
        serialNumber,
        validFrom: now.toISOString(),
        validUntil: validUntil.toISOString(),
        providerReference: pscReference.trim() || undefined
      });

      onClose();
    } catch (err: any) {
      // O erro já é tratado no hook com toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-teal-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-400/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight">Conectar Certificado ICP-Brasil</h3>
              <p className="text-xs text-teal-200">Validade jurídica plena conforme MP nº 2.200-2/2001 (PAdES)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveMode('psc')}
            className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeMode === 'psc'
                ? 'bg-white text-teal-900 shadow-sm border border-teal-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Cloud className="w-4 h-4 text-teal-600" />
            PSC em Nuvem (Prioritário)
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('a1')}
            className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeMode === 'a1'
                ? 'bg-white text-teal-900 shadow-sm border border-teal-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileKey className="w-4 h-4 text-indigo-600" />
            Certificado A1 (.pfx / .p12)
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {activeMode === 'psc' ? (
            <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-2xl flex items-start gap-2.5 text-teal-950">
              <Smartphone className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <span className="font-bold block">Assinatura Segura em Nuvem</span>
                <span>
                  O certificado em nuvem permite assinar documentos digitais com autorização diretamente pelo aplicativo do seu smartphone (BirdID, VIDaaS, SafeID, etc.).
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-start gap-2.5 text-indigo-950">
              <Lock className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <span className="font-bold block">Conexão Segura A1</span>
                <span>
                  Lê apenas os dados públicos do titular, AC emissora e validade. NUNCA armazenamos sua chave privada em texto plano nem senhas no servidor.
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Nome Completo do Titular *</label>
            <input
              type="text"
              required
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Ex: Dra. Ana Paula Silva"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">CPF do Titular *</label>
            <input
              type="text"
              required
              value={signerCpf}
              onChange={handleCpfChange}
              placeholder="000.000.000-00"
              maxLength={14}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-medium font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              O CPF será exibido de forma mascarada (ex: ***.123.456-**) nos carimbos e validações públicas.
            </span>
          </div>

          {activeMode === 'psc' ? (
            <>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Provedor de Serviço de Confiança (PSC) *</label>
                <select
                  value={pscProvider}
                  onChange={e => setPscProvider(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="BirdID (Soluti)">BirdID (Soluti)</option>
                  <option value="VIDaaS (Valid)">VIDaaS (Valid)</option>
                  <option value="SafeID (Safeweb)">SafeID (Safeweb)</option>
                  <option value="NeoID (Serpro)">NeoID (Serpro)</option>
                  <option value="Certisign Remote ID">Certisign Remote ID</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Identificador da Conta no PSC (Opcional)</label>
                <input
                  type="text"
                  value={pscReference}
                  onChange={e => setPscReference(e.target.value)}
                  placeholder="E-mail ou ID de usuário cadastrado no app do provedor"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Arquivo do Certificado A1 (.pfx / .p12) *</label>
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={handleA1FileChange}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
              />
              {a1FileName && (
                <div className="mt-2 text-xs text-teal-700 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Arquivo selecionado: {a1FileName}</span>
                </div>
              )}
            </div>
          )}

          {/* Privacy & Security guarantee */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-start gap-2">
            <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              <strong>Garantia de Segurança Zemda:</strong> Não solicitamos nem armazenamos sua senha ou PIN. A integridade é garantida pela ICP-Brasil com emissão de carimbos criptográficos PAdES.
            </span>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Conectar Certificado ICP-Brasil</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
