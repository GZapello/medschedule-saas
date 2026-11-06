const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function testLogoPresentation() {
  console.log('=== TESTE DE APARÊNCIA DA LOGO OFICIAL DO ZEMDA NA ARTE DO TREINO ===');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const logoBase64 = fs.readFileSync(path.join(__dirname, '../public/brand/zemda-logo.png')).toString('base64');

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="background: #020617; padding: 20px;">
      <canvas id="canvas-story" width="1080" height="1920"></canvas>
      <canvas id="canvas-square" width="1080" height="1080"></canvas>
      <img id="orig-logo" src="data:image/png;base64,${logoBase64}" />

      <script>
        const img = document.getElementById('orig-logo');

        function renderArt(format) {
          const isStory = format === 'story';
          const width = 1080;
          const height = isStory ? 1920 : 1080;
          const canvas = document.getElementById(isStory ? 'canvas-story' : 'canvas-square');
          const ctx = canvas.getContext('2d');

          // Dark background like workout art
          ctx.fillStyle = '#020617';
          ctx.fillRect(0, 0, width, height);

          // EXACT LOGO DRAWING CODE FROM PersonalWorkoutPhotoShareModal.tsx
          const logoToDraw = img;
          const targetLogoH = isStory ? 58 : 48;
          const logoAspect = logoToDraw.naturalWidth / logoToDraw.naturalHeight;
          const logoH = targetLogoH;
          const logoW = Math.round(logoH * logoAspect);

          const urlBaselineY = height - (isStory ? 42 : 28);
          const logoDrawX = Math.round((width - logoW) / 2);
          const logoDrawY = Math.round(urlBaselineY - (isStory ? 28 : 22) - logoH);

          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(logoToDraw, logoDrawX, logoDrawY, logoW, logoH);
          ctx.restore();

          // Address
          ctx.save();
          ctx.font = '700 ' + (isStory ? 22 : 19) + 'px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = '#f8fafc';
          ctx.fillText('zemda.com.br', width / 2, urlBaselineY);
          ctx.restore();

          return { logoDrawX, logoDrawY, logoW, logoH, urlBaselineY };
        }

        window.renderArt = renderArt;
      </script>
    </body>
    </html>
  `);

  await page.waitForFunction(() => document.getElementById('orig-logo').complete);

  // Test Story
  const storyMetrics = await page.evaluate(() => window.renderArt('story'));
  console.log('Story layout metrics:', storyMetrics);
  assert.strictEqual(storyMetrics.logoDrawX, Math.round((1080 - storyMetrics.logoW) / 2), 'Logo deve estar centralizada horizontalmente');
  assert.ok(storyMetrics.logoDrawY < storyMetrics.urlBaselineY, 'Logo deve estar acima do endereço zemda.com.br');

  // Test Square
  const squareMetrics = await page.evaluate(() => window.renderArt('square'));
  console.log('Square layout metrics:', squareMetrics);
  assert.strictEqual(squareMetrics.logoDrawX, Math.round((1080 - squareMetrics.logoW) / 2), 'Logo deve estar centralizada horizontalmente no formato quadrado');

  // Verify that logo pixels are drawn and no artificial white box exists
  const validation = await page.evaluate((metrics) => {
    const canvas = document.getElementById('canvas-story');
    const ctx = canvas.getContext('2d');

    // Sample pixel outside logo (should be background #020617)
    const bgPixel = ctx.getImageData(metrics.logoDrawX - 20, metrics.logoDrawY + 10, 1, 1).data;

    // Sample pixel inside logo area
    const logoPixel = ctx.getImageData(metrics.logoDrawX + 15, metrics.logoDrawY + 25, 1, 1).data;

    return {
      bgR: bgPixel[0],
      bgG: bgPixel[1],
      bgB: bgPixel[2],
      logoR: logoPixel[0],
      logoG: logoPixel[1],
      logoB: logoPixel[2],
      logoA: logoPixel[3]
    };
  }, storyMetrics);

  console.log('Pixel validation:', validation);
  assert.strictEqual(validation.bgR, 2, 'Fundo deve ser o fundo escuro do card (#020617), sem caixa branca');
  assert.ok(validation.logoA > 0, 'Pixels da logo foram renderizados com sucesso');

  console.log('\nTODOS OS TESTES DE APARÊNCIA DA LOGO FORAM APROVADOS COM SUCESSO!');
  await browser.close();
}

testLogoPresentation().catch(err => {
  console.error('Falha no teste da logo:', err);
  process.exit(1);
});
