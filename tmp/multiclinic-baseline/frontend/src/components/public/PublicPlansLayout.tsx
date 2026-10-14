import React from 'react';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import './seo-editorial.css';

/** Public presentation only; billing and checkout remain in BillingView. */
export function PublicPlansLayout({ children }: { children: React.ReactNode }) {
  const login = () => window.location.assign('/login');
  const register = () => window.location.assign('/cadastro');
  return <div className="public-plans-page bg-white">
    <PublicHeader isLegalOrAuxiliary onLogin={login} onRegisterClinic={register} />
    <main>{children}</main>
    <PublicFooter onLogin={login} onRegisterClinic={register} />
  </div>;
}
