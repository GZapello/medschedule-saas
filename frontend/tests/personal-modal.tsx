import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from '../src/context/AuthContext';
import {ApiClient} from '../src/api/client';
import {PersonalPdfExportModal} from '../src/components/personal/PersonalPdfExportModal';
const student:any={id:'fixture-patient',name:'Aluno de teste',full_name:'Aluno de teste',anthropometric_sex:'male',status:'active',created_at:'2026-01-01'};
const history:any[]=[{id:'first',assessment_date:'2025-01-01',weight:75,height:180,body_fat_percentage:20,age_at_assessment:29,anthropometric_sex_at_assessment:'male'},{id:'latest',assessment_date:'2026-01-01',weight:80,height:180,body_fat_percentage:22,age_at_assessment:30,anthropometric_sex_at_assessment:'male'}];
const clinic={id:'fixture-clinic',name:'Clínica de teste'};
const user={id:'fixture-user',name:'Profissional de teste',role:'clinic_admin'};
localStorage.setItem('auth_token','test-fixture-token');
(window as any).__reports=[];(window as any).__printed=0;
window.print=()=>{(window as any).__printed++};
ApiClient.get=async(path:string):Promise<any>=>{
  if(path==='/v1/auth/me')return {user,tenant:clinic};
  if(path==='/v1/clinics/current')return clinic;
  if(path.endsWith('/report-data')){
    const id=path.split('/').at(-2);(window as any).__reports.push(id);
    await new Promise(r=>setTimeout(r,100));
    const assessment=history.find(a=>a.id===id);
    return {assessment,student,professional:user,previous_assessment:id==='latest'?history[0]:null,evolution_history:history};
  }
  return {};
};
createRoot(document.getElementById('root')!).render(<AuthProvider><PersonalPdfExportModal isOpen onClose={()=>{}} student={student} workouts={[]} latestAssessment={history[1]} assessmentsList={history}/></AuthProvider>);
