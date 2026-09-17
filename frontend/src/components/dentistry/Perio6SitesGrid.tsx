import React, { useState, useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, TrendingDown, Info, Save } from 'lucide-react';

export interface PerioSiteData {
  depth: number; // Profundidade de sondagem (mm)
  recession?: number; // Recessão / margem gengival (mm)
  attachmentLoss?: number; // NIC
  bleeding?: boolean; // Sangramento à sondagem (SS / BOP)
  suppuration?: boolean; // Supuração
}

export interface ToothPerioData {
  toothNumber: number;
  mobility?: 0 | 1 | 2 | 3;
  furcation?: 0 | 1 | 2 | 3;
  plaque?: boolean;
  // 6 sites
  dv?: PerioSiteData;
  v?: PerioSiteData;
  mv?: PerioSiteData;
  dp?: PerioSiteData;
  p_l?: PerioSiteData;
  mp?: PerioSiteData;
}

export interface Perio6SitesGridProps {
  initialRecords?: Record<number, ToothPerioData>;
  onSave?: (records: Record<number, ToothPerioData>) => void;
  readOnly?: boolean;
}

const TEETH_NUMBERS_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const TEETH_NUMBERS_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export const Perio6SitesGrid: React.FC<Perio6SitesGridProps> = ({
  initialRecords = {},
  onSave,
  readOnly = false
}) => {
  const [records, setRecords] = useState<Record<number, ToothPerioData>>(initialRecords);
  const [selectedTooth, setSelectedTooth] = useState<number>(16);

  // Automated Periodontal Indicators
  const indicators = useMemo(() => {
    let totalSites = 0;
    let bleedingSites = 0;
    let sitesGe4mm = 0;
    let sitesGe6mm = 0;
    let totalTeethWithPlaque = 0;
    let totalTeethEvaluated = 0;

    Object.values(records).forEach(tooth => {
      totalTeethEvaluated++;
      if (tooth.plaque) totalTeethWithPlaque++;

      const siteKeys: (keyof ToothPerioData)[] = ['dv', 'v', 'mv', 'dp', 'p_l', 'mp'];
      siteKeys.forEach(k => {
        const site = tooth[k] as PerioSiteData | undefined;
        if (site && site.depth !== undefined && site.depth > 0) {
          totalSites++;
          if (site.bleeding) bleedingSites++;
          if (site.depth >= 6) sitesGe6mm++;
          else if (site.depth >= 4) sitesGe4mm++;
        }
      });
    });

    const bleedingRate = totalSites > 0 ? Math.round((bleedingSites / totalSites) * 100) : 0;
    const plaqueRate = totalTeethEvaluated > 0 ? Math.round((totalTeethWithPlaque / totalTeethEvaluated) * 100) : 0;

    return {
      totalSites,
      bleedingSites,
      bleedingRate,
      plaqueRate,
      sitesGe4mm,
      sitesGe6mm
    };
  }, [records]);

  const updateSiteField = (
    toothNum: number,
    siteKey: 'dv' | 'v' | 'mv' | 'dp' | 'p_l' | 'mp',
    field: keyof PerioSiteData,
    value: any
  ) => {
    if (readOnly) return;
    setRecords(prev => {
      const tooth = prev[toothNum] || { toothNumber: toothNum };
      const currentSite = tooth[siteKey] || { depth: 0 };
      const updatedSite = { ...currentSite, [field]: value };
      return {
        ...prev,
        [toothNum]: {
          ...tooth,
          [siteKey]: updatedSite
        }
      };
    });
  };

  const updateToothProp = (toothNum: number, prop: 'mobility' | 'furcation' | 'plaque', value: any) => {
    if (readOnly) return;
    setRecords(prev => {
      const tooth = prev[toothNum] || { toothNumber: toothNum };
      return {
        ...prev,
        [toothNum]: {
          ...tooth,
          [prop]: value
        }
      };
    });
  };

  const currentToothData = records[selectedTooth] || { toothNumber: selectedTooth };

  const getDepthColor = (depth?: number) => {
    if (!depth || depth < 4) return 'border-slate-200 text-slate-800 bg-white';
    if (depth < 6) return 'border-amber-400 text-amber-900 bg-amber-50 font-bold';
    return 'border-rose-500 text-rose-900 bg-rose-50 font-black';
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-rose-600" />
            Periodontograma de 6 Sítios por Dente
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sondagem vestibular (DV, V, MV) e lingual/palatina (DP, L/P, MP) com cálculo automático de índices clínicos
          </p>
        </div>

        {onSave && !readOnly && (
          <button
            type="button"
            onClick={() => onSave(records)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Save className="w-4 h-4" />
            Salvar Periodontograma
          </button>
        )}
      </div>

      {/* Automated Indicators Panel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl">
          <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 block">
            Sangramento à Sondagem (SS)
          </span>
          <div className="text-xl font-black text-rose-700 dark:text-rose-400 mt-0.5">
            {indicators.bleedingRate}%
          </div>
          <span className="text-[10px] text-rose-600/80">
            {indicators.bleedingSites} de {indicators.totalSites} sítios
          </span>
        </div>

        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl">
          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block">
            Índice de Placa Visível
          </span>
          <div className="text-xl font-black text-amber-700 dark:text-amber-400 mt-0.5">
            {indicators.plaqueRate}%
          </div>
          <span className="text-[10px] text-amber-600/80">Dos dentes avaliados</span>
        </div>

        <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl">
          <span className="text-[11px] font-bold text-orange-800 dark:text-orange-300 block">
            Bolsas Moderadas (4 a 5mm)
          </span>
          <div className="text-xl font-black text-orange-700 dark:text-orange-400 mt-0.5">
            {indicators.sitesGe4mm}
          </div>
          <span className="text-[10px] text-orange-600/80">Sítios com perda moderada</span>
        </div>

        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl">
          <span className="text-[11px] font-bold text-red-800 dark:text-red-300 block">
            Bolsas Profundas (≥ 6mm)
          </span>
          <div className="text-xl font-black text-red-700 dark:text-red-400 mt-0.5">
            {indicators.sitesGe6mm}
          </div>
          <span className="text-[10px] text-red-600/80">Sítios periodontais graves</span>
        </div>
      </div>

      {/* Teeth Selector Quick Strip */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
          Selecione o Dente para Sondagem Detalhada:
        </label>
        {/* Upper teeth */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TEETH_NUMBERS_UPPER.map(num => (
            <button
              key={num}
              type="button"
              onClick={() => setSelectedTooth(num)}
              className={`px-2 py-1 rounded text-xs font-bold font-mono transition ${
                selectedTooth === num
                  ? 'bg-rose-600 text-white shadow-sm'
                  : records[num]?.dv?.depth
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {num}
            </button>
          ))}
        </div>
        {/* Lower teeth */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TEETH_NUMBERS_LOWER.map(num => (
            <button
              key={num}
              type="button"
              onClick={() => setSelectedTooth(num)}
              className={`px-2 py-1 rounded text-xs font-bold font-mono transition ${
                selectedTooth === num
                  ? 'bg-rose-600 text-white shadow-sm'
                  : records[num]?.dv?.depth
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* 6-Site Grid Editor for Selected Tooth */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-rose-600 text-white font-black text-sm flex items-center justify-center">
              {selectedTooth}
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Sondagem 6 Sítios do Elemento {selectedTooth}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!currentToothData.plaque}
                onChange={e => updateToothProp(selectedTooth, 'plaque', e.target.checked)}
                disabled={readOnly}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
              />
              <span className="font-semibold text-slate-700 dark:text-slate-300">Placa Visível</span>
            </label>

            <div className="flex items-center gap-1">
              <span className="text-slate-500">Mobilidade:</span>
              <select
                value={currentToothData.mobility || 0}
                onChange={e => updateToothProp(selectedTooth, 'mobility', Number(e.target.value))}
                disabled={readOnly}
                className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5"
              >
                <option value={0}>0</option>
                <option value={1}>Grau I</option>
                <option value={2}>Grau II</option>
                <option value={3}>Grau III</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-slate-500">Furca:</span>
              <select
                value={currentToothData.furcation || 0}
                onChange={e => updateToothProp(selectedTooth, 'furcation', Number(e.target.value))}
                disabled={readOnly}
                className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5"
              >
                <option value={0}>Ausente</option>
                <option value={1}>Grau I</option>
                <option value={2}>Grau II</option>
                <option value={3}>Grau III</option>
              </select>
            </div>
          </div>
        </div>

        {/* 6 Sítios Input Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Face Vestibular: DV, V, MV */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Face Vestibular
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'dv' as const, label: 'Disto-Vestibular (DV)' },
                { key: 'v' as const, label: 'Vestibular (V)' },
                { key: 'mv' as const, label: 'Mésio-Vestibular (MV)' }
              ].map(({ key, label }) => {
                const site = currentToothData[key] || { depth: 0 };
                return (
                  <div key={key} className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 block truncate">{label}</span>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">PS (mm):</label>
                      <input
                        type="number"
                        min="0"
                        max="15"
                        value={site.depth || ''}
                        onChange={e => updateSiteField(selectedTooth, key, 'depth', Number(e.target.value))}
                        disabled={readOnly}
                        className={`w-full text-xs font-bold text-center px-2 py-1 rounded-lg border ${getDepthColor(site.depth)}`}
                        placeholder="0"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-rose-600 font-semibold select-none">
                      <input
                        type="checkbox"
                        checked={!!site.bleeding}
                        onChange={e => updateSiteField(selectedTooth, key, 'bleeding', e.target.checked)}
                        disabled={readOnly}
                        className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                      />
                      <span>Sangramento</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Face Palatina / Lingual: DP, L/P, MP */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Face Lingual / Palatina
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'dp' as const, label: 'Disto-Pal/Ling (DP)' },
                { key: 'p_l' as const, label: 'Palatina/Lingual (P/L)' },
                { key: 'mp' as const, label: 'Mésio-Pal/Ling (MP)' }
              ].map(({ key, label }) => {
                const site = currentToothData[key] || { depth: 0 };
                return (
                  <div key={key} className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 block truncate">{label}</span>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">PS (mm):</label>
                      <input
                        type="number"
                        min="0"
                        max="15"
                        value={site.depth || ''}
                        onChange={e => updateSiteField(selectedTooth, key, 'depth', Number(e.target.value))}
                        disabled={readOnly}
                        className={`w-full text-xs font-bold text-center px-2 py-1 rounded-lg border ${getDepthColor(site.depth)}`}
                        placeholder="0"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-rose-600 font-semibold select-none">
                      <input
                        type="checkbox"
                        checked={!!site.bleeding}
                        onChange={e => updateSiteField(selectedTooth, key, 'bleeding', e.target.checked)}
                        disabled={readOnly}
                        className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                      />
                      <span>Sangramento</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
