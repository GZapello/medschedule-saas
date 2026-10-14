"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.r2StorageService = exports.R2StorageService = void 0;
exports.buildR2Client = buildR2Client;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
/** Cliente S3 apontando para o Cloudflare R2, ou null se as credenciais não estiverem configuradas. */
function buildR2Client() {
    const accountId = process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
    const endpoint = process.env.R2_ENDPOINT ||
        (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
    if (!accessKeyId || !secretAccessKey || !endpoint) {
        return null;
    }
    return new client_s3_1.S3Client({
        region: 'auto',
        endpoint,
        credentials: {
            accessKeyId,
            secretAccessKey
        },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
    });
}
class R2StorageService {
    client = null;
    bucketName;
    isConfigured = false;
    // Simulação para testes automatizados locais quando credenciais do R2 não estão ativas
    mockObjects = new Set();
    mockBuffers = new Map();
    constructor() {
        this.bucketName = process.env.R2_BUCKET_NAME || 'zemda-files';
        this.client = buildR2Client();
        this.isConfigured = this.client !== null;
    }
    get isConfiguredClient() {
        return this.isConfigured;
    }
    get currentBucketName() {
        return this.bucketName;
    }
    /**
     * Gera a chave de objeto padronizada e anônima no R2
     * Formato: clinics/{clinicId}/patients/{patientId}/{category}/{uuid}.{ext}
     * NUNCA inclui dados pessoais como nome, CPF, telefone ou email
     */
    generateObjectKey(clinicId, patientId, category = 'general', originalFilename = 'image.webp') {
        const sanitizedClinicId = clinicId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        const isClinicAsset = !patientId || patientId === 'exercises' || patientId === 'clinic' || category === 'exercises';
        const sanitizedPatientId = !isClinicAsset && patientId ? patientId.trim().replace(/[^a-zA-Z0-9_-]/g, '') : null;
        const sanitizedCategory = category.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
        // Determina a extensão baseada no nome original ou padrão webp
        let ext = path_1.default.extname(originalFilename).toLowerCase();
        if (!ext || ext === '.') {
            ext = '.webp';
        }
        const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv'];
        if (!ALLOWED_EXTS.includes(ext)) {
            ext = '.webp';
        }
        const uniqueId = (0, uuid_1.v4)();
        if (sanitizedPatientId) {
            return `clinics/${sanitizedClinicId}/patients/${sanitizedPatientId}/${sanitizedCategory}/${uniqueId}${ext}`;
        }
        return `clinics/${sanitizedClinicId}/exercises/${sanitizedCategory}/${uniqueId}${ext}`;
    }
    /**
     * Gera URL assinada temporária para upload direto do cliente ao Cloudflare R2 (PUT)
     * Expiração padrão: 300 segundos (5 minutos)
     */
    async createUploadUrl(objectKey, mimeType, expiresIn = 300) {
        if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey,
                ContentType: mimeType
            });
            return await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn });
        }
        // Modo mock / desenvolvimento local offline
        this.mockObjects.add(objectKey);
        const mockEndpoint = process.env.R2_ENDPOINT || 'https://mock.r2.cloudflarestorage.com';
        return `${mockEndpoint}/${this.bucketName}/${objectKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-sig`;
    }
    /**
     * Faz upload direto de buffer para o Cloudflare R2 (ou mock)
     */
    async uploadFile(objectKey, fileBuffer, contentType = 'image/webp') {
        if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey,
                Body: fileBuffer,
                ContentType: contentType
            });
            await this.client.send(command);
        }
        this.mockObjects.add(objectKey);
        this.mockBuffers.set(objectKey, fileBuffer);
        return { objectKey, size: fileBuffer.length };
    }
    /**
     * Obtém o buffer binário de um arquivo diretamente do Cloudflare R2 via SDK S3 (ou mock)
     */
    async getObjectBuffer(objectKey, maxBytes = 10 * 1024 * 1024) {
        if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey
            });
            const response = await this.client.send(command);
            if (!response.Body) {
                throw new Error('R2_EMPTY_BODY');
            }
            const byteArray = await response.Body.transformToByteArray();
            const buffer = Buffer.from(byteArray);
            if (buffer.length > maxBytes) {
                throw new Error('R2_FILE_TOO_LARGE');
            }
            return buffer;
        }
        if (this.mockBuffers.has(objectKey)) {
            return this.mockBuffers.get(objectKey);
        }
        if (this.mockObjects.has(objectKey)) {
            return Buffer.alloc(0);
        }
        throw new Error('R2_OBJECT_NOT_FOUND');
    }
    /**
     * Gera URL assinada temporária para visualização/download do objeto (GET)
     * Expiração padrão: 300 segundos (5 minutos)
     */
    async createDownloadUrl(objectKey, expiresIn = 300) {
        if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey
            });
            return await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn });
        }
        // Modo mock / desenvolvimento local offline
        const mockEndpoint = process.env.R2_ENDPOINT || 'https://mock.r2.cloudflarestorage.com';
        return `${mockEndpoint}/${this.bucketName}/${objectKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-Signature=mock-download-sig`;
    }
    /**
     * Exclui o objeto do Cloudflare R2
     */
    async deleteFile(objectKey) {
        if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
            const command = new client_s3_1.DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: objectKey
            });
            await this.client.send(command);
            return;
        }
        // Modo mock / desenvolvimento local
        this.mockObjects.delete(objectKey);
        this.mockBuffers.delete(objectKey);
    }
    /**
     * Exclui todos os objetos que começam com um determinado prefixo (ex: 'clinics/tenant-id/')
     */
    async deletePrefix(prefix) {
        let deletedCount = 0;
        // Remove do mock em memória
        for (const key of Array.from(this.mockObjects)) {
            if (key.startsWith(prefix)) {
                this.mockObjects.delete(key);
                deletedCount++;
            }
        }
        if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
            try {
                let continuationToken = undefined;
                do {
                    const listCmd = new client_s3_1.ListObjectsV2Command({
                        Bucket: this.bucketName,
                        Prefix: prefix,
                        ContinuationToken: continuationToken
                    });
                    const listRes = await this.client.send(listCmd);
                    if (listRes && listRes.Contents && listRes.Contents.length > 0) {
                        const deleteCmd = new client_s3_1.DeleteObjectsCommand({
                            Bucket: this.bucketName,
                            Delete: {
                                Objects: listRes.Contents.map((obj) => ({ Key: obj.Key })),
                                Quiet: true
                            }
                        });
                        const deletion = await this.client.send(deleteCmd);
                        if (deletion.Errors?.length)
                            throw new Error('R2_DELETE_INCOMPLETE');
                        deletedCount += listRes.Contents.length;
                    }
                    continuationToken = listRes ? listRes.NextContinuationToken : undefined;
                } while (continuationToken);
            }
            catch (err) {
                throw new Error('R2_PREFIX_CLEANUP_FAILED');
            }
        }
        return deletedCount;
    }
    /**
     * Verifica se o arquivo existe no Cloudflare R2 via HeadObject
     */
    async fileExists(objectKey) {
        if (this.client && this.isConfigured && process.env.R2_MOCK_STORAGE !== 'true') {
            try {
                const command = new client_s3_1.HeadObjectCommand({
                    Bucket: this.bucketName,
                    Key: objectKey
                });
                await this.client.send(command);
                return true;
            }
            catch (err) {
                if (err.name === 'NotFound' ||
                    err.$metadata?.httpStatusCode === 404 ||
                    err.name === 'NoSuchKey') {
                    return false;
                }
                console.warn('[R2StorageService.fileExists] Aviso ao verificar objeto no R2 via S3 client:', err?.message || err);
                return false;
            }
        }
        // Modo mock / desenvolvimento local
        return this.mockObjects.has(objectKey);
    }
    /**
     * Helper para simular upload nos testes locais
     */
    simulateMockUpload(objectKey, buffer) {
        this.mockObjects.add(objectKey);
        if (buffer) {
            this.mockBuffers.set(objectKey, buffer);
        }
    }
    /**
     * Helper para simular remoção nos testes locais
     */
    simulateMockDelete(objectKey) {
        this.mockObjects.delete(objectKey);
        this.mockBuffers.delete(objectKey);
    }
}
exports.R2StorageService = R2StorageService;
exports.r2StorageService = new R2StorageService();
