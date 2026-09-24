// Os endpoints de download redirecionam para a release do GitHub (ou para a URL configurada).
const assert = require('node:assert/strict');
const express = require('express');

const app = express();
app.use('/api', require('./dist/routes').default);

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const location = async (url) => {
    const res = await fetch(base + url, { redirect: 'manual', headers: { Connection: 'close' } });
    assert.equal(res.status, 302, url);
    return res.headers.get('location');
  };

  try {
    delete process.env.DOWNLOAD_WINDOWS_URL;
    delete process.env.DOWNLOAD_ANDROID_URL;
    assert.equal(await location('/api/v1/public/download-windows'), 'https://github.com/GZapello/medschedule-saas/releases/latest/download/Zemda-Setup.exe');
    assert.equal(await location('/api/v1/public/download-android'), 'https://github.com/GZapello/medschedule-saas/releases/latest/download/Zemda.apk');

    process.env.DOWNLOAD_WINDOWS_URL = 'https://cdn.zemda.test/win.exe';
    process.env.DOWNLOAD_ANDROID_URL = 'https://cdn.zemda.test/app.apk';
    assert.equal(await location('/api/v1/public/download-windows'), 'https://cdn.zemda.test/win.exe');
    assert.equal(await location('/api/v1/public/download-android'), 'https://cdn.zemda.test/app.apk');

    console.log('✅ Redirecionamentos de download OK');
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    server.close();
  }
})();
