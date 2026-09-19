import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import {
  ShieldCheck,
  ShieldAlert,
  Calendar,
  User,
  Hash,
  Award,
  ArrowLeft,
  Lock,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Building2,
  FileCheck
} from 'lucide-react';

interface VerifyDocumentViewProps {
  token: string;
  onBackToHome: () => void;
}

interface VerificationResult {
  valid: boolean;
  documentType: string;
  signedAt: string;
  signatureType: string;
  signatureHash: string;
  signerName: string;
  signerRegistration?: string;
  signerCpfMasked?: string;
  certificateIssuer?: string;
  certificateProvider?: string;
  verificationToken: string;
  clinicName?: string;
  message?: string;
}

export const VerifyDocumentView: React.FC<VerifyDocumentViewProps> = ({
  token,
  onBackToHome
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      try {
        setLoading(true);
        setError(null);
        const data = await ApiClient.get<VerificationResult>(
          `/v1/public/verify-document/${encodeURIComponent(token)}`
        );
        setResult(data);
      } catch (err: any) {
        setError(err.message || 'Não foi possível validar o documento.');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      verify();
    }
  }, [token]);

  const getDocTypeLabel = (type: string) => {
    switch (type) {
      case 'certificate':
        return 'Atestado Médico / Clínico';
      case 'prescription':
        return 'Receituário Clínico';
      case 'exam_request':
        return 'Solicitação de Exames';
      case 'psychopedagogy_session':
        return 'Evolução Psicopedagógica (ZemdaPP)';
      case 'psychopedagogy_report':
        return 'Relatório Psicopedagógico (ZemdaPP)';
      case 'clinical_evolution':
        return 'Evolução de Prontuário';
      default:
        return 'Documento Clínico';
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-teal-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHome}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Início</span>
            </button>
            <div className="h-5 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="font-black tracking-tight text-white text-lg">Zemda</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Verificador Oficial
              </span>
            </div>
          </div>
          <a
            href="https://verificador.iti.gov.br"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-teal-400 transition-colors hidden sm:flex items-center gap-1.5"
          >
            <span>Verificador ITI Brasil</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* Main Verification Body */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
        {loading ? (
          <div className="bg-slate-800/80 rounded-3xl p-10 border border-slate-700/80 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <h2 className="text-lg font-bold text-white">Consultando integridade criptográfica...</h2>
            <p className="text-xs text-slate-400">Verificando tokens e integridade SHA-256 no banco de assinaturas</p>
          </div>
        ) : error || !result || !result.valid ? (
          <div className="bg-slate-800/90 rounded-3xl p-8 sm:p-10 border border-rose-500/40 shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="text-center space-y-2">
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Documento Não Autenticado
              </span>
              <h1 className="text-2xl font-bold text-white">Falha na Verificação de Autenticidade</h1>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                {error || result?.message || 'O token informado não corresponde a nenhum documento assinado digitalmente ou sua integridade foi violada.'}
              </p>
            </div>

            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 text-xs font-mono text-slate-400 break-all text-center">
              Token: {token}
            </div>

            <div className="text-center pt-2">
              <button
                onClick={onBackToHome}
                className="px-6 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Voltar à Página Inicial
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/90 rounded-3xl border border-teal-500/40 shadow-2xl overflow-hidden">
            {/* Header Status Badge */}
            <div className="bg-gradient-to-r from-teal-950/80 via-emerald-950/80 to-slate-900 p-6 sm:p-8 border-b border-teal-500/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-400/40 text-teal-400 flex items-center justify-center shrink-0 shadow-lg">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/40">
                        {result.signatureType === 'pades' ? 'PAdES ICP-Brasil' : 'Assinatura Eletrônica'}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Autêntico & Íntegro
                      </span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                      {getDocTypeLabel(result.documentType)}
                    </h1>
                  </div>
                </div>
                <div className="text-right sm:border-l sm:border-slate-700/60 sm:pl-6">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Data da Assinatura</span>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {new Date(result.signedAt).toLocaleDateString('pt-BR')} às {new Date(result.signedAt).toLocaleTimeString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Signer Info */}
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-teal-400" />
                    Signatário / Emissor
                  </span>
                  <p className="text-sm font-bold text-white">{result.signerName}</p>
                  {result.signerRegistration && (
                    <p className="text-xs text-slate-300 font-semibold">{result.signerRegistration}</p>
                  )}
                  {result.signerCpfMasked && (
                    <p className="text-xs text-slate-400 font-mono">CPF: {result.signerCpfMasked}</p>
                  )}
                </div>

                {/* Issuer / Provider */}
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-teal-400" />
                    Certificadora / Emissor
                  </span>
                  <p className="text-sm font-bold text-white">
                    {result.certificateIssuer || 'Assinatura Eletrônica Avançada Zemda'}
                  </p>
                  <p className="text-xs text-slate-300">
                    Provedor: {result.certificateProvider || 'Plataforma Zemda (SHA-256)'}
                  </p>
                  {result.clinicName && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {result.clinicName}
                    </p>
                  )}
                </div>
              </div>

              {/* Cryptographic Hash */}
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-teal-400" />
                    Hash de Integridade Criptográfica (SHA-256)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Auditado
                  </span>
                </div>
                <div className="font-mono text-xs text-teal-300 break-all bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  {result.signatureHash}
                </div>
                <p className="text-[11px] text-slate-400">
                  Qualquer alteração no texto, cabeçalho ou metadados após a assinatura alteraria irremediavelmente este hash.
                </p>
              </div>

              {/* Strict LGPD Privacy Notice */}
              <div className="bg-teal-950/30 p-4 rounded-2xl border border-teal-800/40 flex items-start gap-3">
                <Lock className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <strong className="text-teal-300 block">Privacidade e Sigilo Profissional (LGPD & Código de Ética)</strong>
                  <p className="text-slate-400 leading-relaxed">
                    Por estrita conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e sigilo clínico profissional, o conteúdo privativo (diagnóstico, medicamentos, queixas ou relatórios) não é exibido publicamente nesta página de validação, assegurando total sigilo ao titular.
                  </p>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <button
                  onClick={onBackToHome}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Voltar ao Zemda
                </button>
                <div className="text-center sm:text-right">
                  <span className="text-[10px] font-mono text-slate-500">
                    Token: {result.verificationToken}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Public Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Zemda. Verificação de Autenticidade de Documentos Clínicos.</span>
          <span className="text-slate-400 font-medium">Infraestrutura em Conformidade com ICP-Brasil & LGPD</span>
        </div>
      </footer>
    </div>
  );
};
