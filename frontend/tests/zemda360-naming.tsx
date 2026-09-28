import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from '../src/context/AuthContext';
import {ToastProvider} from '../src/context/ToastContext';
import {Sidebar} from '../src/components/common/Sidebar';
import {ZemdaEsteticWorkspace} from '../src/components/estetic/ZemdaEsteticWorkspace';
import '../src/styles/global.css';
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider>{location.search.includes('sidebar')?<Sidebar currentView="zemda360" onNavigate={v=>{document.documentElement.dataset.navigation=v;}} isOpen onClose={()=>{}}/>:<ZemdaEsteticWorkspace initialPatientId="patient-a"/>}</ToastProvider></AuthProvider>);
