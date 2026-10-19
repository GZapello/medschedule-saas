import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';
import { ApiClient } from '../src/api/client';
import { DentistryWorkspace } from '../src/components/dentistry/DentistryWorkspace';

import { AnatomicalViewBoundary } from '../src/components/dentistry/HybridOdontogram';

// HTTP fixture persists saves across real page reloads. Production workspace,
// save handler, drawer and autosave hook are mounted without replacements.
ApiClient.get = async (url: string): Promise<any> => (await fetch('/api' + url)).json();
ApiClient.post = async (url: string, body: any): Promise<any> => (await fetch('/api' + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
localStorage.setItem('auth_token', 'fixture');
function BrokenAnatomy(): React.ReactElement { throw new Error('Simulated anatomical rendering failure'); }
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(params.has('failure') ? <AnatomicalViewBoundary onShowFaces={()=>{location.href='/';}}><BrokenAnatomy /></AnatomicalViewBoundary> : <AuthProvider><ToastProvider><DentistryWorkspace initialPatientId="patient" initialAppointmentId="appointment" /></ToastProvider></AuthProvider>);
