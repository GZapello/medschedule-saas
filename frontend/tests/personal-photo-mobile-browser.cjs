const { chromium, webkit, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const tempRedJpegPath = path.join(__dirname, 'temp-red-photo.jpg');
const tempBluePngPath = path.join(__dirname, 'temp-blue-photo.png');
const tempInvalidPath = path.join(__dirname, 'temp-corrupt.jpg');

// 2x2 solid Red JPEG
const redJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02,
  0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9
]);

// 1x1 solid Blue PNG
const bluePngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEfQHzR3/iCAAAAABJRU5ErkJggg==',
  'base64'
);

fs.writeFileSync(tempRedJpegPath, redJpegBuffer);
fs.writeFileSync(tempBluePngPath, bluePngBuffer);
fs.writeFileSync(tempInvalidPath, 'Corrupted binary content not a real picture');

async function testMobileDevice(name, browserType, deviceConfig) {
  console.log(`\n======================================================`);
  console.log(`TESTANDO EM DISPOSITIVO MÓVEL: ${name}`);
  console.log(`======================================================`);

  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    ...deviceConfig,
    hasTouch: true,
  });
  const page = await context.newPage();

  // Simulates PersonalPublicStudentWorkoutView & PersonalWorkoutPhotoShareModal
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #020617; color: #f8fafc; padding: 16px; }
        .btn-gallery-card {
          position: relative;
          overflow: hidden;
          padding: 8px 12px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          font-size: 11px;
          font-weight: bold;
          color: #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
        }
        .btn-gallery-modal {
          position: relative;
          overflow: hidden;
          padding: 10px 12px;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 800;
          color: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
        }
        .file-input-cover {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 10;
          -webkit-tap-highlight-color: transparent;
        }
        #modal {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          z-index: 50;
          padding: 16px;
          overflow-y: auto;
        }
        .modal-content {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 24px;
          padding: 16px;
          max-width: 480px;
          margin: 0 auto;
        }
        canvas {
          width: 100%;
          max-width: 260px;
          aspect-ratio: 9/16;
          border-radius: 16px;
          border: 1px solid #334155;
          display: block;
          margin: 0 auto;
        }
      </style>
    </head>
    <body>
      <div id="post-workout-card">
        <h3 style="font-size: 14px; font-weight: 900; margin-bottom: 8px;">Treino Concluído!</h3>
        <p style="font-size: 11px; color: #94a3b8; margin-bottom: 12px;">Comemore seus resultados com uma foto personalizada.</p>
        
        <!-- CAMINHO 1: Botão Escolher da Galeria na Tela Pós-Treino -->
        <label id="btn-post-workout-gallery" class="btn-gallery-card">
          <span style="color: #2dd4bf;">📷</span>
          <span>Escolher da galeria</span>
          <input
            id="input-post-workout-gallery"
            type="file"
            accept="image/*"
            class="file-input-cover"
            aria-label="Escolher foto da galeria pós-treino"
          />
        </label>
      </div>

      <!-- MODAL DE COMPARTILHAMENTO DE FOTO -->
      <div id="modal">
        <div class="modal-content">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong style="font-size: 14px;">Gerar Foto do Treino</strong>
            <button id="btn-close-modal" style="background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer;">✕</button>
          </div>

          <!-- Canvas Preview -->
          <canvas id="preview-canvas" width="1080" height="1920"></canvas>

          <div id="photo-error" style="display: none; margin-top: 8px; font-size: 11px; color: #f87171; background: rgba(153,27,27,0.4); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 8px; text-align: center;"></div>

          <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button type="button" style="padding: 10px; background: rgba(45,212,191,0.1); border: 1px solid rgba(45,212,191,0.4); border-radius: 12px; color: #2dd4bf; font-size: 11px; font-weight: 800;">Tirar foto</button>

            <!-- CAMINHO 2: Botão Escolher da Galeria DENTRO do Modal -->
            <label id="btn-modal-gallery" class="btn-gallery-modal">
              <span style="color: #2dd4bf;">🖼️</span>
              <span>Escolher da galeria</span>
              <input
                id="input-modal-gallery"
                type="file"
                accept="image/*"
                class="file-input-cover"
                aria-label="Escolher foto da galeria dentro do modal"
              />
            </label>
          </div>

          <div id="photo-controls" style="display: none; margin-top: 10px; padding: 8px; background: #020617; border-radius: 12px;">
            <button id="btn-remove-photo" style="background: none; border: none; color: #f87171; font-size: 11px; font-weight: bold; cursor: pointer;">
              🗑️ Usar arte sem foto
            </button>
          </div>
        </div>
      </div>

      <script>
        const canvas = document.getElementById('preview-canvas');
        const ctx = canvas.getContext('2d');
        const modal = document.getElementById('modal');
        const photoControls = document.getElementById('photo-controls');
        const photoErrorEl = document.getElementById('photo-error');

        let currentPhotoImage = null;
        let currentPhotoUrl = null;

        function setPhotoError(msg) {
          if (msg) {
            photoErrorEl.innerText = msg;
            photoErrorEl.style.display = 'block';
          } else {
            photoErrorEl.innerText = '';
            photoErrorEl.style.display = 'none';
          }
        }

        function renderWorkoutArt() {
          const width = 1080;
          const height = 1920;
          ctx.clearRect(0, 0, width, height);

          if (currentPhotoImage && (currentPhotoImage.naturalWidth > 0 || currentPhotoImage.width > 0)) {
            const imgW = currentPhotoImage.naturalWidth || currentPhotoImage.width;
            const imgH = currentPhotoImage.naturalHeight || currentPhotoImage.height;
            const scale = Math.max(width / imgW, height / imgH);
            const drawW = imgW * scale;
            const drawH = imgH * scale;
            const drawX = (width - drawW) / 2;
            const drawY = (height - drawH) / 2;

            ctx.drawImage(currentPhotoImage, drawX, drawY, drawW, drawH);

            const grad = ctx.createLinearGradient(0, height * 0.3, 0, height);
            grad.addColorStop(0, 'rgba(2, 6, 23, 0)');
            grad.addColorStop(1, 'rgba(2, 6, 23, 0.85)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, height * 0.3, width, height * 0.7);

            photoControls.style.display = 'block';
          } else {
            const bgGrad = ctx.createLinearGradient(0, 0, width, height);
            bgGrad.addColorStop(0, '#020617');
            bgGrad.addColorStop(0.45, '#062c28');
            bgGrad.addColorStop(1, '#020617');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, width, height);
            photoControls.style.display = 'none';
          }

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 56px sans-serif';
          ctx.fillText('Treino Concluído!', 80, 1600);
          ctx.font = 'bold 24px sans-serif';
          ctx.fillText('zemda.com.br', width / 2 - 80, 1850);
        }

        async function loadPhotoFromFile(file) {
          if (!file) return;
          setPhotoError(null);

          if (file.type && !file.type.startsWith('image/')) {
            setPhotoError('Por favor, selecione um arquivo de imagem válido (JPEG, PNG ou WebP).');
            return;
          }

          const processSource = (src, isObjectUrl) => {
            const img = new Image();
            img.onload = async () => {
              try {
                if ('decode' in img) await img.decode();
              } catch (_) {}

              if (currentPhotoUrl && currentPhotoUrl.startsWith('blob:') && currentPhotoUrl !== src) {
                try { URL.revokeObjectURL(currentPhotoUrl); } catch (_) {}
              }

              currentPhotoUrl = src;
              currentPhotoImage = img;
              setPhotoError(null);
              renderWorkoutArt();
            };

            img.onerror = () => {
              if (isObjectUrl) {
                const reader = new FileReader();
                reader.onload = ev => {
                  if (typeof ev.target.result === 'string') {
                    processSource(ev.target.result, false);
                  } else {
                    setPhotoError('Não foi possível ler os dados da foto selecionada.');
                  }
                };
                reader.onerror = () => setPhotoError('Erro ao ler a foto do seu dispositivo.');
                reader.readAsDataURL(file);
              } else {
                setPhotoError('Formato de foto não suportado. Por favor, escolha outra imagem.');
              }
            };

            img.src = src;
          };

          try {
            const objectUrl = URL.createObjectURL(file);
            processSource(objectUrl, true);
          } catch {
            const reader = new FileReader();
            reader.onload = ev => {
              if (typeof ev.target.result === 'string') {
                processSource(ev.target.result, false);
              } else {
                setPhotoError('Não foi possível processar a foto selecionada.');
              }
            };
            reader.onerror = () => setPhotoError('Erro ao acessar a foto no aparelho.');
            reader.readAsDataURL(file);
          }
        }

        document.getElementById('input-post-workout-gallery').addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            modal.style.display = 'block';
            renderWorkoutArt();
            loadPhotoFromFile(file);
          }
          e.target.value = '';
        });

        document.getElementById('input-modal-gallery').addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            loadPhotoFromFile(file);
          }
          e.target.value = '';
        });

        document.getElementById('btn-close-modal').addEventListener('click', () => {
          modal.style.display = 'none';
        });

        document.getElementById('btn-remove-photo').addEventListener('click', () => {
          if (currentPhotoUrl && currentPhotoUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(currentPhotoUrl); } catch (_) {}
          }
          currentPhotoUrl = null;
          currentPhotoImage = null;
          setPhotoError(null);
          renderWorkoutArt();
        });

        renderWorkoutArt();
      </script>
    </body>
    </html>
  `);

  // 1. Post-workout screen -> Escolher da galeria
  console.log(`[1] Tocando em 'Escolher da galeria' na tela pós-treino com gesto touch nativo...`);
  const [fileChooser1] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 3000 }),
    page.tap('#btn-post-workout-gallery')
  ]);
  assert.ok(fileChooser1, 'O seletor da galeria nativo deve ser acionado pelo toque!');
  console.log(`    PASS: Seletor nativo aberto com sucesso!`);

  console.log(`[2] Selecionando foto JPEG tirada pela câmera...`);
  await fileChooser1.setFiles(tempRedJpegPath);
  await page.waitForTimeout(500);

  const isModalVisible = await page.isVisible('#modal');
  assert.strictEqual(isModalVisible, true, 'O modal de compartilhamento deve se abrir imediatamente');
  console.log(`    PASS: Modal aberto após a seleção da foto.`);

  const controlsVisible = await page.isVisible('#photo-controls');
  assert.strictEqual(controlsVisible, true, 'Os controles de ajuste de foto devem estar visíveis');
  console.log(`    PASS: Controles de ajuste da foto visíveis.`);

  // 2. Inside modal -> Escolher da galeria
  console.log(`[3] Tocando em 'Escolher da galeria' DENTRO do modal para trocar a foto...`);
  const [fileChooser2] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 3000 }),
    page.tap('#btn-modal-gallery')
  ]);
  assert.ok(fileChooser2, 'O seletor da galeria dentro do modal deve ser acionado por toque!');
  console.log(`    PASS: Seletor nativo aberto de dentro do modal!`);

  console.log(`[4] Selecionando nova foto PNG da galeria...`);
  await fileChooser2.setFiles(tempBluePngPath);
  await page.waitForTimeout(500);

  const errorVisible = await page.isVisible('#photo-error');
  assert.strictEqual(errorVisible, false, 'Não deve haver erro ao selecionar imagem válida');
  console.log(`    PASS: Foto substituída sem erros.`);

  // 3. Remover foto
  console.log(`[5] Testando botão 'Usar arte sem foto'...`);
  await page.tap('#btn-remove-photo');
  await page.waitForTimeout(200);

  const controlsHidden = await page.isVisible('#photo-controls');
  assert.strictEqual(controlsHidden, false, 'Controles de foto devem sumir quando não há foto');
  console.log(`    PASS: Fundo ilustrativo restaurado com sucesso.`);

  // 4. Arquivo inválido
  console.log(`[6] Testando seleção de arquivo inválido/corrompido...`);
  const [fileChooser3] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 3000 }),
    page.tap('#btn-modal-gallery')
  ]);
  await fileChooser3.setFiles(tempInvalidPath);
  await page.waitForTimeout(600);

  const hasErrorMessage = await page.isVisible('#photo-error');
  const errorText = await page.innerText('#photo-error');
  assert.strictEqual(hasErrorMessage, true, 'Mensagem de erro deve ser exibida ao usuário');
  console.log(`    PASS: Mensagem de erro exibida corretamente: "${errorText}"`);

  // 5. Canvas export
  console.log(`[7] Testando geração de Blob PNG do Canvas...`);
  const blobValid = await page.evaluate(async () => {
    const c = document.getElementById('preview-canvas');
    return new Promise(res => {
      c.toBlob(blob => res(blob ? blob.size > 1000 : false), 'image/png');
    });
  });
  assert.strictEqual(blobValid, true, 'Canvas toBlob deve gerar imagem PNG válida');
  console.log(`    PASS: Canvas toBlob exporta PNG de alta resolução com sucesso.`);

  console.log(`\nTODOS OS TESTES MÓVEIS FORAM APROVADOS COM SUCESSO NO ${name}!`);
  await browser.close();
}

async function run() {
  try {
    await testMobileDevice('iPhone 14 (Mobile Safari / WebKit)', webkit, devices['iPhone 14']);
    await testMobileDevice('Google Pixel 7 (Android Chrome / Blink)', chromium, devices['Pixel 7']);
  } finally {
    if (fs.existsSync(tempRedJpegPath)) fs.unlinkSync(tempRedJpegPath);
    if (fs.existsSync(tempBluePngPath)) fs.unlinkSync(tempBluePngPath);
    if (fs.existsSync(tempInvalidPath)) fs.unlinkSync(tempInvalidPath);
  }
}

run().catch(err => {
  console.error('FALHA NOS TESTES MÓVEIS:', err);
  process.exit(1);
});
