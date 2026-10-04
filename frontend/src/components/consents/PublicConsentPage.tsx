import React,{useEffect,useRef,useState} from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { SignatureCanvas } from './SignatureCanvas';
import { consentDate,publicConsentApi } from './consent-api';
import './consents.css';

function OtpInput({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  return <div className="consent-otp mt-1"><input aria-label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={e=>onChange(e.target.value.replace(/\D/g,''))}/>{Array.from({length:6},(_,i)=><span aria-hidden="true" key={i}>{value[i]||'·'}</span>)}</div>;
}

function CameraPhoto({onPhoto,disabled}:{onPhoto:(value:string|null)=>void;disabled:boolean}) {
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null);
  const mounted=useRef(true);
  const [active,setActive]=useState(false),[photo,setPhoto]=useState<string|null>(null),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const stop=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setActive(false);};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stream.current?.getTracks().forEach(t=>t.stop());};},[]);
  const begin=async()=>{try{setError('');const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});if(!mounted.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;setActive(true);}catch{if(mounted.current)setError('Não foi possível abrir a câmera. A foto é opcional; você pode continuar sem ela.');}};
  useEffect(()=>{if(active&&video.current){video.current.srcObject=stream.current;void video.current.play();}},[active]);
  const capture=()=>{const v=video.current!;if(!v.videoWidth)return;const c=document.createElement('canvas');c.width=Math.min(v.videoWidth,800);c.height=v.videoHeight*c.width/v.videoWidth;c.getContext('2d')!.drawImage(v,0,0,c.width,c.height);const value=c.toDataURL('image/jpeg',.85);setPhoto(value);setConfirmed(false);onPhoto(null);stop();};
  return <div className="space-y-3">
    {!active&&!photo&&<button className="consent-secondary" type="button" disabled={disabled} onClick={begin}>Tirar foto</button>}
    {active&&<><video ref={video} autoPlay muted playsInline className="w-full max-w-xs rounded-xl"/><div className="flex gap-2"><button type="button" className="consent-secondary" onClick={capture} disabled={disabled}>Capturar foto</button><button type="button" className="consent-secondary" onClick={stop}>Fechar câmera</button></div></>}
    {photo&&<><img src={photo} alt="Registro fotográfico da sessão" className="w-24 rounded-lg"/>{confirmed?<p role="status">Foto confirmada.</p>:<button type="button" className="consent-secondary" disabled={disabled} onClick={()=>{setConfirmed(true);onPhoto(photo);}}>Confirmar foto</button>}<button type="button" className="consent-secondary" disabled={disabled} onClick={()=>{setPhoto(null);setConfirmed(false);onPhoto(null);void begin();}}>Refazer foto</button><button type="button" className="consent-secondary" disabled={disabled} onClick={()=>{setPhoto(null);setConfirmed(false);onPhoto(null);}}>Remover foto</button></>}
    {error&&<p role="alert" className="text-sm text-amber-800">{error}</p>}
  </div>;
}

export function PublicConsentPage({token,verificationCode}:{token?:string;verificationCode?:string}) {
  const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [checks,setChecks]=useState([false,false,false]),[signature,setSignature]=useState<string|null>(null);
  const [channel,setChannel]=useState('email'),[code,setCode]=useState(''),[verified,setVerified]=useState(false),[otpSent,setOtpSent]=useState(false);
  const [photoAccepted,setPhotoAccepted]=useState(false),[photo,setPhoto]=useState<string|null>(null),[result,setResult]=useState<any>(null);
  const [retry,setRetry]=useState(0),[cooldown,setCooldown]=useState(0);
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(v=>Math.max(0,v-1)),1000);return()=>clearTimeout(timer);},[cooldown]);
  useEffect(()=>{
    let live=true;
    setLoading(true);setError('');
    document.title=verificationCode?'Verificar documento | Zemda':'Assinatura de termo | Zemda';
    let robots=document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots);}
    robots.content='noindex, nofollow';
    document.querySelector('link[rel="canonical"]')?.remove();
    publicConsentApi<any>(verificationCode?`verify/${verificationCode}`:'read',token?{token}:undefined)
      .then(d=>{if(live){setData(d);setVerified(d.otpVerified||false);setChannel(d.channels?.[0]||'email');}})
      .catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[token,verificationCode,retry]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const requestOtp=()=>run(async()=>{await publicConsentApi('otp/request',{token,channel});setCooldown(60);setOtpSent(true);setVerified(false);setCode('');});
  const verifyOtp=()=>run(async()=>{await publicConsentApi('otp/verify',{token,code});setVerified(true);});
  const sign=()=>run(async()=>{const r=await publicConsentApi('sign',{token,declarations:checks,documentHash:data.documentHash,signatureDataUrl:signature,photoDataUrl:photoAccepted?photo:null,photoAccepted});setResult(r);});
  return <main className="consent-public"><article className="consent-public-card space-y-6">
    <img src="/brand/zemda-logo.png" alt="Zemda" className="w-32"/>
    {loading?<p role="status">Carregando documento...</p>:!data?<div className="space-y-3"><p role="alert" className="text-red-700">{error||'Não foi possível carregar o documento.'}</p><button type="button" className="consent-secondary" onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button><button type="button" className="consent-secondary" onClick={()=>window.history.back()}>Voltar</button></div>:verificationCode?<>
      <ShieldCheck className={`w-10 h-10 ${data.authentic&&data.integrity?'text-teal-700':'text-amber-700'}`}/>
      <h1 className="text-2xl font-bold">{data.authentic?'Documento autêntico':'Documento cancelado/invalidado'}</h1>
      <p>{data.integrity?'Documento íntegro: conteúdo e evidências conferidos.':'Não foi possível confirmar a integridade do documento.'}</p>
      <dl className="space-y-3 text-sm"><div><dt className="font-semibold">Documento</dt><dd>{data.title}</dd></div><div><dt className="font-semibold">Versão</dt><dd>{data.version}</dd></div><div><dt className="font-semibold">Clínica</dt><dd>{data.clinic}</dd></div><div><dt className="font-semibold">Data da assinatura</dt><dd>{consentDate(data.signedAt)}</dd></div><div><dt className="font-semibold">Identificador</dt><dd className="break-all font-mono">{data.signatureId}</dd></div><div><dt className="font-semibold">Fragmento SHA-256</dt><dd className="break-all font-mono">{data.hashFragment}</dd></div></dl>
    </>:result?<div className="space-y-4"><CheckCircle2 className="w-12 h-12 text-teal-600"/><h1 className="text-2xl font-bold">Termo assinado com sucesso</h1><p>A clínica recebeu sua assinatura. Este link de assinatura foi encerrado.</p><a className="consent-secondary" href={result.verificationUrl} rel="noreferrer">Verificar autenticidade</a></div>:<>
      <header className="space-y-2">{data.clinic.logo_url&&<img src={data.clinic.logo_url} alt={data.clinic.name} referrerPolicy="no-referrer" className="max-h-16 max-w-48 object-contain"/>}<p className="font-semibold text-teal-800">{data.clinic.name}</p><h1 className="text-2xl font-bold">{data.title}</h1><p className="text-sm text-slate-600">Paciente: <strong>{data.patient.name}</strong> · Versão {data.version}</p>{data.signer.kind==='guardian'&&<p className="text-sm text-slate-600">Assinatura pelo responsável legal: <strong>{data.signer.name}</strong> ({data.signer.relationship})</p>}<p className="text-xs text-slate-500">Link válido até {consentDate(data.expiresAt)}</p></header>
      <section aria-label="Conteúdo completo do termo" className="whitespace-pre-wrap break-words text-sm leading-7 border-y border-slate-200 py-5">{data.content}</section>
      <fieldset className="space-y-3"><legend className="font-semibold mb-3">Declarações</legend>{data.declarations.map((label:string,i:number)=><label key={label} className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 accent-teal-700 w-4 h-4 shrink-0" checked={checks[i]} disabled={busy} onChange={e=>setChecks(c=>c.map((v,j)=>j===i?e.target.checked:v))}/>{label}</label>)}</fieldset>
      {data.authLevel!=='basic'&&<section className="space-y-3 rounded-xl bg-slate-50 p-4"><h2 className="font-semibold">Confirme sua identidade</h2>{verified?<p className="text-teal-800 text-sm">✓ Código confirmado. A confirmação vale por 10 minutos a partir do envio.</p>:<><p className="text-sm text-slate-600">Enviaremos um código para {data.destinations?.[channel] || 'o contato registrado'}{data.signer.kind==='guardian'?' do responsável legal':''}.</p>{!data.channels.length?<p role="alert" className="text-amber-800 text-sm">Nenhum canal disponível. Peça à clínica para atualizar os contatos e emitir uma nova solicitação.</p>:<><label className="block text-sm">Enviar por<select className="consent-field mt-1" value={channel} disabled={busy} onChange={e=>setChannel(e.target.value)}>{data.channels.map((c:string)=><option key={c} value={c}>{c==='email'?'E-mail':'WhatsApp'}</option>)}</select></label><button type="button" disabled={busy||cooldown>0} className="consent-secondary" onClick={requestOtp}>{cooldown?`Reenviar em ${cooldown}s`:otpSent?'Reenviar código':'Enviar código'}</button>{otpSent&&<div className="flex flex-wrap gap-2 items-end"><label className="text-sm">Código de 6 dígitos<OtpInput value={code} onChange={setCode}/></label><button type="button" className="consent-secondary" disabled={busy||code.length!==6} onClick={verifyOtp}>Validar código</button></div>}</>}</>}</section>}

      <SignatureCanvas onChange={setSignature} disabled={busy}/>
      {data.photoRequested&&<section className="space-y-3"><h2 className="font-semibold">REGISTRO FOTOGRÁFICO</h2><p className="text-sm">Opcional. Ao confirmar a foto, você autoriza seu registro como evidência desta assinatura, restrita à clínica e ao documento. Sem reconhecimento facial ou biometria.</p><CameraPhoto onPhoto={value=>{setPhoto(value);setPhotoAccepted(!!value);}} disabled={busy}/></section>}
      {error&&<p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl p-3">{error}</p>}
      <button type="button" onClick={sign} disabled={busy||!signature||!checks.every(Boolean)||(data.authLevel!=='basic'&&!verified)} className="consent-primary w-full">{busy?'Processando...':'Confirmar assinatura'}</button>
      <p className="text-xs text-slate-500 leading-5">O Zemda registra data, hora, IP e informações do navegador para documentar esta assinatura. Não é necessário criar conta.</p>
    </>}
  </article></main>;
}
