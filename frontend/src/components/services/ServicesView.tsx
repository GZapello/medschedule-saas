import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Service, Room, Specialty } from '../../types';
import {
  Scissors,
  Plus,
  Clock,
  DollarSign,
  DoorOpen,
  X,
  CheckCircle2,
  Pencil,
  Trash2,
  AlertTriangle
} from 'lucide-react';

export const ServicesView: React.FC = () => {
  const { showToast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modal Novo Serviço
  const [showServiceModal, setShowServiceModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [specialtyId, setSpecialtyId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(50);
  const [bufferMinutes, setBufferMinutes] = useState<number>(10);
  const [price, setPrice] = useState<string>('180.00');
  const [modality, setModality] = useState<'both' | 'presential' | 'online' | 'home'>('both');
  const [description, setDescription] = useState<string>('');

  // Modal Editar Serviço
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editSpecialtyId, setEditSpecialtyId] = useState<string>('');
  const [editDurationMinutes, setEditDurationMinutes] = useState<number>(50);
  const [editBufferMinutes, setEditBufferMinutes] = useState<number>(10);
  const [editPrice, setEditPrice] = useState<string>('180.00');
  const [editModality, setEditModality] = useState<'both' | 'presential' | 'online' | 'home'>('both');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editActive, setEditActive] = useState<boolean>(true);
  const [updating, setUpdating] = useState<boolean>(false);

  // Modal / Confirmação de Exclusão ou Inativação
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Modal Nova Sala
  const [showRoomModal, setShowRoomModal] = useState<boolean>(false);
  const [roomName, setRoomName] = useState<string>('');
  const [roomDesc, setRoomDesc] = useState<string>('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [srvs, rms, specs] = await Promise.all([
        ApiClient.get<Service[]>('/v1/services'),
        ApiClient.get<Room[]>('/v1/rooms'),
        ApiClient.get<Specialty[]>('/v1/taxonomy/specialties')
      ]);
      setServices(srvs);
      setRooms(rms);
      setSpecialties(specs);
    } catch (err: any) {
      showToast('Erro ao carregar serviços e salas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateService = async () => {
    if (!name || !price) {
      showToast('Nome e valor do serviço são obrigatórios', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/services', {
        name,
        specialtyId: specialtyId || null,
        durationMinutes: Number(durationMinutes),
        bufferMinutes: Number(bufferMinutes),
        price: Number(price),
        modality,
        description: description || null
      });

      showToast('Serviço cadastrado com sucesso!', 'success');
      setShowServiceModal(false);
      setName('');
      setDescription('');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar serviço', 'error');
    }
  };

  const handleCreateRoom = async () => {
    if (!roomName) {
      showToast('Nome da sala é obrigatório', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/rooms', {
        name: roomName,
        description: roomDesc || null
      });

      showToast('Sala cadastrada com sucesso!', 'success');
      setShowRoomModal(false);
      setRoomName('');
      setRoomDesc('');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar sala', 'error');
    }
  };

  const handleOpenEdit = (s: Service) => {
    setEditingService(s);
    setEditName(s.name);
    setEditSpecialtyId(s.specialty_id || '');
    setEditDurationMinutes(s.duration_minutes || 50);
    setEditBufferMinutes(s.buffer_minutes || 10);
    setEditPrice(String(s.price || '0.00'));
    setEditModality(s.modality || 'both');
    setEditDescription(s.description || '');
    setEditActive(s.active === 1);
  };

  const handleUpdateService = async () => {
    if (!editingService) return;
    if (!editName.trim() || !editPrice) {
      showToast('Nome e valor do serviço são obrigatórios', 'error');
      return;
    }

    try {
      setUpdating(true);
      await ApiClient.put(`/v1/services/${editingService.id}`, {
        name: editName.trim(),
        specialtyId: editSpecialtyId || null,
        durationMinutes: Number(editDurationMinutes),
        bufferMinutes: Number(editBufferMinutes),
        price: Number(editPrice),
        modality: editModality,
        description: editDescription || null,
        active: editActive ? 1 : 0
      });

      showToast('Serviço atualizado com sucesso!', 'success');
      setEditingService(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar serviço', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete) return;
    try {
      setDeleting(true);
      const res = await ApiClient.delete<{ success: boolean; action: string; message: string }>(
        `/v1/services/${serviceToDelete.id}`
      );
      showToast(res.message || 'Operação realizada com sucesso', 'success');
      setServiceToDelete(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao processar exclusão do serviço', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Serviços Section */}
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Catálogo de Serviços</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Defina duração, valor, modalidade e intervalo entre atendimentos.
            </p>
          </div>
          <button
            onClick={() => setShowServiceModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Novo Serviço
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map(s => {
            const isActive = s.active === 1;
            return (
              <div
                key={s.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                  isActive ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-50/80 border-slate-200/80 opacity-80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{s.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        {isActive ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Ativo
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            Inativo
                          </span>
                        )}
                        {s.specialty_name && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full inline-block">
                            {s.specialty_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-extrabold text-indigo-600">
                      {Number(s.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">{s.description}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1 font-medium text-slate-700">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" /> {s.duration_minutes} min (+{s.buffer_minutes}m buffer)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="capitalize font-semibold text-slate-600 text-[11px] mr-1">{s.modality}</span>
                    <button
                      onClick={() => handleOpenEdit(s)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      title="Editar Serviço"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setServiceToDelete(s)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir ou Inativar Serviço"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Salas Section */}
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Salas e Espaços de Atendimento</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Organize salas físicas para evitar conflitos de espaço físico na clínica.
            </p>
          </div>
          <button
            onClick={() => setShowRoomModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" /> Nova Sala
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {rooms.map(r => (
            <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <DoorOpen className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{r.name}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{r.description || 'Sala ativa'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Novo Serviço */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Novo Serviço</h3>
              <button onClick={() => setShowServiceModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Atendimento *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Consulta Psicológica Inicial"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Preço (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Especialidade</label>
                  <select
                    value={specialtyId}
                    onChange={e => setSpecialtyId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                  >
                    <option value="">Geral</option>
                    {specialties.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duração (minutos)</label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={e => setDurationMinutes(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Intervalo / Buffer (minutos)</label>
                  <input
                    type="number"
                    value={bufferMinutes}
                    onChange={e => setBufferMinutes(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Modalidade</label>
                <select
                  value={modality}
                  onChange={e => setModality(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                >
                  <option value="both">Presencial ou Online</option>
                  <option value="presential">Apenas Presencial</option>
                  <option value="online">Apenas Online</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Descrição exibida ao cliente na página pública..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowServiceModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateService}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar Serviço
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Sala */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Nova Sala</h3>
              <button onClick={() => setShowRoomModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome da Sala / Espaço *</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="Ex: Consultório 01 (Infantil)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={roomDesc}
                  onChange={e => setRoomDesc(e.target.value)}
                  placeholder="Ex: Sala equipada com brinquedoteca"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowRoomModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateRoom}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar Sala
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Serviço */}
      {editingService && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Editar Serviço</h3>
              <button
                onClick={() => setEditingService(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Atendimento *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Ex: Consulta Psicológica Inicial"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Preço (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Especialidade</label>
                  <select
                    value={editSpecialtyId}
                    onChange={e => setEditSpecialtyId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                  >
                    <option value="">Geral</option>
                    {specialties.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duração (minutos)</label>
                  <input
                    type="number"
                    value={editDurationMinutes}
                    onChange={e => setEditDurationMinutes(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Intervalo / Buffer (minutos)</label>
                  <input
                    type="number"
                    value={editBufferMinutes}
                    onChange={e => setEditBufferMinutes(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Modalidade</label>
                  <select
                    value={editModality}
                    onChange={e => setEditModality(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                  >
                    <option value="both">Presencial ou Online</option>
                    <option value="presential">Apenas Presencial</option>
                    <option value="online">Apenas Online</option>
                    <option value="home">Domiciliar</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status do Serviço</label>
                  <select
                    value={editActive ? '1' : '0'}
                    onChange={e => setEditActive(e.target.value === '1')}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-semibold"
                  >
                    <option value="1">Ativo</option>
                    <option value="0">Inativo (Desativado)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="Descrição exibida ao cliente na página pública..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUpdateService}
                  disabled={updating}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {updating ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão ou Inativação */}
      {serviceToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Excluir Serviço</h3>
                <p className="text-xs text-slate-500">Confirmação de segurança</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                Tem certeza de que deseja excluir o serviço <strong className="text-slate-900">{serviceToDelete.name}</strong>?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] leading-relaxed">
                <strong>Atenção:</strong> Se o serviço já possuir vínculos históricos com agendamentos, atendimentos ou registros financeiros, ele será <strong>inativado com segurança</strong> para manter a integridade dos relatórios e prontuários.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-5">
              <button
                type="button"
                onClick={() => setServiceToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteService}
                disabled={deleting}
                className="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Processando...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
