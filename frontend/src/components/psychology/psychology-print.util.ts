import { buildApiUrl, getApiBaseUrl } from '../../api/client';

/**
 * Utilitário para impressão autenticada e segura de documentos psicológicos (CFP 06/2019)
 * - Autentica a requisição via Authorization Bearer header (sem expor token na URL)
 * - Cria um Blob HTML isolado (text/html;charset=utf-8)
 * - Abre para impressão com layout limpo e revoga o ObjectURL com segurança
 */
export async function printPsychologyDocument(docId: string): Promise<void> {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const tenantId = localStorage.getItem('active_tenant_id');
  const baseUrl = getApiBaseUrl();
  const url = buildApiUrl(baseUrl, `/v1/psychology/documents/${docId}/print`);

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    let errorMsg = 'Falha ao carregar o documento para impressão.';
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {
      // Ignora erro de parse caso a resposta não seja JSON
    }
    throw new Error(`Erro (${response.status}): ${errorMsg}`);
  }

  const html = await response.text();

  // Injetar script de auto-print com disparo seguro após renderização
  const printReadyHtml = html.includes('window.print()')
    ? html
    : html.replace('</body>', `<script>
        window.addEventListener('load', function() {
          setTimeout(function() {
            window.focus();
            window.print();
          }, 300);
        });
      </script></body>`);

  const blob = new Blob([printReadyHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  // Tenta abrir em nova janela limpa com o blob URL
  const printWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

  if (printWindow) {
    // Revoga o blob após 60 segundos para evitar memory leak
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 60000);
  } else {
    // Fallback: se popup for bloqueado pelo navegador, utiliza iframe oculto
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn('[printPsychologyDocument] Erro ao disparar impressão no iframe:', e);
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          URL.revokeObjectURL(blobUrl);
        }, 60000);
      }
    };
  }
}
