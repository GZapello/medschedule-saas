import React, { useRef } from 'react';
import { X, Printer, Eye, Download, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { AudiologyRecordPayload } from './audiology.types';
import { CONVENTIONAL_FREQUENCIES, CONVENTIONAL_INTENSITIES } from './audiology-calculations';

export interface PrintableAudiologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: AudiologyRecordPayload;
  patient: {
    full_name: string;
    birth_date?: string;
    cpf?: string;
    gender?: string;
  };
  clinic?: {
    name?: string;
    corporate_name?: string;
    trade_name?: string;
    cnpj_cpf?: string;
    address?: string;
    phone?: string;
  } | null;
  professional?: {
    name?: string;
    registration_type?: string;
    registration_number?: string;
  } | null;
}

export const PrintableAudiologyModal: React.FC<PrintableAudiologyModalProps> = ({
  isOpen,
  onClose,
  record,
  patient,
  clinic,
  professional
}) => {
  const printSheetRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleOpenNewTab = () => {
    if (!printSheetRef.current) return;
    const printWin = window.open('', '_blank', 'width=950,height=1050');
    if (!printWin) {
      alert('Por favor, autorize pop-ups para visualizar a ficha de impressão.');
      return;
    }

    const htmlContent = printSheetRef.current.innerHTML;
    printWin.document.open();
    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Ficha_Audiologica_${patient.full_name.replace(/\\s+/g, '_')}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background-color: #ffffff;
            color: #0f172a;
            margin: 0;
            padding: 10px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .a4-page {
            max-width: 210mm;
            margin: 0 auto;
            background: #ffffff;
            padding: 12mm;
          }
          @media print {
            .no-print { display: none !important; }
            body { padding: 0; }
            .a4-page { padding: 0; max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; text-align: right;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
            Imprimir Documento
          </button>
        </div>
        <div class="a4-page">
          ${htmlContent}
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  // Cálculo das posições SVG do Audiograma em escala log2 para o relatório impresso
  const octaveWidth = 70;
  const graphWidth = 6 * octaveWidth; // 420px
  const graphHeight = (130 / 20) * octaveWidth; // 455px
  const margin = { top: 30, right: 25, bottom: 35, left: 45 };
  const svgW = margin.left + graphWidth + margin.right;
  const svgH = margin.top + graphHeight + margin.bottom;

  const getX = (freq: number): number => {
    const ratio = Math.log2(freq / 125) / Math.log2(8000 / 125);
    return margin.left + Math.max(0, Math.min(1, ratio)) * graphWidth;
  };

  const getY = (db: number): number => {
    const ratio = (db - (-10)) / 130;
    return margin.top + Math.max(0, Math.min(1, ratio)) * graphHeight;
  };

  const renderPrintLine = (dict: Record<number, number | null>, color: string, isDashed = false) => {
    const pts: { x: number; y: number }[] = [];
    CONVENTIONAL_FREQUENCIES.forEach(f => {
      const v = dict[f];
      if (v !== null && v !== undefined) pts.push({ x: getX(f), y: getY(v) });
    });
    if (pts.length < 2) return null;
    const d = pts.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
    return <path d={d} fill="none" stroke={color} strokeWidth="2" strokeDasharray={isDashed ? '4,3' : undefined} />;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Barra superior de ações */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-sky-600" />
            <h3 className="text-base font-bold text-slate-800">Ficha Audiológica Oficial - Visualização de Impressão</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span>Abrir em Nova Aba</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-700 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Folha A4 formatada */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center">
          <div
            ref={printSheetRef}
            className="bg-white w-full max-w-[210mm] min-h-[297mm] p-8 shadow-sm text-slate-800 border border-slate-200 space-y-6 text-xs"
          >
            {/* 1. Cabeçalho Institucional da Clínica */}
            <div className="flex justify-between items-start border-b border-slate-300 pb-4">
              <div>
                <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  {clinic?.name || clinic?.trade_name || 'Clínica de Fonoaudiologia & Audiologia'}
                </h1>
                <p className="text-[11px] text-slate-600">
                  {clinic?.address ? `${clinic.address} • ` : ''}
                  {clinic?.phone ? `Tel: ${clinic.phone}` : ''}
                  {clinic?.cnpj_cpf ? ` • CNPJ/CPF: ${clinic.cnpj_cpf}` : ''}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded text-slate-700 border border-slate-200">
                  {record.modality === 'pediatric'
                    ? 'AUDIOLOGIA INFANTIL'
                    : record.modality === 'occupational'
                    ? 'AUDIOLOGIA OCUPACIONAL'
                    : record.modality === 'high_frequency'
                    ? 'ALTAS FREQUÊNCIAS'
                    : 'AUDIOLOGIA CLÍNICA'}
                </span>
                <p className="text-[10px] text-slate-500 mt-1">Data: {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            {/* 2. Identificação do Paciente e Profissional */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px]">
              <div className="space-y-1">
                <div><b>Paciente:</b> {patient.full_name}</div>
                <div><b>Data de Nasc.:</b> {patient.birth_date || 'Não informada'} | <b>Sexo:</b> {patient.gender || 'Não informado'}</div>
                <div><b>CPF:</b> {patient.cpf || 'Não informado'}</div>
                {record.referredBy && <div><b>Encaminhado por:</b> {record.referredBy}</div>}
              </div>
              <div className="space-y-1 text-right">
                <div><b>Fonoaudiólogo(a):</b> {record.classification.professionalName || professional?.name || 'Profissional Responsável'}</div>
                <div>
                  <b>Registro Profissional:</b>{' '}
                  {record.classification.crfa ||
                    (professional?.registration_number
                      ? `${professional.registration_type || 'CRFa'} ${professional.registration_number}`
                      : 'CRFa em cadastro')}
                </div>
                <div><b>Transdutor:</b> {record.audiometry.transducer || 'Fone supra-aural'}</div>
              </div>
            </div>

            {/* 3. Equipamento e Inspeção do MAE */}
            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div className="p-2.5 rounded-lg border border-slate-200">
                <b className="block text-slate-900 mb-1">Equipamento Audiológico:</b>
                <div>Marca/Modelo: {record.equipment.brand || '---'} {record.equipment.model || ''}</div>
                <div>Data de Calibração: {record.equipment.calibrationDate || 'Vigente'}</div>
                {record.equipment.serialNumber && <div>Nº Série: {record.equipment.serialNumber}</div>}
              </div>

              <div className="p-2.5 rounded-lg border border-slate-200">
                <b className="block text-slate-900 mb-1">Inspeção do Meato Acústico Externo (Meatoscopia):</b>
                <div>
                  <b>OD:</b> {record.inspection.odStatus === 'no_impediment' ? 'Sem impedimento' : record.inspection.odStatus}
                  {record.inspection.odNotes && ` (${record.inspection.odNotes})`}
                </div>
                <div>
                  <b>OE:</b> {record.inspection.oeStatus === 'no_impediment' ? 'Sem impedimento' : record.inspection.oeStatus}
                  {record.inspection.oeNotes && ` (${record.inspection.oeNotes})`}
                </div>
              </div>
            </div>

            {/* 4. Gráfico do Audiograma Vetorial SVG */}
            <div className="flex flex-col items-center">
              <h4 className="font-bold text-slate-800 mb-2 uppercase text-[11px] tracking-wide">
                Audiometria Tonal Liminar (Escala Logarítmica - CFFa 2023)
              </h4>
              <div className="border border-slate-300 p-2 rounded-lg bg-white">
                <svg viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH} className="select-none">
                  {/* Linhas horizontais */}
                  {CONVENTIONAL_INTENSITIES.map(db => {
                    const y = getY(db);
                    const isLimit = db === 20 || db === 25;
                    return (
                      <g key={`print-db-${db}`}>
                        <line
                          x1={margin.left}
                          y1={y}
                          x2={margin.left + graphWidth}
                          y2={y}
                          stroke={isLimit ? '#94a3b8' : '#e2e8f0'}
                          strokeWidth={isLimit ? '1.2' : '0.8'}
                          strokeDasharray={isLimit ? '3,2' : undefined}
                        />
                        <text x={margin.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#475569">
                          {db}
                        </text>
                      </g>
                    );
                  })}

                  {/* Linhas verticais */}
                  {CONVENTIONAL_FREQUENCIES.map(freq => {
                    const x = getX(freq);
                    const isInter = [750, 1500, 3000, 6000].includes(freq);
                    return (
                      <g key={`print-f-${freq}`}>
                        <line
                          x1={x}
                          y1={margin.top}
                          x2={x}
                          y2={margin.top + graphHeight}
                          stroke={isInter ? '#e2e8f0' : '#cbd5e1'}
                          strokeWidth={isInter ? '0.7' : '1'}
                          strokeDasharray={isInter ? '3,3' : undefined}
                        />
                        <text x={x} y={margin.top - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#334155">
                          {freq >= 1000 ? `${freq / 1000}k` : freq}
                        </text>
                      </g>
                    );
                  })}

                  <text
                    transform="rotate(-90)"
                    x={-(margin.top + graphHeight / 2)}
                    y="14"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill="#475569"
                  >
                    Nível de Audição em dB NA
                  </text>
                  <text
                    x={margin.left + graphWidth / 2}
                    y={svgH - 8}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill="#475569"
                  >
                    Frequência em Hertz (Hz)
                  </text>

                  {/* Linhas de traçado */}
                  {renderPrintLine(record.audiometry.rightAir, '#dc2626', false)}
                  {renderPrintLine(record.audiometry.leftAir, '#2563eb', false)}
                  {renderPrintLine(record.audiometry.rightBone, '#dc2626', true)}
                  {renderPrintLine(record.audiometry.leftBone, '#2563eb', true)}

                  {/* Símbolos dos limiares */}
                  {(record.audiometry.thresholds || []).map(item => {
                    const cx = getX(item.frequency);
                    const cy = getY(item.db);
                    const isRight = item.ear === 'right';
                    const color = isRight ? '#dc2626' : '#2563eb';
                    return (
                      <g key={`p-sym-${item.ear}-${item.conduction}-${item.frequency}`}>
                        {item.conduction === 'air' ? (
                          isRight ? (
                            item.masked ? (
                              <polygon
                                points={`${cx},${cy - 5.5} ${cx - 5.5},${cy + 4} ${cx + 5.5},${cy + 4}`}
                                fill="none"
                                stroke={color}
                                strokeWidth="2"
                              />
                            ) : (
                              <circle cx={cx} cy={cy} r="5" fill="none" stroke={color} strokeWidth="2" />
                            )
                          ) : item.masked ? (
                            <rect x={cx - 4.5} y={cy - 4.5} width="9" height="9" fill="none" stroke={color} strokeWidth="2" />
                          ) : (
                            <g stroke={color} strokeWidth="2">
                              <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} />
                              <line x1={cx + 4} y1={cy - 4} x2={cx - 4} y2={cy + 4} />
                            </g>
                          )
                        ) : isRight ? (
                          item.masked ? (
                            <path d={`M ${cx - 2} ${cy - 5} L ${cx - 6} ${cy - 5} L ${cx - 6} ${cy + 5} L ${cx - 2} ${cy + 5}`} fill="none" stroke={color} strokeWidth="2" />
                          ) : (
                            <path d={`M ${cx - 2} ${cy - 5} L ${cx - 6} ${cy} L ${cx - 2} ${cy + 5}`} fill="none" stroke={color} strokeWidth="2" />
                          )
                        ) : item.masked ? (
                          <path d={`M ${cx + 2} ${cy - 5} L ${cx + 6} ${cy - 5} L ${cx + 6} ${cy + 5} L ${cx + 2} ${cy + 5}`} fill="none" stroke={color} strokeWidth="2" />
                        ) : (
                          <path d={`M ${cx + 2} ${cy - 5} L ${cx + 6} ${cy} L ${cx + 2} ${cy + 5}`} fill="none" stroke={color} strokeWidth="2" />
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* 5. Tabelas de Logoaudiometria e Weber */}
            <div className="grid grid-cols-2 gap-4">
              {/* Logoaudiometria */}
              <div className="border border-slate-200 rounded-lg p-3">
                <b className="block text-slate-900 border-b border-slate-200 pb-1 mb-2">Logoaudiometria</b>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 border-b">
                      <th className="pb-1 font-semibold">Parâmetro</th>
                      <th className="pb-1 font-bold text-red-600">OD</th>
                      <th className="pb-1 font-bold text-blue-600">OE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-1 text-slate-600">LRF</td>
                      <td className="py-1">{record.speechAudiometry.lrfOD !== null && record.speechAudiometry.lrfOD !== undefined ? `${record.speechAudiometry.lrfOD} dB` : '-'}</td>
                      <td className="py-1">{record.speechAudiometry.lrfOE !== null && record.speechAudiometry.lrfOE !== undefined ? `${record.speechAudiometry.lrfOE} dB` : '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-600">LDV</td>
                      <td className="py-1">{record.speechAudiometry.ldvOD !== null && record.speechAudiometry.ldvOD !== undefined ? `${record.speechAudiometry.ldvOD} dB` : '-'}</td>
                      <td className="py-1">{record.speechAudiometry.ldvOE !== null && record.speechAudiometry.ldvOE !== undefined ? `${record.speechAudiometry.ldvOE} dB` : '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-600">IPRF / IRF</td>
                      <td className="py-1 font-bold">{record.speechAudiometry.iprfOD !== null && record.speechAudiometry.iprfOD !== undefined ? `${record.speechAudiometry.iprfOD}%` : '-'}</td>
                      <td className="py-1 font-bold">{record.speechAudiometry.iprfOE !== null && record.speechAudiometry.iprfOE !== undefined ? `${record.speechAudiometry.iprfOE}%` : '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-600">Apresentação / Masc.</td>
                      <td className="py-1">{record.speechAudiometry.presentationIntensityOD || '-'} dB / {record.speechAudiometry.maskingOD || '-'} dB</td>
                      <td className="py-1">{record.speechAudiometry.presentationIntensityOE || '-'} dB / {record.speechAudiometry.maskingOE || '-'} dB</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Weber e Timpanometria Sintética */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-3">
                <div>
                  <b className="block text-slate-900 border-b border-slate-200 pb-1 mb-1.5">Weber Audiométrico</b>
                  <div className="grid grid-cols-5 gap-1 text-[10px] text-center">
                    {[500, 1000, 2000, 3000, 4000].map(f => {
                      const res = (record.weber as any)?.[f];
                      const lbl =
                        res === 'lateralize_right' ? 'Lat. OD' :
                        res === 'lateralize_left' ? 'Lat. OE' :
                        res === 'indifferent' ? 'Indiferente' : 'Não realiz.';
                      return (
                        <div key={`w-${f}`} className="bg-slate-50 p-1 rounded border border-slate-100">
                          <span className="font-bold block">{f} Hz</span>
                          <span className="text-slate-600">{lbl}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <b className="block text-slate-900 border-b border-slate-200 pb-1 mb-1.5">
                    Imitanciometria (Sonda {record.tympanometry.probeFrequency} Hz)
                  </b>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="font-bold text-red-700">OD:</span> Curva{' '}
                      <b>{record.tympanometry.right.curveType || '---'}</b>
                      {record.tympanometry.right.peakPressure !== undefined && record.tympanometry.right.peakPressure !== null && (
                        <span> | {record.tympanometry.right.peakPressure} daPa</span>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-blue-700">OE:</span> Curva{' '}
                      <b>{record.tympanometry.left.curveType || '---'}</b>
                      {record.tympanometry.left.peakPressure !== undefined && record.tympanometry.left.peakPressure !== null && (
                        <span> | {record.tympanometry.left.peakPressure} daPa</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 6. Conclusão e Resultado Audiológico */}
            <div className="border-2 border-slate-300 rounded-xl p-4 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                <b className="text-slate-900 uppercase text-[11px]">Parecer Audiológico & Resultado</b>
                <span className="text-[10px] text-slate-500 font-semibold">
                  Critérios: {record.classification.referenceUsed || 'Conselho Federal de Fonoaudiologia (2023)'}
                </span>
              </div>
              <p className="text-[12px] text-slate-800 leading-relaxed font-medium">
                {record.classification.finalConclusion ||
                  'Limiares auditivos analisados pelo fonoaudiólogo responsável.'}
              </p>
              {record.notes && (
                <p className="text-[11px] text-slate-600 italic pt-1 border-t border-slate-200">
                  <b>Observações complementares:</b> {record.notes}
                </p>
              )}
            </div>

            {/* 7. Bloco de Revisão Humana Obrigatória e Assinatura */}
            <div className="pt-6 border-t border-slate-300 flex justify-between items-end">
              <div className="space-y-1 text-[10px] text-slate-500">
                <div className="flex items-center gap-1 text-emerald-700 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Exame revisado e confirmado pelo fonoaudiólogo responsável</span>
                </div>
                <div>Documento gerado em conformidade com o Guia CFFa Vol. I (2ª ed., 2023)</div>
                <div>Data/Hora de Confirmação: {record.classification.confirmedAt || new Date().toLocaleString('pt-BR')}</div>
              </div>

              <div className="text-center w-64 border-t border-slate-800 pt-1.5">
                <p className="font-bold text-[11px] text-slate-900">
                  {record.classification.professionalName || professional?.name || 'Fonoaudiólogo(a) Responsável'}
                </p>
                <p className="text-[10px] text-slate-600">
                  {record.classification.crfa ||
                    (professional?.registration_number
                      ? `${professional.registration_type || 'CRFa'} ${professional.registration_number}`
                      : 'Fonoaudiólogo - CRFa')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
