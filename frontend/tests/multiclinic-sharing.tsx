import React from 'react';
import {createRoot} from 'react-dom/client';
import {InvitePatientSharing} from '../src/components/auth/InvitePatientSharing';
import {ApiClient} from '../src/api/client';
(window as any).saved=[];
(ApiClient as any).get=async(path:string)=>path.includes('/patients')?[
  {id:'p1',full_name:'Ana Silva',birth_date:'1990-01-01',identifier_suffix:'1234'},
  {id:'p2',full_name:'Maria Souza',birth_date:'1992-02-02',identifier_suffix:'5678'}
]:{sources:[{id:'a',name:'Clínica A'}],consentVersion:'2026-10-14.1'};
(ApiClient as any).post=async(path:string,body:any)=>{(window as any).saved.push({path,body});return {id:'share'};};
createRoot(document.getElementById('root')!).render(<InvitePatientSharing targetId="b" targetName="Clínica B" onFinish={async()=>{(window as any).finished=true;}}/>);
