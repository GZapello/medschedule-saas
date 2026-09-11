import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Category, Profession, Specialty } from '../../types';
import {
  Layers,
  Plus,
  Filter,
  CheckCircle2,
  Shield,
  Briefcase,
  Sparkles,
  X
} from 'lucide-react';

export const TaxonomyView: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'professions' | 'categories' | 'specialties'>('professions');

  const [categories, setCategories] = useState<Category[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modais de Criação
  const [showProfModal, setShowProfModal] = useState<boolean>(false);
  const [newProfName, setNewProfName] = useState<string>('');
  const [newProfCatId, setNewProfCatId] = useState<string>('');
  const [newProfRegLabel, setNewProfRegLabel] = useState<string>('');
  const [newProfRegRequired, setNewProfRegRequired] = useState<boolean>(false);

  const [showCatModal, setShowCatModal] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatTerm, setNewCatTerm] = useState<string>('client');
  const [newCatIsClinical, setNewCatIsClinical] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cats, profs, specs] = await Promise.all([
        ApiClient.get<Category[]>('/v1/taxonomy/categories'),
        ApiClient.get<Profession[]>('/v1/taxonomy/professions'),
        ApiClient.get<Specialty[]>('/v1/taxonomy/specialties')
      ]);
      setCategories(cats);
      setProfessions(profs);
      setSpecialties(specs);
      if (cats.length > 0 && !newProfCatId) {
        setNewProfCatId(cats[0].id);
      }
    } catch (err: any) {
      showToast('Erro ao carregar taxonomia do sistema', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateProfession = async () => {
    if (!newProfName || !newProfCatId) {
      showToast('Informe o nome e a categoria da profissão', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/taxonomy/professions', {
        categoryId: newProfCatId,
        name: newProfName,
        registrationBoardLabel: newProfRegLabel || null,
        registrationRequired: newProfRegRequired
      });

      showToast('Nova profissão cadastrada com sucesso!', 'success');
      setShowProfModal(false);
      setNewProfName('');
      setNewProfRegLabel('');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar profissão', 'error');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName) {
      showToast('Informe o nome da categoria', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/taxonomy/categories', {
        name: newCatName,
        defaultTerminology: newCatTerm,
        isClinical: newCatIsClinical
      });

      showToast('Nova categoria macro cadastrada com sucesso!', 'success');
      setShowCatModal(false);
      setNewCatName('');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar categoria', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Taxonomia Dinâmica & Customização
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
            Profissões, Categorias & Especialidades
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastre novas profissões sob demanda para qualquer segmento profissional.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCatModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" /> Nova Categoria
          </button>
          <button
            onClick={() => setShowProfModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" /> Nova Profissão
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('professions')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'professions'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Profissões ({professions.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'categories'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Categorias ({categories.length})
        </button>
        <button
          onClick={() => setActiveTab('specialties')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            activeTab === 'specialties'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Especialidades ({specialties.length})
        </button>
      </div>

      {/* Tab Content: Professions */}
      {activeTab === 'professions' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="px-6 py-3.5">Profissão</th>
                  <th className="px-6 py-3.5">Categoria</th>
                  <th className="px-6 py-3.5">Conselho / Registro</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {professions.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{p.name}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-medium">
                        {p.category_name || 'Geral'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {p.registration_board_label ? (
                        <span className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md font-bold text-[11px]">
                          {p.registration_board_label} {p.registration_required ? '(Obrigatório)' : '(Opcional)'}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                        Ativa
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Categories */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(c => (
            <div key={c.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm">{c.name}</h4>
                {c.is_clinical === 1 ? (
                  <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Área da Saúde
                  </span>
                ) : (
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Serviços Gerais
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 line-clamp-2">{c.description || 'Sem descrição.'}</p>
              <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                Termo padrão do cliente: <span className="font-bold text-slate-700 capitalize">{c.default_terminology}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Content: Specialties */}
      {activeTab === 'specialties' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {specialties.map(s => (
              <div key={s.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 text-xs block">{s.name}</span>
                  <span className="text-[11px] text-slate-400">{s.profession_name || 'Geral'}</span>
                </div>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || '#4f46e5' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Nova Profissão */}
      {showProfModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Cadastrar Nova Profissão</h3>
              <button onClick={() => setShowProfModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Categoria Macro *</label>
                <select
                  value={newProfCatId}
                  onChange={e => setNewProfCatId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome da Profissão *</label>
                <input
                  type="text"
                  value={newProfName}
                  onChange={e => setNewProfName(e.target.value)}
                  placeholder="Ex: Terapeuta Floral, Designer de Unhas, Mentor"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sigla do Conselho / Registro (Opcional)</label>
                <input
                  type="text"
                  value={newProfRegLabel}
                  onChange={e => setNewProfRegLabel(e.target.value)}
                  placeholder="Ex: CRP, CRM, OAB, CREF, CRFa, Registro"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="regReq"
                  checked={newProfRegRequired}
                  onChange={e => setNewProfRegRequired(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-sm"
                />
                <label htmlFor="regReq" className="font-semibold text-slate-700 cursor-pointer">
                  Exigir número de registro no cadastro do profissional
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowProfModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateProfession}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar Profissão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Categoria */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Cadastrar Nova Categoria</h3>
              <button onClick={() => setShowCatModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome da Categoria *</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="Ex: Consultorias Especializadas, Terapias Quânticas"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Termo do Usuário Atendido</label>
                <select
                  value={newCatTerm}
                  onChange={e => setNewCatTerm(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                >
                  <option value="client">Cliente</option>
                  <option value="patient">Paciente</option>
                  <option value="student">Aluno / Aluna</option>
                  <option value="pet_owner">Tutor / Pet</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="catClin"
                  checked={newCatIsClinical}
                  onChange={e => setNewCatIsClinical(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-sm"
                />
                <label htmlFor="catClin" className="font-semibold text-slate-700 cursor-pointer">
                  Área da Saúde (Habilita prontuário clínico sigiloso com conformidade LGPD)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowCatModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateCategory}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar Categoria
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
