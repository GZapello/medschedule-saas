import React from 'react';
import { useAuth } from '../../context/AuthContext';

export function AndroidAppAdmin() {
  const { currentUser: user } = useAuth();
  if (user?.role !== 'superadmin') return null;
  const configured = (import.meta.env.VITE_ZEMDA_ANDROID_TEST_DOWNLOAD_URL || '').trim();
  let url: string | null = null;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol === 'https:') url = parsed.href;
  } catch { /* A missing or invalid URL never becomes a download link. */ }
  // UI visibility is not file authorization. Hosting needs a private/signed URL for real access control.
  return <section aria-labelledby="android-app-title" className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
    <h3 id="android-app-title" className="text-xl font-bold">Zemda para Android</h3>
    <p className="text-teal-700 font-semibold">Versão de teste</p>
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <div><dt>versionName</dt><dd className="font-semibold">{import.meta.env.VITE_ZEMDA_ANDROID_VERSION_NAME || 'Não disponível'}</dd></div>
      <div><dt>versionCode</dt><dd className="font-semibold">{import.meta.env.VITE_ZEMDA_ANDROID_VERSION_CODE || 'Não disponível'}</dd></div>
      {import.meta.env.VITE_ZEMDA_ANDROID_BUILD_DATE && <div><dt>Build do frontend</dt><dd>{import.meta.env.VITE_ZEMDA_ANDROID_BUILD_DATE}</dd></div>}
    </dl>
    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-700 text-white px-4 py-3 font-semibold">Baixar APK de teste</a>
      : <p>Nenhuma versão Android de teste disponível.</p>}
  </section>;
}
