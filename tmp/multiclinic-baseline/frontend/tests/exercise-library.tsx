// Browser regression fixture. Uses production components with HTTP test doubles in the runner.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../src/context/ToastContext';
import { AuthProvider } from '../src/context/AuthContext';
import { PersonalExerciseLibraryModal } from '../src/components/personal/PersonalExerciseLibraryModal';
import { PersonalWorkoutBuilder } from '../src/components/personal/PersonalWorkoutBuilder';
import { PersonalPdfExportModal } from '../src/components/personal/PersonalPdfExportModal';
import '../src/styles/global.css';
const student: any = { id:'student-test', name:'Aluno de Teste', gender:'m', birth_date:'1990-01-01' };
function Fixture() {
  const mode = new URLSearchParams(location.search).get('mode') || 'library';
  const [saved, setSaved] = useState(false);
  const workout = JSON.parse(localStorage.getItem('test-workout') || 'null');
  return <AuthProvider><ToastProvider>
    {saved && <div role="status">Treino salvo</div>}
    {mode === 'library' && <PersonalExerciseLibraryModal isOpen onClose={() => {}} />}
    {mode === 'builder' && <PersonalWorkoutBuilder isOpen onClose={() => {}} onSaved={() => setSaved(true)} student={student} workoutToEdit={workout} />}
    {mode === 'pdf' && <PersonalPdfExportModal isOpen onClose={() => {}} student={student} workouts={[workout]} />}
  </ToastProvider></AuthProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
