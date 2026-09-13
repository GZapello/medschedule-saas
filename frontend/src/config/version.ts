// Configuração central de versão do aplicativo Zemda / MedSchedule
export const APP_VERSION = '1.1.2';
export const APP_NAME = 'Zemda';
export const RELEASE_DATE = '2026-09-12';
export const RELEASE_NOTES = 'Versão 1.1.2: Reconhecimento de fala aprimorado, IA para evolução clínica e melhorias de estabilidade.';

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  minRequiredVersion?: string;
  releaseNotes?: string;
  downloadWindowsUrl?: string;
  downloadAndroidUrl?: string;
}

/**
 * Compara duas versões semânticas (ex: "1.1.1" vs "1.1.2")
 * Retorna:
 *  1 se v1 > v2
 * -1 se v1 < v2
 *  0 se v1 == v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/i, '').split('.').map(p => parseInt(p, 10) || 0);
  const parts2 = v2.replace(/^v/i, '').split('.').map(p => parseInt(p, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}
