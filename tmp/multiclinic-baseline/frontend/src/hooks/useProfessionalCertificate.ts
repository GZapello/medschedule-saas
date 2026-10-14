import { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../api/client';
import { useToast } from '../context/ToastContext';

export interface DigitalCertificateData {
  id: string;
  tenant_id: string;
  holder_type: 'professional' | 'patient';
  holder_id: string;
  certificate_type: 'A1' | 'A3' | 'remote';
  serial_number: string;
  subject_name: string;
  subject_cpf_cnpj: string;
  issuer: string;
  valid_from: string;
  valid_until: string;
  fingerprint_sha256: string;
  provider: string;
  provider_reference?: string | null;
  status: 'valid' | 'expired' | 'revoked' | 'pending';
  created_at: string;
  last_validated_at: string;
}

export type CertificateStatus = 'not_configured' | 'valid' | 'expired' | 'revoked' | 'pending' | 'error';

export function useProfessionalCertificate() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [certificate, setCertificate] = useState<DigitalCertificateData | null>(null);
  const [status, setStatus] = useState<CertificateStatus>('not_configured');

  const fetchCertificate = useCallback(async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<{
        status: CertificateStatus;
        certificate: DigitalCertificateData | null;
        hasValidCertificate: boolean;
      }>('/v1/digital-certificates/my-certificate');

      setCertificate(res.certificate);
      setStatus(res.status || (res.certificate ? res.certificate.status : 'not_configured'));
    } catch (err: any) {
      console.warn('Erro ao carregar certificado digital:', err);
      setStatus('not_configured');
      setCertificate(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificate();
  }, [fetchCertificate]);

  const connectCertificate = async (data: {
    subjectName: string;
    subjectCpfCnpj?: string;
    provider: string;
    certificateType?: 'remote' | 'A1';
    issuer?: string;
    serialNumber?: string;
    validFrom?: string;
    validUntil?: string;
    fingerprintSha256?: string;
    providerReference?: string;
  }) => {
    try {
      setLoading(true);
      const res = await ApiClient.post<DigitalCertificateData>('/v1/digital-certificates/connect', data);
      showToast('Certificado ICP-Brasil conectado com sucesso!', 'success');
      await fetchCertificate();
      return res;
    } catch (err: any) {
      showToast(err.message || 'Erro ao conectar certificado digital.', 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const validateCertificate = async (id: string) => {
    try {
      setLoading(true);
      const res = await ApiClient.post<{ success: boolean; message: string; certificate: DigitalCertificateData }>(
        `/v1/digital-certificates/${id}/validate`,
        {}
      );
      showToast(res.message || 'Certificado validado com sucesso!', res.certificate?.status === 'valid' ? 'success' : 'info');
      await fetchCertificate();
      return res.certificate;
    } catch (err: any) {
      showToast(err.message || 'Erro ao validar certificado digital.', 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const disconnectCertificate = async (id: string) => {
    try {
      setLoading(true);
      await ApiClient.delete(`/v1/digital-certificates/${id}`);
      showToast('Certificado ICP-Brasil desconectado com sucesso.', 'info');
      await fetchCertificate();
    } catch (err: any) {
      showToast(err.message || 'Erro ao desconectar certificado.', 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    certificate,
    status,
    hasValidCertificate: status === 'valid' && Boolean(certificate),
    reload: fetchCertificate,
    connectCertificate,
    validateCertificate,
    disconnectCertificate
  };
}
