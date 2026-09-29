import React from 'react';
import { Plus } from 'lucide-react';
import { PhysioFunctionalScaleItem } from '../physiotherapy/regionalData';
export const ClinicalScales: React.FC<{ scales: PhysioFunctionalScaleItem[]; setScales: (value: PhysioFunctionalScaleItem[]) => void }> = ({ scales, setScales }) => (<div className="p-4 bg-purple-50/40 rounded-xl border border-purple-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-900">Escalas Funcionais Aplicadas</h4>
                  <button
                    type="button"
                    onClick={() => setScales([...scales, { scaleName: '', score: '', interpretation: '' }])}
                    className="flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Escala
                  </button>
                </div>

                <div className="space-y-2">
                  {scales.map((s, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white p-2.5 rounded-lg border border-purple-100">
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Nome da Escala:</label>
                        <input
                          type="text"
                          value={s.scaleName}
                          onChange={e => {
                            const updated = [...scales];
                            updated[idx] = { ...updated[idx], scaleName: e.target.value };
                            setScales(updated);
                          }}
                          placeholder="Ex: SPADI, DASH, LEFS, Roland-Morris..."
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Score / Pontuação:</label>
                        <input
                          type="text"
                          value={s.score ?? ''}
                          onChange={e => {
                            const updated = [...scales];
                            updated[idx] = { ...updated[idx], score: e.target.value };
                            setScales(updated);
                          }}
                          placeholder="Ex: 48 / 100 (48%)"
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 font-semibold mb-0.5">Interpretação:</label>
                        <input
                          type="text"
                          value={s.interpretation || ''}
                          onChange={e => {
                            const updated = [...scales];
                            updated[idx] = { ...updated[idx], interpretation: e.target.value };
                            setScales(updated);
                          }}
                          placeholder="Ex: Incapacidade funcional moderada"
                          className="w-full text-xs px-2 py-1 rounded border border-slate-200"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>);
