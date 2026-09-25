import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ToastProvider} from '../src/context/ToastContext';
import {PersonalAssessmentModal} from '../src/components/personal/PersonalAssessmentModal';
import {PersonalAssessmentComparisonModal} from '../src/components/personal/PersonalAssessmentComparisonModal';
import '../src/styles/global.css';
const student:any={id:'patient-1',name:'Paciente Teste',gender:'m'};
function Fixture(){const [saved,setSaved]=useState(false);const mode=new URLSearchParams(location.search).get('mode');const a=JSON.parse(localStorage.getItem('posture-assessment')||'null')||{id:'assessment-2',patient_id:student.id,assessment_date:'2026-09-25',photos:[{photo_type:'front',file_id:'photo-front'},{photo_type:'back',file_id:'photo-back'}]};return <ToastProvider>{saved&&<div role="status">Avaliação salva</div>}{mode==='compare'?<PersonalAssessmentComparisonModal isOpen onClose={()=>{}} student={student} assessmentsList={[{id:'assessment-2',assessment_date:'2026-09-25'},{id:'baseline',assessment_date:'2026-01-01'}] as any}/>:<PersonalAssessmentModal postureOnly={mode==='edit-posture'} isOpen onClose={()=>{}} onSaved={()=>setSaved(true)} student={student} assessmentToEdit={a}/>}</ToastProvider>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
