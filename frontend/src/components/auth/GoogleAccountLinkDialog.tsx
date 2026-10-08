import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// The same password-confirmed linking flow is used from login and signup.
export function GoogleAccountLinkDialog({ idToken, email, onClose, onLinked }: {
  idToken: string; email: string; onClose: () => void; onLinked?: () => void;
}) {
  const { loginWithToken } = useAuth();
  const { showToast } = useToast();
  const [password,setPassword] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  return createPortal(<div className="fixed inset-0 z-[15000] bg-slate-900/60 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-label="Vincular Conta Google" className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
      <h3 className="font-bold text-slate-900">Vincular Conta Google</h3>
      <p className="text-sm text-slate-600">Já existe uma conta com o e-mail <strong>{email}</strong>. Confirme sua senha do Zemda para vincular o Google.</p>
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault(); if(busy)return; setBusy(true); setError('');
        try {
          const result = await ApiClient.post<any>('/v1/auth/google',{idToken,context:'login',additionalData:{password}});
          if(!result.token || !result.user)throw new Error('Não foi possível confirmar o vínculo. Tente novamente.');
          loginWithToken(result.token,result.user,result.tenant); onClose(); onLinked?.();
          showToast('Conta Google vinculada com sucesso!','success');
        } catch(err:any) { setError(err.message || 'Falha ao confirmar o vínculo.'); }
        finally { setBusy(false); }
      }}>
        <label className="block text-sm">Sua senha do Zemda<input autoFocus required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="block w-full border rounded-xl px-3 py-2 mt-1" /></label>
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="px-3 py-2">Cancelar</button><button type="submit" disabled={busy} className="bg-teal-700 text-white rounded-xl px-4 py-2 disabled:opacity-50">{busy?'Vinculando…':'Confirmar e Entrar'}</button></div>
      </form>
    </section>
  </div>,document.body);
}
