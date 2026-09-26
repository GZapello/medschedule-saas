import { useEffect, useState } from 'react';

export function ExerciseAnimation({ url, name, attribution }: { url: string; name: string; attribution?: string }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setPlaying(false); setFailed(false); }, [url]);

  return <section aria-label="Demonstração animada" className="space-y-2">
    <button type="button" className="text-sm text-indigo-700 font-semibold" onClick={() => { setFailed(false); setPlaying(!playing); }}>
      {playing ? 'Ocultar animação' : 'Ver animação do exercício'}
    </button>
    {playing && (failed
      ? <p role="status" className="text-sm text-slate-500">Animação indisponível. Consulte a imagem e as instruções do exercício.</p>
      : <img src={url} alt={`Demonstração animada: ${name}`} className="w-full h-64 object-contain bg-white rounded-xl" onError={() => setFailed(true)} />)}
    {playing && attribution && <p className="text-[9px] text-slate-500">{attribution}</p>}
  </section>;
}
