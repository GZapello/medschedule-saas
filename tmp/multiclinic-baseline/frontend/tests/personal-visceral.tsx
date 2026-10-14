import React from 'react';
import {createRoot} from 'react-dom/client';
import {ToastProvider} from '../src/context/ToastContext';
import {PersonalAssessmentModal} from '../src/components/personal/PersonalAssessmentModal';
import {ApiClient} from '../src/api/client';
const student:any={id:'fixture',name:'Fixture',full_name:'Fixture',birth_date:'1996-01-01',anthropometric_sex:'female'};
ApiClient.get=async():Promise<any>=>[];
ApiClient.post=async(url:string,body:any):Promise<any>=>{if(url.endsWith('/preview'))return fetch('/preview',{method:'POST',body:JSON.stringify(body)}).then(r=>r.json());return {};};
createRoot(document.getElementById('root')!).render(<ToastProvider><PersonalAssessmentModal isOpen student={student} onClose={()=>{}} onSaved={()=>{}}/></ToastProvider>);
