import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from '../src/context/AuthContext';
import {ToastProvider} from '../src/context/ToastContext';
import {Zemda360RecordsView} from '../src/components/zemda360/Zemda360RecordsView';
import {Zemda360Workspace} from '../src/components/zemda360/Zemda360Workspace';
import '../src/styles/global.css';
const params=new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider><main className="p-4 bg-slate-100 min-h-screen">{params.has('id')?<Zemda360Workspace patientId="patient-a" initialAssessmentId={params.get('id')!} readOnly={params.has('readonly')}/>:<Zemda360RecordsView/>}</main></ToastProvider></AuthProvider>);
