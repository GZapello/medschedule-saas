import { Capacitor } from '@capacitor/core';

/** Web downloads stay unchanged; Android uses app-private cache + the system share/save UI. */
export async function downloadBlob(blob: Blob, filename: string) {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const safeName = filename.replace(/[^\p{L}\p{N}._-]/gu, '_');
  const path = `zemda-exports/${Date.now()}-${safeName}`;
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const file = await Filesystem.writeFile({ directory: Directory.Cache, path, data, recursive: true });
  try { await Share.share({ title: filename, files: [file.uri], dialogTitle: 'Salvar ou compartilhar documento' }); }
  finally {
    // Do not remove immediately: receiving apps can consume the granted URI asynchronously.
    setTimeout(() => { void Filesystem.deleteFile({ directory: Directory.Cache, path }).catch(() => {}); }, 300000);
  }
}
