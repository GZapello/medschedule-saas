import React from 'react';
export const indicatorKey:Record<string,string>={bmi:'bmi',body_fat_percentage:'bodyFat',whr:'whr',whtr:'whtr',tav_value:'tav',tav_measured_value:'tav',tav_estimated_value:'predictedTav',vai_value:'vai'};
export function assessmentIndicators(a:any) { try {return JSON.parse(a?.calculation_metadata_json || '{}').classifications || {};} catch {return {};} }
export function IndicatorDetails({item}:{item:any}) {
  if(!item)return null;
  return <div className="text-[10px] mt-1 space-y-1"><p className={({teal:'text-teal-700',amber:'text-amber-700',rose:'text-rose-700'} as Record<string,string>)[item.tone] || 'text-slate-500'}>{item.classification}</p>{item.reason && <p className="text-slate-500">{item.reason}</p>}{item.reference && <p className="text-slate-500 break-words">Referência: {item.reference}</p>}</div>;
}
export function PersonalAssessmentIndicator({item,unit='',compact=false}:{item:any,unit?:string,compact?:boolean}) {
  if(!item)return <p className="text-xs text-slate-500">Atualizando resultados…</p>;
  const isOutOfDomain = item.status === 'out_of_domain';
  const valText = item.value!=null && Number.isFinite(Number(item.value))
    ? `${Number(item.value).toLocaleString('pt-BR',{maximumFractionDigits:2})} ${unit}`.trim()
    : isOutOfDomain
    ? (item.reason || 'Estimativa não interpretável pela equação.')
    : 'Não calculado';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="text-xs font-semibold text-slate-700">{item.label}</div>
      <strong className={`text-sm ${isOutOfDomain ? 'text-amber-700 font-medium' : 'text-slate-800'}`}>{valText}</strong>
      {item.limitation && (
        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-lg mt-2 font-medium leading-relaxed">
          {item.limitation}
        </p>
      )}
      {compact ? (
        <div className="text-xs text-slate-500 mt-2 space-y-1">
          {item.value==null && !isOutOfDomain && item.reason && <p>{item.reason}</p>}
          {item.classificationAvailable !== false && item.status==='classified' && <p>Classificação: {item.classification}</p>}
          {item.method && <p>Método: {item.method}</p>}
        </div>
      ) : (
        <IndicatorDetails item={item}/>
      )}
    </div>
  );
}
