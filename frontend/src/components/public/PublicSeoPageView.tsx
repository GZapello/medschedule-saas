import React, { useEffect } from 'react';
import { SeoPageData } from '../../data/seoPagesData';
import { renderEditorialContent } from '../../../../backend/src/seo/seoPresentation';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import './seo-editorial.css';
interface PublicSeoPageViewProps {
 pageData: SeoPageData; onNavigateHome: () => void; onNavigatePage: (slug: string) => void;
 onLogin: () => void; onRegisterClinic: () => void;
}
export const PublicSeoPageView: React.FC<PublicSeoPageViewProps> = ({pageData,onNavigateHome,onNavigatePage,onLogin,onRegisterClinic}) => {
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[pageData.path]);
 return <div className="min-h-screen bg-[#fafbfc] text-slate-800">
  <PublicHeader onLogin={onLogin} onRegisterClinic={onRegisterClinic} isLegalOrAuxiliary onNavigateHome={onNavigateHome}/>
  <main className="seo-editorial" onClick={event=>{
   const a=(event.target as HTMLElement).closest('a');
   if(!a || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button!==0) return;
   const href=a.getAttribute('href');
   if(href==='/'){event.preventDefault();onNavigateHome();}
   else if(href=== '/login'){event.preventDefault();onLogin();}
   else if(href && (href.startsWith('/sistema-') || href.startsWith('/blog') || ['/agenda-online','/prontuario','/gestao-financeira','/mapa-corporal-clinico'].includes(href))){event.preventDefault();onNavigatePage(href.slice(1));}
  }} dangerouslySetInnerHTML={{__html:renderEditorialContent(pageData)}}/>
  <PublicFooter onLogin={onLogin} onRegisterClinic={onRegisterClinic} onNavigateSeoPage={onNavigatePage} onNavigateHome={onNavigateHome}/>
 </div>;
};
