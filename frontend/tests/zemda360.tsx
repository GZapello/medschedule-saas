import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from '../src/context/AuthContext';
import {ToastProvider} from '../src/context/ToastContext';
import {ZemdaBodyRecordsView} from '../src/components/zemda-body/ZemdaBodyRecordsView';
import {ZemdaBodyWorkspace} from '../src/components/zemda-body/ZemdaBodyWorkspace';
import '../src/styles/global.css';
const params=new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider><main className="p-4 bg-slate-100 min-h-screen">{params.has('id')?<ZemdaBodyWorkspace patientId="patient-a" initialAssessmentId={params.get('id')!} readOnly={params.has('readonly')}/>:<ZemdaBodyRecordsView/>}</main></ToastProvider></AuthProvider>);
