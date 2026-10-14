import React from 'react';
import { Save } from 'lucide-react';
import { ClinicalBooleanSelect } from '../../clinical/ClinicalBooleanSelect';
import { ClinicalNumberInput, ClinicalSelect } from '../../clinical/ClinicalFields';
export interface PeriodontalFormData {
  toothNumber: string; site: string; probingDepth: string; bleeding: boolean | undefined;
  suppuration: boolean | undefined; mobility: string; furcation: string; recession: string; notes: string;
}
export function PeriodontalExamForm({ perioForm, setPerioForm, saving, onSave }: {
  perioForm: PeriodontalFormData; setPerioForm: React.Dispatch<React.SetStateAction<PeriodontalFormData>>;
  saving: boolean; onSave: () => Promise<void>;
}) { return (<div className="p-6 bg-white border border-slate-200 rounded-3xl space-y-4 shadow-sm">
                <span className="text-xs font-black uppercase text-slate-700">
                  Lançamento de Exame Periodontal
                </span>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Dente</label>
                    <input
                      type="text"
                      value={perioForm.toothNumber}
                      onChange={e => setPerioForm({ ...perioForm, toothNumber: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Profundidade (mm)</label>
                    <ClinicalNumberInput
                      value={perioForm.probingDepth === '' ? undefined : Number(perioForm.probingDepth)}
                      onChange={value => setPerioForm({ ...perioForm, probingDepth: value === undefined ? '' : String(value) })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Mobilidade Dental</label>
                    <ClinicalSelect
                      value={perioForm.mobility}
                      onChange={e => setPerioForm({ ...perioForm, mobility: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    >
                      <option value="0">Grau 0 (Fisiológica)</option>
                      <option value="1">Grau I (Horizontal &lt; 1mm)</option>
                      <option value="2">Grau II (Horizontal &gt; 1mm)</option>
                      <option value="3">Grau III (Vertical e Horizontal)</option>
                    </ClinicalSelect>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Lesão de Furca</label>
                    <ClinicalSelect
                      value={perioForm.furcation}
                      onChange={e => setPerioForm({ ...perioForm, furcation: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    >
                      <option value="0">Ausente</option>
                      <option value="1">Grau I</option>
                      <option value="2">Grau II</option>
                      <option value="3">Grau III (Passagem Total)</option>
                    </ClinicalSelect>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <ClinicalBooleanSelect value={perioForm.bleeding} onChange={(value: boolean | undefined) => setPerioForm({ ...perioForm, bleeding: value })} />
                    Sangramento à Sondagem (SS)
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <ClinicalBooleanSelect value={perioForm.suppuration} onChange={(value: boolean | undefined) => setPerioForm({ ...perioForm, suppuration: value })} />
                    Supuração Presente
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onSave}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-2xl text-xs font-bold hover:bg-cyan-700 shadow-sm flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Sondagem
                  </button>
                </div>
              </div>);
}
