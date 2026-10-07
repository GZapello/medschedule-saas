import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Phone,
  Loader2
} from 'lucide-react';
import {
  isValidPhoneNumber,
  formatPhoneDisplay,
  generateWhatsAppUrl
} from '../../utils/phone.utils';
import { WhatsAppIcon } from './WhatsAppReminderModal';

export interface WhatsAppContextItem {
  label: string;
  value: React.ReactNode;
}

export interface UniversalWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  recipientName: string;
  phone?: string | null;
  phoneErrorMessage?: string;
  contextItems?: WhatsAppContextItem[];
  defaultMessage: string;
  confirmButtonText?: string;
  onConfirmOpen?: (message: string) => void;
  auditAction?: () => Promise<void>;
  noticeText?: string;
}

export const UniversalWhatsAppModal: React.FC<UniversalWhatsAppModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle = 'Confirmação prévia da mensagem e dados do contato antes da abertura manual.',
  recipientName,
  phone,
  phoneErrorMessage = 'Paciente sem telefone/WhatsApp cadastrado.',
  contextItems = [],
  defaultMessage,
  confirmButtonText = 'Abrir no WhatsApp Web/App',
  onConfirmOpen,
  auditAction,
  noticeText = 'O envio é manual via WhatsApp Web ou aplicativo oficial. A abertura do link não altera o status do registro.'
}) => {
  const [message, setMessage] = useState<string>('');
  const [isOpening, setIsOpening] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage(defaultMessage || '');
      setSuccessMessage(null);
      setIsOpening(false);
    }
  }, [isOpen, defaultMessage]);

  if (!isOpen) return null;

  const phoneValid = isValidPhoneNumber(phone);
  const formattedPhone = formatPhoneDisplay(phone);

  const handleOpenWhatsApp = async () => {
    if (!phoneValid || !phone) return;
    setIsOpening(true);

    try {
      const url = generateWhatsAppUrl(phone, message);
      window.open(url, '_blank', 'noopener,noreferrer');

      if (auditAction) {
        try {
          await auditAction();
        } catch (auditErr) {
          console.warn('[UniversalWhatsAppModal] Falha ao registrar auditoria de abertura:', auditErr);
        }
      }

      if (onConfirmOpen) {
        onConfirmOpen(message);
      }

      setSuccessMessage('WhatsApp Web/App aberto com a mensagem preenchida!');
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      console.error('[UniversalWhatsAppModal] Erro ao abrir WhatsApp:', err);
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <WhatsAppIcon className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                {title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isOpening}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="py-4 space-y-4 text-xs">
          {/* Channel badge */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 rounded-xl">
            <span className="font-medium text-slate-600">Canal de Envio:</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <ExternalLink className="w-3 h-3 text-emerald-600" />
              WhatsApp Web / App (Envio Manual wa.me)
            </span>
          </div>

          {/* Context details */}
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3.5 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 text-[11px] block font-medium">Destinatário:</span>
                <span className="font-bold text-slate-900 text-sm truncate block">
                  {recipientName || 'Contato'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block font-medium">Telefone Destino:</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {phoneValid ? (
                    <span className="font-bold text-slate-900">{formattedPhone}</span>
                  ) : (
                    <span className="text-rose-600 font-bold">Sem telefone válido</span>
                  )}
                </div>
              </div>
            </div>

            {contextItems.length > 0 && (
              <div
                className={`grid grid-cols-1 sm:grid-cols-${Math.min(
                  contextItems.length,
                  3
                )} gap-3 pt-2 border-t border-emerald-100/80`}
              >
                {contextItems.map((item, idx) => (
                  <div key={idx}>
                    <span className="text-slate-400 text-[11px] block font-medium">
                      {item.label}:
                    </span>
                    <span className="font-semibold text-slate-800 truncate block">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Phone validation alert */}
          {!phoneValid && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{phoneErrorMessage}</p>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Para abrir o WhatsApp, cadastre o telefone com DDD (10 ou 11 dígitos).
                </p>
              </div>
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="font-bold text-xs">{successMessage}</p>
            </div>
          )}

          {/* Message textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700 flex items-center gap-1.5">
                <span>Prévia da Mensagem (Editável)</span>
              </label>
              <span className="text-[11px] text-slate-400">
                {message.length} caracteres
              </span>
            </div>
            <textarea
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isOpening || Boolean(successMessage)}
              placeholder="Digite a mensagem a ser enviada..."
              className="w-full p-3 text-xs bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans resize-none leading-relaxed text-slate-800"
            />
          </div>

          {noticeText && (
            <p className="text-[11px] text-slate-500 italic">
              ℹ️ {noticeText}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isOpening}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer min-h-[40px]"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleOpenWhatsApp}
            disabled={isOpening || !phoneValid || Boolean(successMessage)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all cursor-pointer min-h-[40px]"
          >
            {isOpening ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Abrindo...</span>
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                <span>{confirmButtonText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
