import React, { useState } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ShieldCheck, Scale, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface LegalReacceptanceModalProps {
  isOpen?: boolean;
}

export const LegalReacceptanceModal: React.FC<LegalReacceptanceModalProps> = ({ isOpen: propIsOpen }) => {
  const { currentUser, reloadSession } = useAuth();
  const { showToast } = useToast();

  const isOpen = typeof propIsOpen === 'boolean' ? propIsOpen : Boolean(currentUser?.needsLegalAcceptance);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!termsAccepted || !privacyAccepted) {
      showToast('É necessário marcar o aceite de ambos os documentos para continuar.', 'error');
      return;
    }

    try {
      setLoading(true);
      await ApiClient.post('/v1/auth/accept-legal', {
        termsAccepted: true,
        privacyAccepted: true
      });
      showToast('Termos aceitos com sucesso!', 'success');
      await reloadSession();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar aceite legal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-reaccept-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 my-8 animate-in fade-in zoom-in-95 duration-200 text-left">
        {/* Header */}
        <div className="bg-slate-900 p-6 text-white border-b border-slate-800">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold mb-2">
            <Scale className="w-3.5 h-3.5" />
            <span>Atualização Legal Obrigatória</span>
          </div>
          <h2 id="legal-reaccept-title" className="text-xl font-black text-white">
            Atualização dos Termos e Privacidade
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Nossos Termos de Uso e Política de Privacidade foram atualizados. Para continuar utilizando o Zemda, revise e confirme seu aceite.
          </p>
        </div>

        {/* Body */}
        <form onSubmit={handleConfirm} className="p-6 space-y-5">
          <p className="text-xs text-slate-600 leading-relaxed">
            Mantemos nosso compromisso de transparência com a conformidade à LGPD e proteção integral do sigilo clínico. Leia os documentos atualizados nos links abaixo:
          </p>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5 text-xs text-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
              />
              <span>
                Li e aceito os{' '}
                <a
                  href="/termos-de-uso"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-teal-600 underline hover:text-teal-700"
                >
                  Termos de Uso
                </a>{' '}
                vigentes da plataforma Zemda.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={e => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
              />
              <span>
                Li e estou ciente da{' '}
                <a
                  href="/privacidade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-teal-600 underline hover:text-teal-700"
                >
                  Política de Privacidade e Proteção de Dados (LGPD)
                </a>
                .
              </span>
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !termsAccepted || !privacyAccepted}
              className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer text-center"
            >
              {loading ? 'Registrando aceite...' : 'Confirmar Aceite e Continuar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
