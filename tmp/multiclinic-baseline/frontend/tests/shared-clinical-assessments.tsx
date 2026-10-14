import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from '../src/context/AuthContext';
import {ToastProvider} from '../src/context/ToastContext';
import {ApiClient} from '../src/api/client';
import {PersonalAssessmentModal} from '../src/components/personal/PersonalAssessmentModal';
const student:any={id:'patient',name:'Paciente de teste',anthropometric_sex:'female',birth_date:'1990-01-01'};
const caps:Record<string,string[]>={nutri:['ANTHROPOMETRY','BODY_COMPOSITION'],fisio:['POSTURE_GAIT','MOBILITY_ASSESSMENT','MUSCLE_STRENGTH','FUNCTIONAL_TESTS','FUNCTIONAL_ASSESSMENT','PAIN_ASSESSMENT','PHOTO_MONITORING'],estetic:['ANTHROPOMETRY','PHOTO_MONITORING']};
localStorage.setItem('auth_token','fixture');
(window as any).__saved=[];
ApiClient.get=async(path:string):Promise<any>=>path==='/v1/auth/me'?{user:{id:'user',name:'Profissional',role:'professional'},tenant:{id:'clinic',name:'Clínica'}}:path.includes('tav/protocols')?{protocols:[]}:{};
ApiClient.post=async(path:string,body:any):Promise<any>=>{if(path.endsWith('/preview'))return {values:{},classifications:{}};(window as any).__saved.push({path,body});return {id:'saved'};};
function Fixture(){const [profession,setProfession]=useState('nutri');return <><div style={{position:"fixed",bottom:0,left:0,zIndex:100,background:"white"}}>{Object.keys(caps).map(key=><button key={key} onClick={()=>setProfession(key)}>{key}</button>)}</div><PersonalAssessmentModal key={profession} isOpen student={student} patientId="patient" appointmentId="appointment" allowedCapabilities={caps[profession]} sourceModule={profession} onClose={()=>{}} onSaved={()=>{}}/></>;}
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider><Fixture/></ToastProvider></AuthProvider>);
