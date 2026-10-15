import React from 'react';

export function BillingAccessStatus({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" aria-busy={!error}>
    <div className="max-w-md text-center space-y-5">
      <img src="/brand/zemda-logo.png" alt="Zemda" className="h-10 w-auto mx-auto" />
      {error ? <div role="alert" className="space-y-4">
        <p className="text-slate-700 font-semibold">Não foi possível verificar sua assinatura agora.</p>
        <button type="button" onClick={onRetry} className="min-h-11 px-5 py-3 rounded-xl bg-teal-700 text-white font-semibold">Tentar novamente</button>
      </div> : <div role="status" className="space-y-3">
        <div className="w-8 h-8 mx-auto border-4 border-teal-200 border-t-teal-700 rounded-full animate-spin" aria-hidden="true" />
        <p className="text-slate-600 font-semibold">Carregando Zemda...</p>
      </div>}
    </div>
  </div>;
}
