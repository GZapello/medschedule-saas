import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import { extractDocxFullText } from '../controllers/import.controller';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BATCH_BYTES = 12 * 1024 * 1024;
const MAX_TEXT = 48_000;
const FORMATS: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv'
};
export const catalogError = (message: string, status = 400) => Object.assign(new Error(message), { status });
export const hash = (buffer: Buffer | string) => createHash('sha256').update(buffer).digest('hex');

export function readCatalogUploads(input: unknown) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) {
    throw catalogError('Selecione de 1 a 8 arquivos para análise.');
  }
  let total = 0;
  return input.map(file => {
    const fileName = typeof file?.fileName === 'string'
      ? file.fileName.split(/[\\/]/).pop()?.replace(/[\x00-\x1f]/g, '').slice(-180) || '' : '';
    const format = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeType = Object.hasOwn(FORMATS, format) ? FORMATS[format] : '';
    if (!mimeType) throw catalogError('Formato incompatível: ' + (fileName || 'arquivo sem nome') + '.');
    const base64 = file?.base64;
    if (typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
        base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw catalogError('Arquivo inválido ou acima de 5 MB: ' + fileName + '.');
    }
    const bytes = Buffer.from(base64, 'base64');
    total += bytes.length;
    if (bytes.length > MAX_FILE_BYTES || total > MAX_BATCH_BYTES) {
      throw catalogError('O limite é de 5 MB por arquivo e 12 MB no total.');
    }
    return { fileName, mimeType, format, bytes, fingerprint: hash(bytes) };
  });
}

function checkOfficeArchive(bytes: Buffer, requiredEntry: string) {
  const zip = new AdmZip(bytes);
  const entries = zip.getEntries();
  let expanded = 0;
  if (entries.length > 500 || !zip.getEntry(requiredEntry)) throw new Error('Arquivo Office inválido.');
  for (const entry of entries) {
    expanded += entry.header.size;
    if (expanded > 24 * 1024 * 1024 || entry.header.size > 8 * 1024 * 1024 || entry.header.flags & 1) {
      throw new Error('Arquivo Office excede os limites de leitura.');
    }
  }
}

const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif', 'heic', 'gif']);

export async function prepareCatalogFile(file: ReturnType<typeof readCatalogUploads>[number]) {
  const { fileName, mimeType, format, bytes } = file;
  try {
    if (mimeType.startsWith('image/')) {
      const image = sharp(bytes, { limitInputPixels: 24_000_000 });
      const meta = await image.metadata();
      if (!meta.format || !ALLOWED_IMAGE_FORMATS.has(meta.format)) {
        throw new Error('Imagem inválida.');
      }
      const data = await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 84 }).toBuffer();
      return { fileName, mimeType: 'image/jpeg', base64: data.toString('base64') };
    }
    if (format === 'pdf') {
      const tail = bytes.subarray(-2048).toString('latin1');
      if (bytes.subarray(0, 5).toString() !== '%PDF-' || !/startxref\s+\d+\s+%%EOF/.test(tail)) {
        throw new Error('PDF inválido.');
      }
      return { fileName, mimeType, base64: bytes.toString('base64') };
    }
    let text: string;
    if (format === 'docx') {
      checkOfficeArchive(bytes, 'word/document.xml');
      text = extractDocxFullText(bytes);
    } else {
      if (format === 'xlsx') checkOfficeArchive(bytes, 'xl/workbook.xml');
      if (format === 'csv' && (bytes.includes(0) || bytes.toString('utf8').includes('\uFFFD'))) {
        throw new Error('Use CSV UTF-8.');
      }
      const workbook = format === 'csv'
        ? XLSX.read(bytes.toString('utf8'), { type: 'string', raw: true, sheetRows: 501 })
        : XLSX.read(bytes, { type: 'buffer', sheetRows: 501 });
      if (workbook.SheetNames.length > 12) throw new Error('Planilha muito extensa.');
      text = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const range = sheet['!fullref'] || sheet['!ref'];
        if (range) {
          const bounds = XLSX.utils.decode_range(range);
          if (bounds.e.r >= 500 || bounds.e.c >= 50) throw new Error('Planilha muito extensa.');
        }
        return '[' + name + ']\n' + XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      }).join('\n\n');
    }
    if (!text.trim() || text.length > MAX_TEXT) {
      throw catalogError('O arquivo está vazio ou excede o limite de texto: ' + fileName + '.');
    }
    return { fileName, mimeType, text };
  } catch (error) {
    if ((error as { status?: number }).status) throw error;
    throw catalogError('Não foi possível ler ' + fileName + '. Verifique o formato e os limites do arquivo. CSV deve estar em UTF-8.');
  }
}
