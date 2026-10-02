import React, { useEffect, useRef, useState } from 'react';
import { DiarizedSegment, StructuredExtractionResult, StructuredFieldSuggestion, PSYCHOLOGY_FIELDS, formatTimestamp, parseRawTranscriptToSegments, requestPsychologyTranscriptStructure, fetchDiarizationStatus } from '../../services/transcriptionProvider';

type Section = 'session' | 'anamnese' | 'mentalState' | 'riskAssessment' | 'assessment' | 'screenings' | 'goals';
interface Props {
  initialTranscript?: string; isOpen: boolean; onClose: () => void; patientId?: string; appointmentId?: string; patientName?: string;
  currentData: { session: Record<string, any>; anamnese: Record<string, any>; mentalState: Record<string, any>; riskAssessment: Record<string, any>; newAssessment?: Record<string, any>; newScreening?: Record<string, any>; newGoal?: Record<string, any>; newInstrument?: Record<string, any>; goalsList?: any[] };
  onApplyField: (section: Section, field: string, value: string, mode: 'append' | 'replace') => void;
  onApplyGoal?: (goal: any) => void;
}
const titles: Record<string, string> = { session: 'Sessão & Evolução', anamnesis: 'Anamnese Psicológica', mentalState: 'Exame do Estado Mental', riskAssessment: 'Avaliação de Risco', assessment: 'Avaliação & SATEPSI', screenings: 'Triagens & Escalas', goals: 'Metas' };
const roles: Record<string, string> = { professional: 'Profissional', patient: 'Paciente', family: 'Familiar', other: 'Outro' };
type Pending = { section: Section; field: string; item: StructuredFieldSuggestion };
export const PsychologyAIOrganizerModal: React.FC<Props> = ({ initialTranscript, isOpen, onClose, patientId, appointmentId, patientName, currentData, onApplyField }) => {
  const [tab, setTab] = useState<'transcript' | 'suggestions'>('transcript');
  const [segments, setSegments] = useState<DiarizedSegment[]>([]);
  const [speakers, setSpeakers] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<StructuredExtractionResult | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<any>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const recognition = useRef<any>(null);
  const [recording, setRecording] = useState(false);
  const [captureSpeaker, setCaptureSpeaker] = useState('speaker_1');
  const captureRef = useRef(captureSpeaker); captureRef.current = captureSpeaker;
  const invalidate = () => { recognition.current?.abort(); setRecording(false); generation.current++; request.current?.abort(); setLoading(false); setResult(null); setSelected({}); setPending([]); setError(''); };
  useEffect(() => {
    invalidate(); recognition.current?.abort(); setRecording(false); setSegments([]); setSpeakers({}); setConfirmed(false); setPasted(''); setTab('transcript'); setCaptureSpeaker('speaker_1');
    return () => { generation.current++; request.current?.abort(); recognition.current?.abort(); };
  }, [patientId, appointmentId]);
  useEffect(() => { if (!isOpen) { recognition.current?.abort(); setRecording(false); request.current?.abort(); generation.current++; setLoading(false); return; } let active = true; fetchDiarizationStatus().then(data => { if (active) setProvider(data); }).catch(() => {}); return () => { active = false; }; }, [isOpen]);
  useEffect(() => { if (isOpen && initialTranscript) { invalidate(); setSegments(parseRawTranscriptToSegments(initialTranscript)); setConfirmed(false); } }, [isOpen, initialTranscript]);
  const changeSegments = (next: DiarizedSegment[]) => { invalidate(); setSegments(next); setConfirmed(false); };
  const startCapture = () => {
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) { setError('Reconhecimento de voz indisponível neste navegador. Cole a transcrição ou adicione turnos.'); return; }
    invalidate(); setConfirmed(false);
    const rec = new Speech(); recognition.current = rec; rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = false;
    const started = performance.now(); const context = generation.current;
    rec.onresult = (event: any) => { if (context !== generation.current) return; for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) {
      const text = event.results[i][0].transcript.trim(); if (text) setSegments(prev => [...prev, { id: crypto.randomUUID(), speakerId: captureRef.current, text, startTime: (performance.now() - started) / 1000 }]);
    } };
    rec.onerror = () => { setError('Falha no reconhecimento de voz. Revise as permissões do microfone.'); setRecording(false); };
    rec.onend = () => setRecording(false); rec.start(); setRecording(true);
  };
  const run = async () => {
    if (!confirmed || recording || !patientId || !segments.some(s => s.text.trim())) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const version = ++generation.current;
    setLoading(true); setError(''); setPending([]);
    try { const data = await requestPsychologyTranscriptStructure({ patientId, appointmentId, transcript: segments.filter(s => s.text.trim()), speakers, signal: controller.signal }); if (version !== generation.current || controller.signal.aborted) return; setResult(data); setSelected({}); setTab('suggestions'); }
    catch (e: any) { if (version === generation.current && !controller.signal.aborted) setError(e.message || 'Falha ao organizar atendimento.'); }
    finally { if (version === generation.current) setLoading(false); }
  };
  const target = (section: string): Section => section === 'anamnesis' ? 'anamnese' : section as Section;
  const existing = (section: Section, field: string): string => { const key = section === 'assessment' && field === 'professionalSynthesis' ? 'newInstrument' : section === 'assessment' ? 'newAssessment' : section === 'screenings' ? 'newScreening' : section === 'goals' ? 'newGoal' : section; return String((currentData as any)[key]?.[field] || '').trim(); };
  const entries = (section: string): Pending[] => Object.entries((result?.sections as any)?.[section] || {}).flatMap(([field, item]: [string, any]) => item?.value && field in ((PSYCHOLOGY_FIELDS as any)[section] || {}) ? [{ section: target(section), field, item }] : []);
  const resolve = (mode: 'keep' | 'append' | 'replace') => { const next = pending[0]; if (!next) return; if (mode !== 'keep') onApplyField(next.section, next.field, next.item.value, mode); setPending(prev => prev.slice(1)); };
  const evidence = (items: any[] = []) => <details className="mt-2 text-sm"><summary className="cursor-pointer">Ver evidência ({items.length})</summary>{items.map((e, i) => <blockquote key={i} className="border-l-2 pl-3 my-2">{roles[e.role] || e.role || e.speaker} — {e.startTime === undefined ? '[sem timestamp]' : `[${formatTimestamp(e.startTime)}]`}<br />“{e.text}”</blockquote>)}</details>;
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label="Organizar atendimento ZemdaPsico" className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
    <div className="flex justify-between"><h2 className="font-bold text-lg">ZemdaPsico — Ditado & Organização do Atendimento</h2><button onClick={onClose}>Fechar</button></div>
    <p>{patientName} · Revise as sugestões antes de aplicar ao prontuário.</p>
    <div className="flex gap-4"><button onClick={() => setTab('transcript')}>1. Transcrição & Falantes</button><button disabled={!result} onClick={() => setTab('suggestions')}>2. Sugestões Clínicas</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {tab === 'transcript' ? <>
      <p className="bg-amber-50 p-3">Provider atual: Web Speech API — Transcrição por turnos. Sem diarização acústica automática. O profissional atribui e confirma os papéis. {provider ? 'Provedores de áudio externos ainda requerem integração e configuração.' : ''}</p>
      <div className="flex gap-3"><select aria-label="Falante do ditado" value={captureSpeaker} onChange={e => setCaptureSpeaker(e.target.value)}>{[1,2,3].map(n => <option key={n} value={`speaker_${n}`}>Falante {n}</option>)}</select><button onClick={recording ? () => recognition.current?.stop() : startCapture}>{recording ? 'Parar ditado' : 'Iniciar ditado'}</button></div>
      <textarea aria-label="Transcrição para importar" className="w-full border rounded p-2" value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Cole texto, opcionalmente com [00:10] Falante 1:" />
      <button disabled={recording} onClick={() => { changeSegments(parseRawTranscriptToSegments(pasted)); setPasted(''); }}>Importar transcrição</button>
      {[...new Set(segments.map(s => s.speakerId))].map(id => <div key={id}>{id.replace('speaker_', 'Falante ')} → <select aria-label={`Papel ${id}`} value={speakers[id] || ''} onChange={e => { invalidate(); setSpeakers(prev => ({ ...prev, [id]: e.target.value })); setConfirmed(false); }}><option value="">Defina o papel</option>{Object.entries(roles).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div>)}
      {segments.map((s, i) => <div key={s.id} className="border rounded p-3 space-y-2"><span>{s.startTime === undefined ? '[sem timestamp]' : `[${formatTimestamp(s.startTime)}]`}</span><select disabled={recording} aria-label={`Falante turno ${i+1}`} value={s.speakerId} onChange={e => changeSegments(segments.map(x => x.id === s.id ? { ...x, speakerId: e.target.value } : x))}>{[1,2,3].map(n => <option key={n} value={`speaker_${n}`}>Falante {n}</option>)}</select><input disabled={recording} aria-label={`Timestamp turno ${i+1}`} type="number" min="0" placeholder="Segundos" value={s.startTime ?? ''} onChange={e => changeSegments(segments.map(x => x.id === s.id ? { ...x, startTime: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) } : x))}/><textarea disabled={recording} aria-label={`Texto turno ${i+1}`} className="w-full border p-2" value={s.text} onChange={e => changeSegments(segments.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))}/><button disabled={recording || i===0} onClick={() => { const next=[...segments]; [next[i-1],next[i]]=[next[i],next[i-1]]; changeSegments(next); }}>Mover acima</button><button disabled={recording || i===segments.length-1} onClick={() => { const next=[...segments]; [next[i+1],next[i]]=[next[i],next[i+1]]; changeSegments(next); }}>Mover abaixo</button><button disabled={recording} onClick={() => changeSegments(segments.filter(x => x.id !== s.id))}>Excluir turno</button></div>)}
      <button disabled={recording} onClick={() => changeSegments([...segments,{ id: crypto.randomUUID(), speakerId: 'speaker_1', text: '' }])}>Adicionar turno</button>
      <label className="block"><input type="checkbox" checked={confirmed} disabled={recording || !segments.length || segments.some(s => !speakers[s.speakerId])} onChange={e => setConfirmed(e.target.checked)}/> Confirmei os papéis de todos os falantes</label>
      <button className="bg-teal-700 text-white rounded p-2" disabled={!confirmed || loading || recording || !patientId} onClick={run}>{loading ? 'Organizando…' : 'Organizar Atendimento com IA'}</button>
    </> : <>
      <p>{result?.summary}</p><p className="text-sm">{result?.disclaimer}</p>
      <button disabled={!!pending.length} onClick={() => setPending(Object.keys(titles).filter(s => s!=='goals').flatMap(entries).filter(x => selected[`${x.section}.${x.field}`]))}>Aplicar sugestões selecionadas</button>
      {Object.entries(titles).map(([section,title]) => <section key={section} className="border rounded p-4 space-y-3"><h3 className="font-bold">{title}</h3>{section === 'goals' ? (result?.sections.goals?.length ? result.sections.goals.map((goal,i) => <article key={i}><p>{goal.title}</p>{['indicator','targetPeriod','strategy','notes'].map(k => (goal as any)[k] && <p key={k}>{(PSYCHOLOGY_FIELDS.goals as any)[k]}: {(goal as any)[k]}</p>)}{evidence(goal.evidence)}<button disabled={!!pending.length} onClick={() => setPending(Object.entries(PSYCHOLOGY_FIELDS.goals).flatMap(([field,label]) => typeof (goal as any)[field] === 'string' && (goal as any)[field].trim() ? [{section: 'goals' as Section, field, item: {label,value:(goal as any)[field],evidence:goal.evidence || [],requiresProfessionalReview:true}}] : []))}>Aplicar meta pactuada</button></article>) : <p>Nenhuma meta explicitamente pactuada.</p>) : <>
        <button disabled={!!pending.length || !entries(section).length} onClick={() => setPending(entries(section))}>Aplicar seção</button>
        {entries(section).length ? entries(section).map(x => <article key={x.field} className="bg-slate-50 rounded p-3"><label><input type="checkbox" checked={!!selected[`${x.section}.${x.field}`]} onChange={e => setSelected(prev => ({ ...prev, [`${x.section}.${x.field}`]: e.target.checked }))}/> {x.item.label}</label><p className="text-amber-800 text-sm">Requer revisão profissional</p>{existing(x.section,x.field) && <p>Conteúdo atual: {existing(x.section,x.field)}</p>}<p className="whitespace-pre-line">Sugestão da IA: {x.item.value}</p>{evidence(x.item.evidence)}<button disabled={!!pending.length} onClick={() => setPending([x])}>Aplicar</button></article>) : <p>Sem evidência explícita para sugestões nesta seção.</p>}
      </>}</section>)}
    </>}
    {pending[0] && <div role="dialog" aria-label="Revisar aplicação" className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-6 max-w-xl max-h-[85vh] overflow-y-auto space-y-3"><h3>{pending[0].item.label} · {pending.length} pendente(s)</h3><p className="whitespace-pre-line">Conteúdo atual: {existing(pending[0].section,pending[0].field) || '(vazio)'}</p><p className="whitespace-pre-line">Sugestão da IA: {pending[0].item.value}</p>{evidence(pending[0].item.evidence)}<div className="flex gap-4"><button onClick={() => resolve('keep')}>Manter atual</button><button onClick={() => resolve('append')}>Adicionar</button><button onClick={() => resolve('replace')}>{existing(pending[0].section,pending[0].field) ? 'Substituir' : 'Aplicar'}</button><button onClick={() => setPending([])}>Cancelar restantes</button></div></div></div>}
  </div></div>;
};
