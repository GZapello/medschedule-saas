/**
 * Cloudflare Worker: zemda-files-worker
 * 
 * Bindings:
 * - FILES_BUCKET: R2Bucket (vinculado ao bucket "zemda-files")
 * - ZEMDA_FILES_SIGNING_SECRET: Secret (chave HMAC-SHA256 compartilhada com o backend)
 * 
 * Endpoints:
 * - GET /health: Verificação de status
 * - GET /file?token=TOKEN: Download seguro de arquivo via token temporário HMAC (para <img src="...">)
 * - PUT /upload: Upload direto com Bearer token
 * - DELETE /file: Exclusão com Bearer token
 */

function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function base64UrlToUint8Array(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyHmacSha256(payloadBase64, signatureBase64, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = base64UrlToUint8Array(signatureBase64);
  const dataBytes = encoder.encode(payloadBase64);
  return await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
}

function parseAndValidateToken(rawToken, secret) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new Error('Token ausente');
  }

  const parts = rawToken.split('.');
  if (parts.length !== 2) {
    throw new Error('Formato de token inválido (esperado payload.assinatura)');
  }

  const [payloadBase64, signatureBase64] = parts;

  let payload;
  try {
    const jsonStr = new TextDecoder().decode(base64UrlToUint8Array(payloadBase64));
    payload = JSON.parse(jsonStr);
  } catch {
    throw new Error('Falha ao decodificar JSON do payload');
  }

  return { payloadBase64, signatureBase64, payload };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const secret = env.ZEMDA_FILES_SIGNING_SECRET;
    if (!secret) {
      return new Response(JSON.stringify({ error: 'ZEMDA_FILES_SIGNING_SECRET não configurado' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // 1. GET /health
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ ok: true, service: 'zemda-files-worker' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // 2. GET /file?token=... (Visualização segura de imagem)
    if (url.pathname === '/file' && request.method === 'GET') {
      try {
        const token = url.searchParams.get('token') || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        if (!token) {
          return new Response(JSON.stringify({ error: 'Token de leitura obrigatório' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const { payloadBase64, signatureBase64, payload } = parseAndValidateToken(token, secret);

        const isValidSig = await verifyHmacSha256(payloadBase64, signatureBase64, secret);
        if (!isValidSig) {
          return new Response(JSON.stringify({ error: 'Assinatura do token inválida' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        // Validação de expiração
        const now = Math.floor(Date.now() / 1000);
        if (!payload.exp || payload.exp < now) {
          return new Response(JSON.stringify({ error: 'Token de visualização expirado' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        // Validação de ação
        if (payload.action !== 'read') {
          return new Response(JSON.stringify({ error: 'Ação do token inválida para leitura' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const { clinicId, objectKey } = payload;
        if (!clinicId || !objectKey) {
          return new Response(JSON.stringify({ error: 'clinicId e objectKey são obrigatórios no token' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        // Validação de segurança de caminho (isolamento multiclínica e traversal)
        const expectedPrefix = `clinics/${clinicId}/`;
        if (!objectKey.startsWith(expectedPrefix) || objectKey.includes('..') || objectKey.includes('//')) {
          return new Response(JSON.stringify({ error: 'Acesso não autorizado para a chave informada' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        // Busca o objeto no bucket R2
        const object = await env.FILES_BUCKET.get(objectKey);
        if (!object) {
          return new Response(JSON.stringify({ error: 'Arquivo não encontrado' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        return new Response(object.body, {
          status: 200,
          headers: {
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'private, max-age=300',
            ...corsHeaders(origin),
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'Erro ao processar visualização' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }
    }

    // 3. PUT /upload (Upload de arquivo para o R2)
    if (url.pathname === '/upload' && request.method === 'PUT') {
      try {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (!token) {
          return new Response(JSON.stringify({ error: 'Token de upload obrigatório' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const { payloadBase64, signatureBase64, payload } = parseAndValidateToken(token, secret);
        const isValidSig = await verifyHmacSha256(payloadBase64, signatureBase64, secret);
        if (!isValidSig) {
          return new Response(JSON.stringify({ error: 'Assinatura inválida' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const now = Math.floor(Date.now() / 1000);
        if (!payload.exp || payload.exp < now) {
          return new Response(JSON.stringify({ error: 'Token de upload expirado' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        if (payload.action !== 'upload') {
          return new Response(JSON.stringify({ error: 'Ação incompatível' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const { clinicId, objectKey } = payload;
        const expectedPrefix = `clinics/${clinicId}/`;
        if (!objectKey.startsWith(expectedPrefix) || objectKey.includes('..')) {
          return new Response(JSON.stringify({ error: 'Caminho de objeto inválido' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const contentType = request.headers.get('Content-Type') || payload.mimeType || 'application/octet-stream';
        const fileData = await request.arrayBuffer();

        await env.FILES_BUCKET.put(objectKey, fileData, {
          httpMetadata: { contentType },
        });

        return new Response(
          JSON.stringify({
            ok: true,
            objectKey,
            size: fileData.byteLength,
            contentType,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'Erro no upload' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }
    }

    // 4. DELETE /file (Exclusão segura de arquivo)
    if (url.pathname === '/file' && request.method === 'DELETE') {
      try {
        const authHeader = request.headers.get('Authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (!token) {
          return new Response(JSON.stringify({ error: 'Token de exclusão obrigatório' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const { payloadBase64, signatureBase64, payload } = parseAndValidateToken(token, secret);
        const isValidSig = await verifyHmacSha256(payloadBase64, signatureBase64, secret);
        if (!isValidSig) {
          return new Response(JSON.stringify({ error: 'Assinatura inválida' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const now = Math.floor(Date.now() / 1000);
        if (!payload.exp || payload.exp < now) {
          return new Response(JSON.stringify({ error: 'Token de exclusão expirado' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        if (payload.action !== 'delete') {
          return new Response(JSON.stringify({ error: 'Ação incompatível' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        const { clinicId, objectKey } = payload;
        const expectedPrefix = `clinics/${clinicId}/`;
        if (!objectKey.startsWith(expectedPrefix) || objectKey.includes('..')) {
          return new Response(JSON.stringify({ error: 'Caminho de objeto inválido' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
          });
        }

        await env.FILES_BUCKET.delete(objectKey);

        return new Response(JSON.stringify({ ok: true, message: 'Arquivo excluído com sucesso' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'Erro na exclusão' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Rota não encontrada no worker' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};
