const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const frontendDist = path.resolve(__dirname, '../frontend/dist');
const targetRenderer = path.resolve(__dirname, 'renderer');

console.log('🔄 Sincronizando bundle de produção do frontend com o pacote desktop...');

if (!fs.existsSync(frontendDist) || !fs.existsSync(path.join(frontendDist, 'index.html'))) {
  console.log('📦 frontend/dist não encontrado. Executando npm run build no frontend...');
  execSync('npm run build', { cwd: path.resolve(__dirname, '../frontend'), stdio: 'inherit' });
}

// Limpa targetRenderer anterior se existir
if (fs.existsSync(targetRenderer)) {
  fs.rmSync(targetRenderer, { recursive: true, force: true });
}

// Copia recursivamente frontend/dist para desktop/renderer
fs.cpSync(frontendDist, targetRenderer, { recursive: true });

console.log('✅ Bundle sincronizado com sucesso em desktop/renderer!');
