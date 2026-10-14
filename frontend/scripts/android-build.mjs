import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const tasks = { debug: 'assembleDebug', release: 'assembleRelease', bundle: 'bundleRelease' };
const mode = process.argv[2];
if (!tasks[mode]) throw new Error('Use debug, release ou bundle.');
if (mode !== 'debug') {
  const missing = ['ZEMDA_KEYSTORE_PATH', 'ZEMDA_KEYSTORE_PASSWORD', 'ZEMDA_KEY_ALIAS', 'ZEMDA_KEY_PASSWORD'].filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Assinatura release não configurada. Defina no ambiente: ${missing.join(', ')}. Não grave segredos no repositório.`);
}
const windows = process.platform === 'win32';
const environment = { ...process.env };
const localJdk = fileURLToPath(new URL('../../tools/jdk-21/', import.meta.url));
if (!environment.JAVA_HOME && existsSync(`${localJdk}/bin/${windows ? 'java.exe' : 'java'}`)) environment.JAVA_HOME = localJdk;
const args = [tasks[mode]];
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', args, {
  cwd: fileURLToPath(new URL('../android/', import.meta.url)), stdio: 'inherit', shell: windows, env: environment
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
