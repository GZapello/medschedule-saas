import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DigitalCertificate } from '../../types';
import {
  ShieldCheck,
  Shield,
  Key,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  Info,
  ExternalLink,
  Calendar,
  Lock,
  RefreshCw,
  Clock,
  Award,
  X
} from 'lucide-react';

export const DigitalCertificatesSection: React.FC = () => {
  const { currentUser, isClinicAdmin } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [certificates, setCertificates] = useState<DigitalCertificate[]>([]);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Formulário de conexão de certificado A1 / Metadados
  const [formData, setFormData] = useState({
    certificateType: 'A1' as 'A1' | 'A3' | 'remote',
    subjectName: currentUser?.name || '',
    subjectCpf: '',
    serialNumber: '',
    issuer: 'AC SOLUTI v5 (ICP-Brasil)',
    validFrom: new Date().toISOString().split('T')[0],
    validTo: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
    provider: 'A1 Local / PSC'
  });
  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statusRes, certsRes] = await Promise.all([
        ApiClient.get<any>('/v1/digital-certificates/provider-status'),
        ApiClient.get<DigitalCertificate[]>('/v1/digital-certificates')
      ]);
      setProviderStatus(statusRes);
      setCertificates(certsRes || []);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar certificados digitais.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!formData.subjectName || !formData.subjectCpf) {
      showToast('Nome e CPF são obrigatórios.', 'info');
      return;
    }

    try {
      setSubmitting(true);
      await ApiClient.post('/v1/digital-certificates/connect', {
        holderType: 'professional',
        holderId: currentUser?.professionalId || currentUser?.id,
        certificateType: formData.certificateType,
        subjectName: formData.subjectName,
        subjectCpf: formData.subjectCpf,
        serialNumber: formData.serialNumber || `SN-${Date.now().toString(16).toUpperCase()}`,
        issuer: formData.issuer,
        validFrom: formData.validFrom,
        validTo: formData.validTo,
        provider: formData.provider
      });

      showToast('Certificado digital cadastrado com sucesso!', 'success');
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar certificado digital.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (certId: string) => {
    if (!window.confirm('Deseja realmente desvincular este certificado digital?')) return;

    try {
      await ApiClient.delete(`/v1/digital-certificates/${certId}`);
      showToast('Certificado digital desvinculado com sucesso.', 'info');
      setCertificates(prev => prev.filter(c => c.id !== certId));
    } catch (err: any) {
      showToast(err.message || 'Erro ao remover certificado.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Informative Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-3xl border border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/40 text-teal-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Central de Certificados Digitais ICP-Brasil</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  PAdES
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Conecte seu certificado digital ICP-Brasil (A1 em arquivo ou PSC em nuvem: BirdID, SAFEID, VIDaaS) para assinar documentos com validade jurídica nacional, carimbo de tempo e QR Code para verificação do paciente.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Vincular Certificado</span>
          </button>
        </div>
      </div>

      {/* Distinction Alert: Internal Electronic Signature vs ICP-Brasil Digital Certificate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Key className="w-4 h-4 text-indigo-600" />
            <span>1. Assinatura Eletrônica Interna (Zemda)</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Utiliza hash criptográfico SHA-256, autoria autenticada e selamento inviolável. Sempre ativa por padrão na finalização de consultas, evoluções e prontuários.
          </p>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ativa e disponível em todo o sistema
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>2. Certificado Digital ICP-Brasil (PAdES)</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Padrão oficial exigido para interoperabilidade externa com farmácias e convênios (CFM, CRO, CREFITO, CRFa). Requer certificado A1 ou PSC em nuvem vinculado.
          </p>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
            <Cloud className="w-3.5 h-3.5 text-indigo-500" />
            Status da Nuvem (PSC):{' '}
            <strong className={providerStatus?.configured ? 'text-emerald-700' : 'text-amber-700'}>
              {providerStatus?.configured ? `Configurada (${providerStatus.provider})` : 'Não configurada (.env)'}
            </strong>
          </div>
        </div>
      </div>

      {/* Connected Certificates List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-900 text-sm">Certificados Conectados</h4>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
              {certificates.length}
            </span>
          </div>
          <button
            onClick={loadData}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {certificates.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h5 className="font-bold text-slate-800 text-sm">Nenhum certificado digital vinculado</h5>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Você pode vincular seus metadados de certificado A1 ou PSC para habilitar a emissão de documentos com carimbo visual PAdES ICP-Brasil.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Conectar Certificado</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {certificates.map(cert => (
              <div key={cert.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm font-bold text-slate-900">{cert.subject_name}</strong>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        Tipo: {cert.certificate_type}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        cert.status === 'valid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {cert.status === 'valid' ? 'Válido' : cert.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      <span>Emissor: {cert.issuer}</span>
                      {cert.subject_cpf_masked && <span>CPF: {cert.subject_cpf_masked}</span>}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Válido até: {new Date(cert.valid_to).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      Serial: {cert.serial_number}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleDelete(cert.id)}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    title="Desvincular Certificado"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Conexão de Certificado */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-slate-900 text-base">Vincular Certificado Digital ICP-Brasil</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConnect} className="space-y-4 text-xs">
              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Info className="w-4 h-4 text-amber-700" />
                  <span>Segurança e Chave Privada</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Por segurança e conformidade rigorosa com a ICP-Brasil, senhas e chaves privadas <strong>NUNCA</strong> são armazenadas em texto plano nos servidores do Zemda. Apenas os metadados de autenticidade são registrados.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tipo de Certificado</label>
                <select
                  value={formData.certificateType}
                  onChange={e => setFormData({ ...formData, certificateType: e.target.value as any })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="A1">A1 (Arquivo / Software)</option>
                  <option value="remote">PSC em Nuvem (BirdID / SAFEID / VIDaaS)</option>
                  <option value="A3">A3 (Token / Smartcard)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome Completo do Titular</label>
                <input
                  type="text"
                  required
                  value={formData.subjectName}
                  onChange={e => setFormData({ ...formData, subjectName: e.target.value })}
                  placeholder="Nome exatamente como consta no certificado"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">CPF do Titular</label>
                  <input
                    type="text"
                    required
                    value={formData.subjectCpf}
                    onChange={e => setFormData({ ...formData, subjectCpf: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Provedor / AC</label>
                  <input
                    type="text"
                    value={formData.provider}
                    onChange={e => setFormData({ ...formData, provider: e.target.value })}
                    placeholder="Ex: Soluti, Certisign, BirdID"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Válido A Partir De</label>
                  <input
                    type="date"
                    required
                    value={formData.validFrom}
                    onChange={e => setFormData({ ...formData, validFrom: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Válido Até</label>
                  <input
                    type="date"
                    required
                    value={formData.validTo}
                    onChange={e => setFormData({ ...formData, validTo: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Autoridade Certificadora Emissora</label>
                <input
                  type="text"
                  value={formData.issuer}
                  onChange={e => setFormData({ ...formData, issuer: e.target.value })}
                  placeholder="Ex: AC SOLUTI v5, AC SERPRO, etc."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Vinculando...' : 'Salvar Certificado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
