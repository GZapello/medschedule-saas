import React from 'react';
import { createRoot } from 'react-dom/client';
import { ZemdaLandingPage } from '../src/components/public/ZemdaLandingPage';
import '../src/styles/global.css';
const signal = (action: string) => { document.documentElement.dataset.testAction = action; };
createRoot(document.getElementById('root')!).render(<ZemdaLandingPage onLogin={() => signal('login')} onRegisterClinic={() => signal('register')} onNavigateSeoPage={slug => signal(slug)} />);
