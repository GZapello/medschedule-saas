import React, { useState } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Building2,
  User,
  Mail,
  Phone,
  Lock,
  MapPin,
  CheckCircle2,
  X,
  Search,
  ShieldCheck,
  FileText
} from 'lucide-react';

interface CreateClinicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateClinicModal: React.FC<CreateClinicModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [successData, setSuccessData] = useState<{ clinicId: string; slug: string; message: string } | null>(null);

  const [formData, setFormData] = useState({
    responsibleName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    clinicName: '',
    tradeName: '',
    cnpjCpf: '',
    cep: '',
    city: '',
    state: '',
    termsAccepted: false,
    privacyAccepted: false
  });

  if (!isOpen) return null;

  const handleCepSearch = async () => {
    const cleanCep = formData.cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      showToast('Digite um CEP válido com 8 dígitos', 'error');
      return;
    }

    try {
      setSearchingCep(true);
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();

      if (data.erro) {
        showToast('CEP não encontrado na base dos Correios', 'error');
        return;
      }

      setFormData(prev => ({
        ...prev,
        city: data.localidade || prev.city,
        state: data.uf || prev.state
      }));
      showToast(`Localizado: ${data.localidade}/${data.uf}`, 'success');
    } catch {
      showToast('Erro ao consultar CEP. Preencha manualmente.', 'error');
    } finally {
      setSearchingCep(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.responsibleName || !formData.email || !formData.password || !formData.clinicName) {
      showToast('Preencha os campos obrigatórios marcados com *', 'error');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showToast('As senhas digitadas não coincidem', 'error');
      return;
    }

    if (formData.password.length < 6) {
      showToast('A senha deve ter no mínimo 6 caracteres', 'error');
      return;
    }

    if (!formData.termsAccepted || !formData.privacyAccepted) {
      showToast('Você deve aceitar os Termos de Uso e a Política de Privacidade', 'error');
      return;
    }

    try {
      setLoading(true);
      const data = await ApiClient.post<any>('/v1/public/tenants/register', {
        responsibleName: formData.responsibleName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        clinicName: formData.clinicName,
        tradeName: formData.tradeName || formData.clinicName,
        cnpjCpf: formData.cnpjCpf,
        city: formData.city,
        state: formData.state,
        termsAccepted: formData.termsAccepted,
        privacyAccepted: formData.privacyAccepted
      });

      setSuccessData(data);
      showToast('Cadastro realizado com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar clínica', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 p-6 text-white flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[11px] font-bold tracking-wider uppercase mb-1">
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              Plataforma Multi-Clínicas Zemda
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">Criar Minha Clínica</h2>
            <p className="text-xs text-indigo-200">
              Cadastre seu estabelecimento para ter seu próprio ambiente exclusivo na plataforma.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 max-h-[75vh] overflow-y-auto">
          {successData ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">
                Solicitação de Cadastro Enviada!
              </h3>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left text-xs text-amber-900 space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-amber-800">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Status: Pendente de Aprovação
                </p>
                <p>
                  Sua clínica foi cadastrada no sistema. Por questões de governança, segurança e conformidade, novos cadastros passam por análise da equipe de administração da plataforma Zemda.
                </p>
                <p className="font-semibold text-slate-700">
                  Assim que for aprovada, você poderá fazer login com o e-mail cadastrado e será direcionado ao assistente de configuração inicial.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 text-left space-y-1">
                <p><strong>Clínica:</strong> {formData.clinicName}</p>
                <p><strong>Responsável:</strong> {formData.responsibleName}</p>
                <p><strong>E-mail de Acesso:</strong> {formData.email}</p>
              </div>

              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
              >
                Entendido e Voltar ao Início
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Informação sobre aprovação */}
              <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs text-indigo-900 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <p>
                  Cada clínica possui ambiente 100% isolado. Após enviar seus dados, sua solicitação ficará com status <strong>"Pendente de aprovação"</strong> até validação pelo administrador da plataforma.
                </p>
              </div>

              {/* Seção 1: Dados do Responsável / Gestor */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  1. Dados do Gestor Responsável
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome do Responsável *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Dra. Mariana Albuquerque"
                      value={formData.responsibleName}
                      onChange={e => setFormData({ ...formData, responsibleName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      E-mail de Acesso *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="mariana@clinicaprime.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Telefone / Celular
                    </label>
                    <input
                      type="text"
                      placeholder="(11) 98765-4321"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Senha de Acesso (Mínimo 6 caracteres) *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Confirme sua Senha *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 2: Dados Básicos da Clínica */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  2. Dados do Estabelecimento / Clínica
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Razão Social ou Nome da Clínica *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Clínica Prime Saúde & Bem-Estar"
                      value={formData.clinicName}
                      onChange={e => setFormData({ ...formData, clinicName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome Fantasia (Como clientes a conhecem)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Espaço Prime"
                      value={formData.tradeName}
                      onChange={e => setFormData({ ...formData, tradeName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      CNPJ ou CPF (caso profissional liberal)
                    </label>
                    <input
                      type="text"
                      placeholder="00.000.000/0001-00 ou 000.000.000-00"
                      value={formData.cnpjCpf}
                      onChange={e => setFormData({ ...formData, cnpjCpf: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      CEP (com busca automática)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="00000-000"
                        value={formData.cep}
                        onChange={e => setFormData({ ...formData, cep: e.target.value })}
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleCepSearch}
                        disabled={searchingCep}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                        {searchingCep ? '...' : 'Buscar'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      placeholder="São Paulo"
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Estado (UF)
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="SP"
                      value={formData.state}
                      onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 3: Termos e Condições */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.termsAccepted}
                    onChange={e => setFormData({ ...formData, termsAccepted: e.target.checked })}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    Declaro que li e concordo com os <strong>Termos de Uso</strong> da plataforma Zemda e que sou autorizado a responder por esta clínica.
                  </span>
                </label>

                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.privacyAccepted}
                    onChange={e => setFormData({ ...formData, privacyAccepted: e.target.checked })}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    Concordo com a <strong>Política de Privacidade e Proteção de Dados (LGPD)</strong>, ciente do sigilo médico e isolamento seguro de dados.
                  </span>
                </label>
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Cadastrando...' : 'Finalizar Solicitação de Cadastro'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
