import React from 'react';
export const emptyAdlItems = () => ([
    { key: 'feeding', label: 'Alimentação (uso de talheres, copo)', score: null, notes: '' },
    { key: 'grooming', label: 'Higiene Pessoal (dentes, face, pentear)', score: null, notes: '' },
    { key: 'bathing', label: 'Banho (lavar corpo, secar-se)', score: null, notes: '' },
    { key: 'upper_dressing', label: 'Vestuário Superior (camisa, casaco)', score: null, notes: '' },
    { key: 'lower_dressing', label: 'Vestuário Inferior (calça, meia, tênis)', score: null, notes: '' },
    { key: 'toileting', label: 'Uso do Sanitário (higiene, manejo de roupas)', score: null, notes: '' },
    { key: 'functional_mobility', label: 'Mobilidade Funcional (transferências)', score: null, notes: '' },
    { key: 'medication_management', label: 'Gestão de Medicamentos (AIVD)', score: null, notes: '' },
    { key: 'home_maintenance', label: 'Cuidados com a Casa / Limpeza (AIVD)', score: null, notes: '' },
    { key: 'tech_use', label: 'Uso do Celular / Computador (AIVD)', score: null, notes: '' },
    { key: 'financial_management', label: 'Gestão Financeira e Compras (AIVD)', score: null, notes: '' }
  ]);
export const ADLAssessment: React.FC<{ adlItems: any[]; setAdlItems: (items: any[]) => void }> = ({ adlItems, setAdlItems }) => (<>{/* LEGENDA DA ESCALA DE 6 NÍVEIS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px] p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="p-2 rounded-lg bg-red-50 text-red-800 border border-red-200 font-medium text-center">
                    <strong>1. Dependente</strong><br/>Ajuda &gt;75%
                  </div>
                  <div className="p-2 rounded-lg bg-orange-50 text-orange-800 border border-orange-200 font-medium text-center">
                    <strong>2. Máxima</strong><br/>Ajuda 50-74%
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-medium text-center">
                    <strong>3. Moderada</strong><br/>Ajuda 25-49%
                  </div>
                  <div className="p-2 rounded-lg bg-yellow-50 text-yellow-800 border border-yellow-200 font-medium text-center">
                    <strong>4. Mínima</strong><br/>Ajuda &lt;25%
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-medium text-center">
                    <strong>5. Supervisão</strong><br/>Preparo / estímulo
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium text-center">
                    <strong>6. Independente</strong><br/>Sem assistência
                  </div>
                </div>

                {/* TABELA DE ITENS DE AVD */}
                <div className="space-y-3">
                  {adlItems.map((item, idx) => (
                    <div key={item.key} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1">
                        <span className="text-xs font-bold text-slate-800">{item.label}</span>
                        <input
                          type="text"
                          placeholder="Observações específicas para esta atividade..."
                          value={item.notes || ''}
                          onChange={e => {
                            const updated = [...adlItems];
                            updated[idx] = { ...updated[idx], notes: e.target.value };
                            setAdlItems(updated);
                          }}
                          className="mt-1 w-full px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        {[
                          { val: 1, label: '1 - Total' },
                          { val: 2, label: '2 - Máx' },
                          { val: 3, label: '3 - Mod' },
                          { val: 4, label: '4 - Mín' },
                          { val: 5, label: '5 - Sup' },
                          { val: 6, label: '6 - Indep' }
                        ].map(lvl => (
                          <button
                            key={lvl.val}
                            type="button"
                            onClick={() => {
                              const updated = [...adlItems];
                              updated[idx] = { ...updated[idx], score: lvl.val };
                              setAdlItems(updated);
                            }}
                            className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                              item.score === lvl.val
                                ? lvl.val === 6
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : lvl.val >= 4
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-amber-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {lvl.val}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div></>);
