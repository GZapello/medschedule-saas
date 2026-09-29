import React from 'react';
interface Props { history: any[]; metric: string; color?: string; unit?: string; title?: string; customTooltipVal?: (data: any) => string }
export const ClinicalTrendChart: React.FC<Props> = ({ history, metric: key, color = '#0d9488', unit = '', title, customTooltipVal }) => {
 const sorted = [...history].filter(d => d && Number.isFinite(Date.parse(d.assessment_date))).sort((a,b) => Date.parse(a.assessment_date)-Date.parse(b.assessment_date));
  // SVG Chart Dimensions
  const width = 680;
  const height = 240;
  const padding = 40;


    const validData = sorted.filter(
      (d) => d[key] !== null && d[key] !== undefined && d[key] !== '' && Number.isFinite(Number(d[key]))
    );

    if (validData.length === 0) {
      return (
        <div className="h-44 flex items-center justify-center text-xs text-slate-400">
          Nenhum dado registrado para esta métrica no histórico.
        </div>
      );
    }

    if (validData.length === 1) {
      const d = validData[0];
      return (
        <div className="h-44 flex flex-col items-center justify-center text-xs text-slate-500 gap-1">
          <span className="font-bold text-slate-800 text-base">
            {d[key]} {unit}
          </span>
          <span>Apenas 1 registro em {new Date(d.assessment_date).toLocaleDateString('pt-BR')}.</span>
          <span className="text-slate-400 text-[11px]">Realize a próxima avaliação para traçar a curva de evolução.</span>
        </div>
      );
    }

    const values = validData.map((d) => Number(d[key]));
    const margin = Math.max((Math.max(...values) - Math.min(...values)) * 0.05, 1);
    const minVal = Math.min(...values) - margin;
    const maxVal = Math.max(...values) + margin;

    const points = validData.map((d, index) => {
      const x = padding + (index / (validData.length - 1)) * (width - padding * 2);
      const val = Number(d[key]);
      const y =
        height - padding - ((val - minVal) / (maxVal - minVal || 1)) * (height - padding * 2);
      return {
        x,
        y,
        val,
        date: d.assessment_date,
        extra: customTooltipVal ? customTooltipVal(d) : null
      };
    });

    const pathD = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');

    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-60" role="img" aria-label={title || 'Evolução clínica'}>
          {/* Linhas de Grade de Fundo */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e2e8f0" strokeWidth="1" />

          {/* Área sombreada sob a curva */}
          <path
            d={`${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`}
            fill={color}
            fillOpacity="0.12"
          />

          {/* Linha da métrica */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Pontos com valores e datas */}
          {points.map((pt, idx) => (
            <g key={idx}>
              <circle cx={pt.x} cy={pt.y} r="5" fill="#ffffff" stroke={color} strokeWidth="3" />
              <text
                x={pt.x}
                y={pt.y - 12}
                textAnchor="middle"
                className="text-[11px] font-bold fill-slate-800"
              >
                {pt.val} {unit}
              </text>
              {pt.extra && (
                <text
                  x={pt.x}
                  y={pt.y - 25}
                  textAnchor="middle"
                  className="text-[9px] font-bold fill-indigo-600"
                >
                  {pt.extra}
                </text>
              )}
              <text
                x={pt.x}
                y={height - 12}
                textAnchor="middle"
                className="text-[10px] fill-slate-400 font-medium"
              >
                {new Date(pt.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );

};
