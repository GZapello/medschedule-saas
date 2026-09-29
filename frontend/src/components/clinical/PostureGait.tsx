import React from 'react';
export const PostureGait: React.FC<{ postureAnterior: string; setPostureAnterior: (value: string) => void; postureLateral: string; setPostureLateral: (value: string) => void; posturePosterior: string; setPosturePosterior: (value: string) => void; gaitAnalysis: string; setGaitAnalysis: (value: string) => void }> = ({ postureAnterior, setPostureAnterior, postureLateral, setPostureLateral, posturePosterior, setPosturePosterior, gaitAnalysis, setGaitAnalysis }) => (<>                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Vista Anterior</label>
                      <textarea
                        rows={3}
                        value={postureAnterior}
                        onChange={e => setPostureAnterior(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Vista Lateral</label>
                      <textarea
                        rows={3}
                        value={postureLateral}
                        onChange={e => setPostureLateral(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Vista Posterior</label>
                      <textarea
                        rows={3}
                        value={posturePosterior}
                        onChange={e => setPosturePosterior(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Análise de Marcha</label>
                    <textarea
                      rows={3}
                      value={gaitAnalysis}
                      onChange={e => setGaitAnalysis(e.target.value)}
                      placeholder="Contato inicial, resposta à carga, apoio médio, balanço e claudicação..."
                      className="w-full p-3 text-xs rounded-xl border border-slate-200"
                    />
                  </div></>);
