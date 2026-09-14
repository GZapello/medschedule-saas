import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Link as LinkIcon,
  ArrowRight,
  AlertCircle
} from 'lucide-react';

interface RegisterUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RegisterUserModal: React.FC<RegisterUserModalProps> = ({ isOpen, onClose }) => {
  const [inviteInput, setInviteInput] = useState('');

  if (!isOpen) return null;

  const handleGoToInvite = () => {
    if (!inviteInput.trim()) return;

    let target = inviteInput.trim();
    // Se for URL completa, extrai pathname
    try {
      if (target.startsWith('http://') || target.startsWith('https://')) {
        const parsed = new URL(target);
        target = parsed.pathname;
      }
    } catch (_) {}

    // Garante formato /convite/...
    if (!target.startsWith('/convite/') && !target.startsWith('convite/')) {
      target = '/convite/' + target;
    } else if (target.startsWith('convite/')) {
      target = '/' + target;
    }

    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Acesso para Colaboradores</h2>
            <p className="text-xs text-slate-500">Cadastro de equipe e profissionais de saúde</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 pt-4 text-left">
          {/* Aviso Informativo do Novo Fluxo de Convites (Itens 14 e 21) */}
          <div className="p-4 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Vínculo Exclusivo por Link Único da Clínica</span>
            </div>
            <p className="text-[11px] text-indigo-800 leading-relaxed">
              Por segurança e conformidade, novos funcionários e profissionais de saúde não selecionam manualmente uma clínica na tela de registro. O vínculo é estabelecido exclusivamente através de um <strong>Link Único de Convite</strong> emitido pelo gestor da clínica.
            </p>
          </div>

          {/* Campo para colar ou digitar o link/token de convite */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <label className="block text-xs font-bold text-slate-700">
              Já recebeu o link ou código de convite da sua clínica?
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={inviteInput}
                  onChange={e => setInviteInput(e.target.value)}
                  placeholder="Cole aqui o link ou código do convite"
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={handleGoToInvite}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <span>Acessar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              Exemplo: https://zemda.com.br/convite/sua-clinica/token-seguro
            </p>
          </div>

          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px] leading-relaxed">
              <strong>Ainda não possui um link de convite?</strong>
              <p>
                Solicite ao Gerente ou Administrador da sua clínica que acesse o menu <strong>Equipe / Controle de Acessos</strong> e gere um link de convite exclusivo para você.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
