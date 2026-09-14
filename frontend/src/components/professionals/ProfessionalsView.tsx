import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Professional, Profession, Specialty } from '../../types';
import {
  UserCog,
  Plus,
  Clock,
  Calendar,
  Shield,
  Ban,
  X,
  CheckCircle2,
  Mail,
  Phone,
  Edit3,
  Share2,
  Link,
  Wallet,
  DollarSign
} from 'lucide-react';
import { formatDoctorName } from '../../utils/formatters';

export const ProfessionalsView: React.FC = () => {
  const { showToast } = useToast();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modal Novo Profissional (Item 9: Sexo e Tratamento Dr./Dra.)
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('123456');
  const [phone, setPhone] = useState<string>('');
  const [professionId, setProfessionId] = useState<string>('');
  const [specialtyId, setSpecialtyId] = useState<string>('');
  const [specialtyName, setSpecialtyName] = useState<string>('');
  const [registrationType, setRegistrationType] = useState<string>('CRP');
  const [registrationNumber, setRegistrationNumber] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [practiceAreas, setPracticeAreas] = useState<string>('');
  const [bufferMinutes, setBufferMinutes] = useState<number>(10);
  const [slug, setSlug] = useState<string>('');
  const [publicBookingEnabled, setPublicBookingEnabled] = useState<boolean>(true);
  const [remunerationType, setRemunerationType] = useState<'commission' | 'salary' | 'both'>('commission');
  const [commissionPercentage, setCommissionPercentage] = useState<number>(50);
  const [fixedSalary, setFixedSalary] = useState<number>(0);
  const [paymentDay, setPaymentDay] = useState<number>(5);

  // Modal Editar Profissional
  const [editingProf, setEditingProf] = useState<Professional | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editGender, setEditGender] = useState<'M' | 'F'>('M');
  const [editProfessionId, setEditProfessionId] = useState<string>('');
  const [editSpecialtyId, setEditSpecialtyId] = useState<string>('');
  const [editSpecialtyName, setEditSpecialtyName] = useState<string>('');
  const [editRegistrationType, setEditRegistrationType] = useState<string>('CRP');
  const [editRegistrationNumber, setEditRegistrationNumber] = useState<string>('');
  const [editBio, setEditBio] = useState<string>('');
  const [editPracticeAreas, setEditPracticeAreas] = useState<string>('');
  const [editBufferMinutes, setEditBufferMinutes] = useState<number>(10);
  const [editSlug, setEditSlug] = useState<string>('');
  const [editPublicBookingEnabled, setEditPublicBookingEnabled] = useState<boolean>(true);
  const [editRemunerationType, setEditRemunerationType] = useState<'commission' | 'salary' | 'both'>('commission');
  const [editCommissionPercentage, setEditCommissionPercentage] = useState<number>(0);
  const [editFixedSalary, setEditFixedSalary] = useState<number>(0);
  const [editPaymentDay, setEditPaymentDay] = useState<number>(5);

  const handleCopyBookingLink = (prof: Professional) => {
    const slugVal = prof.slug || (prof.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + prof.id.slice(-4));
    const url = `${window.location.origin}/agendar/${slugVal}`;
    navigator.clipboard.writeText(url);
    showToast(`Link de agendamento copiado: ${url}`, 'success');
  };

  // Modal Bloqueio de Horário
  const [showBlockModal, setShowBlockModal] = useState<boolean>(false);
  const [blockProfId, setBlockProfId] = useState<string>('');
  const [blockTitle, setBlockTitle] = useState<string>('');
  const [blockStart, setBlockStart] = useState<string>('');
  const [blockEnd, setBlockEnd] = useState<string>('');
  const [blockType, setBlockType] = useState<string>('absence');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [profs, taxonomyProfs, taxonomySpecs] = await Promise.all([
        ApiClient.get<Professional[]>('/v1/professionals'),
        ApiClient.get<Profession[]>('/v1/taxonomy/professions'),
        ApiClient.get<Specialty[]>('/v1/taxonomy/specialties')
      ]);
      setProfessionals(profs);
      setProfessions(taxonomyProfs);
      setSpecialties(taxonomySpecs);
      if (taxonomyProfs.length > 0 && !professionId) {
        setProfessionId(taxonomyProfs[0].id);
      }
    } catch (err: any) {
      showToast('Erro ao carregar equipe de profissionais', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateProfessional = async () => {
    if (!name || !email) {
      showToast('Nome e e-mail são obrigatórios', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/professionals', {
        name,
        email,
        password,
        phone,
        professionId,
        specialtyId: specialtyId || null,
        specialtyName: specialtyName.trim(),
        specialtyCustom: specialtyName.trim(),
        registrationType: registrationType || null,
        registrationNumber: registrationNumber || null,
        bio: bio || null,
        practiceAreas: practiceAreas || null,
        bufferMinutes: Number(bufferMinutes),
        gender,
        slug: slug.trim() || null,
        publicBookingEnabled,
        remunerationType,
        commissionPercentage: Number(commissionPercentage),
        fixedSalary: Number(fixedSalary),
        paymentDay: Number(paymentDay)
      });

      showToast('Profissional cadastrado com sucesso!', 'success');
      setShowNewModal(false);
      setName('');
      setGender('M');
      setEmail('');
      setPhone('');
      setSpecialtyName('');
      setRegistrationNumber('');
      setBio('');
      setPracticeAreas('');
      setSlug('');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar profissional', 'error');
    }
  };

  const handleSaveEditProfessional = async () => {
    if (!editingProf || !editName) {
      showToast('Nome é obrigatório', 'error');
      return;
    }

    try {
      await ApiClient.put(`/v1/professionals/${editingProf.id}`, {
        name: editName,
        gender: editGender,
        professionId: editProfessionId,
        specialtyId: editSpecialtyId || null,
        specialtyName: editSpecialtyName.trim(),
        specialtyCustom: editSpecialtyName.trim(),
        registrationType: editRegistrationType || null,
        registrationNumber: editRegistrationNumber || null,
        bio: editBio || null,
        practiceAreas: editPracticeAreas || null,
        bufferMinutes: Number(editBufferMinutes),
        slug: editSlug.trim() || null,
        publicBookingEnabled: editPublicBookingEnabled,
        remunerationType: editRemunerationType,
        commissionPercentage: Number(editCommissionPercentage),
        fixedSalary: Number(editFixedSalary),
        paymentDay: Number(editPaymentDay)
      });

      showToast('Profissional atualizado com sucesso!', 'success');
      setEditingProf(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar profissional', 'error');
    }
  };

  const handleCreateBlock = async () => {
    if (!blockTitle || !blockStart || !blockEnd) {
      showToast('Preencha título, início e término do bloqueio', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/professionals/blocks', {
        professionalId: blockProfId || null,
        title: blockTitle,
        startDatetime: blockStart,
        endDatetime: blockEnd,
        type: blockType
      });

      showToast('Bloqueio de agenda registrado!', 'success');
      setShowBlockModal(false);
      setBlockTitle('');
      setBlockStart('');
      setBlockEnd('');
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar bloqueio', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Equipe de Profissionais</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastre os profissionais, defina especialidades, regras de remuneração, escala e links de agendamento online.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowBlockModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl transition-all border border-amber-200"
          >
            <Ban className="w-4 h-4" /> Bloquear Horário / Férias
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" /> Novo Profissional
          </button>
        </div>
      </div>

      {/* Team Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {professionals.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-start justify-between">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold text-xl flex items-center justify-center">
                  {p.name.charAt(0)}
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Ativo
                </span>
              </div>

              <div className="mt-3">
                <h3 className="font-bold text-slate-900 text-base">
                  {formatDoctorName(p.name, (p as any).gender)}
                </h3>
                <p className="text-xs text-indigo-600 font-semibold">{p.specialty_name || p.profession_name}</p>
                {p.registration_number && (
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    {p.registration_type}: {p.registration_number}
                  </p>
                )}
              </div>

              {p.bio && (
                <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">
                  {p.bio}
                </p>
              )}

              {p.practice_areas && (
                <div className="mt-2 p-2 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-slate-700">
                  <span className="font-bold text-indigo-700 block text-[10px]">Atendimentos e áreas de atuação:</span>
                  <span className="leading-snug">{p.practice_areas}</span>
                </div>
              )}

              {/* Informações de Remuneração e Link Público */}
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-[11px] text-slate-400">Remuneração:</span>
                  <span className="font-semibold text-slate-700">
                    {p.remuneration_type === 'salary'
                      ? `Fixo: R$ ${Number(p.fixed_salary || 0).toFixed(2)}`
                      : p.remuneration_type === 'both'
                      ? `${p.commission_percentage || 0}% + R$ ${Number(p.fixed_salary || 0).toFixed(2)}`
                      : `${p.commission_percentage || 0}% de comissão`}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
              <button
                type="button"
                onClick={() => handleCopyBookingLink(p)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl transition-all shadow-2xs cursor-pointer text-xs"
                title="Copiar link público individual do profissional para agendamento"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Copiar link</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingProf(p);
                  setEditName(p.name);
                  setEditGender((p as any).gender || 'M');
                  const currentPProfId = p.profession_id || (professions[0]?.id || '');
                  setEditProfessionId(currentPProfId);
                  setEditSpecialtyId(p.specialty_id || '');
                  setEditSpecialtyName(p.specialty_name || (p as any).specialty_custom || '');
                  setEditRegistrationType(p.registration_type || 'CRM');
                  setEditRegistrationNumber(p.registration_number || '');
                  setEditBio(p.bio || '');
                  setEditPracticeAreas(p.practice_areas || '');
                  setEditBufferMinutes(p.buffer_minutes || 10);
                  setEditSlug(p.slug || '');
                  setEditPublicBookingEnabled(p.public_booking_enabled !== 0);
                  setEditRemunerationType(p.remuneration_type || 'commission');
                  setEditCommissionPercentage(p.commission_percentage || 0);
                  setEditFixedSalary(p.fixed_salary || 0);
                  setEditPaymentDay(p.payment_day || 5);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl transition-all shadow-2xs cursor-pointer text-xs"
              >
                <Edit3 className="w-3.5 h-3.5" /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Novo Profissional */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Cadastrar Profissional</h3>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Ana Paula Silveira"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sexo / Prefixo *</label>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value as 'M' | 'F')}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-semibold"
                  >
                    <option value="M">Masculino (Dr.)</option>
                    <option value="F">Feminino (Dra.)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">E-mail de Acesso *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="dra.ana@clinica.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Profissão *</label>
                  <select
                    value={professionId}
                    onChange={e => {
                      const newPId = e.target.value;
                      setProfessionId(newPId);
                      const selProf = professions.find(p => p.id === newPId);
                      const isPhysio = selProf?.slug?.includes('fisio') || selProf?.name?.toLowerCase().includes('fisio');
                      if (isPhysio) {
                        setRegistrationType('CREFITO');
                      } else if (selProf?.registration_board_label) {
                        setRegistrationType(selProf.registration_board_label);
                      }
                      const matching = specialties.filter(s => s.profession_id === newPId || (s as any).professionId === newPId);
                      setSpecialtyId(matching.length > 0 ? matching[0].id : '');
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                  >
                    {professions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700">Especialidade Principal</label>
                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">Catálogo / Livre</span>
                  </div>
                  {(() => {
                    const selProf = professions.find(p => p.id === professionId);
                    const matching = specialties.filter(s => s.profession_id === professionId || (s as any).professionId === professionId);
                    if (matching.length > 0) {
                      return (
                        <select
                          value={specialtyId}
                          onChange={e => {
                            const val = e.target.value;
                            setSpecialtyId(val);
                            const found = matching.find(m => m.id === val);
                            if (found) setSpecialtyName(found.name);
                          }}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                        >
                          <option value="">Selecione ou digite abaixo...</option>
                          {matching.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      );
                    }
                    return (
                      <input
                        type="text"
                        value={specialtyName}
                        onChange={e => setSpecialtyName(e.target.value)}
                        placeholder="Ex: Fisioterapia Traumato-Ortopédica, Neuro..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo de Registro</label>
                  <input
                    type="text"
                    value={registrationType}
                    onChange={e => setRegistrationType(e.target.value)}
                    placeholder="Ex: CRP, CRM, OAB"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Número do Registro</label>
                  <input
                    type="text"
                    value={registrationNumber}
                    onChange={e => setRegistrationNumber(e.target.value)}
                    placeholder="Ex: 06/12345"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Biografia / Apresentação</label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="Breve currículo exibido na página pública para os clientes..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">Atendimentos e áreas de atuação</label>
                  <span className="text-[10px] text-slate-400 font-medium">Texto livre</span>
                </div>
                <textarea
                  rows={2}
                  value={practiceAreas}
                  onChange={e => setPracticeAreas(e.target.value)}
                  placeholder="Ex: TEA, TDAH, Ansiedade, Depressão, Orientação de Pais, Avaliação Neuropsicológica..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              {/* Seção de Remuneração e Financeiro (Exclusivo Gerenciador) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-800 text-xs">Remuneração e Pagamento (Gestão da Clínica)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Modalidade de Remuneração</label>
                    <select
                      value={remunerationType}
                      onChange={e => setRemunerationType(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                    >
                      <option value="commission">Comissão (% por atendimento)</option>
                      <option value="salary">Salário Fixo Mensal</option>
                      <option value="both">Fixo + Comissão</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Dia Previsto de Pagamento</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={paymentDay}
                      onChange={e => setPaymentDay(Number(e.target.value))}
                      placeholder="Ex: 5"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                    />
                  </div>
                </div>

                {(remunerationType === 'commission' || remunerationType === 'both') && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Percentual de Comissão Individual (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={commissionPercentage}
                        onChange={e => setCommissionPercentage(Number(e.target.value))}
                        placeholder="Ex: 50"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 font-bold">%</span>
                    </div>
                  </div>
                )}

                {(remunerationType === 'salary' || remunerationType === 'both') && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Salário Fixo Mensal (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={fixedSalary}
                      onChange={e => setFixedSalary(Number(e.target.value))}
                      placeholder="Ex: 3500.00"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                    />
                  </div>
                )}
              </div>

              {/* Seção Página Pública e Link de Agendamento */}
              <div className="bg-teal-50/70 border border-teal-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-teal-700" />
                    <span className="font-bold text-teal-900 text-xs">Página Pública de Agendamento</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-teal-800">
                    <input
                      type="checkbox"
                      checked={publicBookingEnabled}
                      onChange={e => setPublicBookingEnabled(e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Ativar link público</span>
                  </label>
                </div>

                <div>
                  <label className="block font-semibold text-teal-900 mb-1">Identificador no Link (Slug opcional)</label>
                  <div className="flex items-center bg-white border border-teal-200 rounded-xl px-3 py-2 text-xs">
                    <span className="text-slate-400 select-none">zemda.com.br/agendar/</span>
                    <input
                      type="text"
                      value={slug}
                      onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="nome-do-profissional"
                      className="flex-1 border-0 p-0 text-xs font-semibold text-teal-700 focus:ring-0 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateProfessional}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Cadastrar Profissional
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Profissional */}
      {editingProf && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Editar Profissional: {editingProf.name}</h3>
              <button onClick={() => setEditingProf(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sexo / Prefixo *</label>
                  <select
                    value={editGender}
                    onChange={e => setEditGender(e.target.value as 'M' | 'F')}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-semibold"
                  >
                    <option value="M">Masculino (Dr.)</option>
                    <option value="F">Feminino (Dra.)</option>
                  </select>
                </div>
              </div>

              {/* Estrutura: Profissão -> Especialidade -> Atendimentos/áreas de atuação livres */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Profissão *</label>
                  <select
                    value={editProfessionId}
                    onChange={e => {
                      const newPId = e.target.value;
                      setEditProfessionId(newPId);
                      const matching = specialties.filter(s => s.profession_id === newPId || (s as any).professionId === newPId);
                      setEditSpecialtyId(matching.length > 0 ? matching[0].id : '');
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                  >
                    {professions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700">Especialidade(s)</label>
                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">Texto livre</span>
                  </div>
                  <input
                    type="text"
                    value={editSpecialtyName}
                    onChange={e => setEditSpecialtyName(e.target.value)}
                    placeholder="Ex: Cardiologia Clínica, Arritmia..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">Atendimentos e áreas de atuação</label>
                  <span className="text-[10px] text-slate-400 font-medium">Texto livre</span>
                </div>
                <textarea
                  rows={2}
                  value={editPracticeAreas}
                  onChange={e => setEditPracticeAreas(e.target.value)}
                  placeholder="Ex: TEA, TDAH, Ansiedade, Depressão, Orientação de Pais, Avaliação Neuropsicológica..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo de Registro</label>
                  <input
                    type="text"
                    value={editRegistrationType}
                    onChange={e => setEditRegistrationType(e.target.value)}
                    placeholder="Ex: CRP, CRM, OAB"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Número do Registro</label>
                  <input
                    type="text"
                    value={editRegistrationNumber}
                    onChange={e => setEditRegistrationNumber(e.target.value)}
                    placeholder="Ex: 06/12345"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Biografia / Apresentação</label>
                <textarea
                  rows={2}
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  placeholder="Breve currículo exibido na página pública..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Intervalo entre consultas (Buffer em minutos)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={editBufferMinutes}
                  onChange={e => setEditBufferMinutes(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              {/* Seção Regras de Remuneração e Repasse */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900 text-xs">Regras de Remuneração e Pagamento</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Modalidade *</label>
                    <select
                      value={editRemunerationType}
                      onChange={e => setEditRemunerationType(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                    >
                      <option value="commission">Apenas Comissão (%)</option>
                      <option value="salary">Apenas Salário Fixo (R$)</option>
                      <option value="both">Salário Fixo + Comissão</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Dia do Pagamento</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={editPaymentDay}
                      onChange={e => setEditPaymentDay(Number(e.target.value))}
                      placeholder="Ex: 5"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                    />
                  </div>
                </div>

                {(editRemunerationType === 'commission' || editRemunerationType === 'both') && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Comissão sobre Consultas / Procedimentos (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={editCommissionPercentage}
                      onChange={e => setEditCommissionPercentage(Number(e.target.value))}
                      placeholder="Ex: 50"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                    />
                  </div>
                )}

                {(editRemunerationType === 'salary' || editRemunerationType === 'both') && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Salário Fixo Mensal (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={editFixedSalary}
                      onChange={e => setEditFixedSalary(Number(e.target.value))}
                      placeholder="Ex: 3500.00"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                    />
                  </div>
                )}
              </div>

              {/* Seção Página Pública e Link de Agendamento */}
              <div className="bg-teal-50/70 border border-teal-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-teal-700" />
                    <span className="font-bold text-teal-900 text-xs">Página Pública de Agendamento</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-teal-800">
                    <input
                      type="checkbox"
                      checked={editPublicBookingEnabled}
                      onChange={e => setEditPublicBookingEnabled(e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Ativar link público</span>
                  </label>
                </div>

                <div>
                  <label className="block font-semibold text-teal-900 mb-1">Identificador no Link (Slug)</label>
                  <div className="flex items-center bg-white border border-teal-200 rounded-xl px-3 py-2 text-xs">
                    <span className="text-slate-400 select-none">zemda.com.br/agendar/</span>
                    <input
                      type="text"
                      value={editSlug}
                      onChange={e => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="nome-do-profissional"
                      className="flex-1 border-0 p-0 text-xs font-semibold text-teal-700 focus:ring-0 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProf(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditProfessional}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bloqueio de Horário */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Bloquear Agenda / Ausência</h3>
              <button onClick={() => setShowBlockModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Profissional</label>
                <select
                  value={blockProfId}
                  onChange={e => setBlockProfId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                >
                  <option value="">Toda a Clínica (Recesso Geral)</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo do Bloqueio *</label>
                <input
                  type="text"
                  value={blockTitle}
                  onChange={e => setBlockTitle(e.target.value)}
                  placeholder="Ex: Férias, Reunião de Equipe, Consulta Médica"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Início (Data e Hora) *</label>
                  <input
                    type="datetime-local"
                    value={blockStart}
                    onChange={e => setBlockStart(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Término *</label>
                  <input
                    type="datetime-local"
                    value={blockEnd}
                    onChange={e => setBlockEnd(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowBlockModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateBlock}
                  className="px-6 py-2 font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs"
                >
                  Salvar Bloqueio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
