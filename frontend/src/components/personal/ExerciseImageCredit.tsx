export function ExerciseImageCredit({ value }: { value?: string }) {
  if (!value) return null;
  try {
    const credit = JSON.parse(value);
    if (!credit.author || !credit.license) return null;
    return <span className="block text-[9px] text-slate-500">Foto: {credit.author} • {credit.license} • Redimensionada para exibição. {/^https:\/\//.test(credit.source || '') ? <a href={credit.source} target="_blank" rel="noopener noreferrer">Fonte</a> : credit.source}</span>;
  } catch { return null; }
}
