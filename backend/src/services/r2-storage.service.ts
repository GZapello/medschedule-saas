import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

export class R2StorageService {
  private client: S3Client | null = null;
  private bucketName: string;
  private isConfigured: boolean = false;
  // Simulação para testes automatizados locais quando credenciais do R2 não estão ativas
  private mockObjects: Set<string> = new Set();

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
    this.bucketName = process.env.R2_BUCKET_NAME || 'zemda-storage';

    const endpoint =
      process.env.R2_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    if (accessKeyId && secretAccessKey && (endpoint || accountId)) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: endpoint || `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey
        }
      });
      this.isConfigured = true;
    }
  }

  /**
   * Gera a chave de objeto padronizada e anônima no R2
   * Formato: clinics/{clinicId}/patients/{patientId}/{category}/{uuid}.{ext}
   * NUNCA inclui dados pessoais como nome, CPF, telefone ou email
   */
  generateObjectKey(
    clinicId: string,
    patientId: string,
    category: string = 'general',
    originalFilename: string = 'image.webp'
  ): string {
    const sanitizedClinicId = clinicId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedPatientId = patientId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedCategory = category.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '') || 'general';

    // Determina a extensão baseada no nome original ou padrão webp
    let ext = path.extname(originalFilename).toLowerCase();
    if (!ext || ext === '.') {
      ext = '.webp';
    }
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      ext = '.webp';
    }

    const uniqueId = uuidv4();
    return `clinics/${sanitizedClinicId}/patients/${sanitizedPatientId}/${sanitizedCategory}/${uniqueId}${ext}`;
  }

  /**
   * Gera URL assinada temporária para upload direto do cliente ao Cloudflare R2 (PUT)
   * Expiração padrão: 300 segundos (5 minutos)
   */
  async createUploadUrl(
    objectKey: string,
    mimeType: string,
    expiresIn: number = 300
  ): Promise<string> {
    if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        ContentType: mimeType
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    }

    // Modo mock / desenvolvimento local offline
    this.mockObjects.add(objectKey);
    const mockEndpoint = process.env.R2_ENDPOINT || 'https://mock.r2.cloudflarestorage.com';
    return `${mockEndpoint}/${this.bucketName}/${objectKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-sig`;
  }

  /**
   * Gera URL assinada temporária para visualização/download do objeto (GET)
   * Expiração padrão: 300 segundos (5 minutos)
   */
  async createDownloadUrl(
    objectKey: string,
    expiresIn: number = 300
  ): Promise<string> {
    if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    }

    // Modo mock / desenvolvimento local offline
    const mockEndpoint = process.env.R2_ENDPOINT || 'https://mock.r2.cloudflarestorage.com';
    return `${mockEndpoint}/${this.bucketName}/${objectKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-download-sig`;
  }

  /**
   * Exclui o objeto do Cloudflare R2
   */
  async deleteFile(objectKey: string): Promise<void> {
    if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey
      });
      await this.client.send(command);
      return;
    }

    // Modo mock / desenvolvimento local
    this.mockObjects.delete(objectKey);
  }

  /**
   * Verifica se o arquivo existe no Cloudflare R2 via HeadObject
   */
  async fileExists(objectKey: string): Promise<boolean> {
    if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
      try {
        const command = new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: objectKey
        });
        await this.client.send(command);
        return true;
      } catch (err: any) {
        if (
          err.name === 'NotFound' ||
          err.$metadata?.httpStatusCode === 404 ||
          err.name === 'NoSuchKey'
        ) {
          return false;
        }
        console.error('[R2StorageService.fileExists] Erro ao verificar objeto:', err);
        throw err;
      }
    }

    // Modo mock / desenvolvimento local
    return this.mockObjects.has(objectKey);
  }

  /**
   * Helper para simular upload nos testes locais
   */
  simulateMockUpload(objectKey: string): void {
    this.mockObjects.add(objectKey);
  }

  /**
   * Helper para simular remoção nos testes locais
   */
  simulateMockDelete(objectKey: string): void {
    this.mockObjects.delete(objectKey);
  }
}

export const r2StorageService = new R2StorageService();
