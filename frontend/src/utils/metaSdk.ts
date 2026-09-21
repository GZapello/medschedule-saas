declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

let sdkLoadingPromise: Promise<any> | null = null;

/**
 * Carrega e inicializa de forma segura e assíncrona o Facebook JavaScript SDK oficial.
 * @param appId ID do aplicativo Meta retornado pelo backend ou variável de ambiente
 * @param version Versão da Graph API (padrão v21.0)
 */
export function loadFacebookSdk(appId: string, version: string = 'v21.0'): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window não disponível (SSR)'));
  }

  // Se o FB já foi carregado e inicializado
  if (window.FB && window.FB.login) {
    return Promise.resolve(window.FB);
  }

  if (sdkLoadingPromise) {
    return sdkLoadingPromise;
  }

  sdkLoadingPromise = new Promise((resolve, reject) => {
    // Configura o callback global invocado pelo script da Meta assim que o download é concluído
    window.fbAsyncInit = function () {
      try {
        if (window.FB) {
          window.FB.init({
            appId: appId || undefined,
            cookie: true,
            xfbml: true,
            version
          });
          resolve(window.FB);
        } else {
          reject(new Error('Objeto FB não encontrado após carregamento do SDK'));
        }
      } catch (err) {
        reject(err);
      }
    };

    // Verifica se a tag <script> já existe no documento
    const existingScript = document.getElementById('facebook-jssdk');
    if (existingScript) {
      // Se o script já está no DOM, aguarda inicialização
      if (window.FB) {
        window.fbAsyncInit();
      }
      return;
    }

    // Injeta a tag do script oficial da Meta
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';

    script.onerror = () => {
      sdkLoadingPromise = null;
      reject(
        new Error(
          'Falha ao carregar o SDK oficial do Facebook. Verifique bloqueadores de conteúdo ou conectividade.'
        )
      );
    };

    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.body.appendChild(script);
    }

    // Timeout de segurança após 15 segundos
    setTimeout(() => {
      if (!window.FB) {
        sdkLoadingPromise = null;
        reject(new Error('Tempo limite excedido ao carregar o SDK da Meta.'));
      }
    }, 15000);
  });

  return sdkLoadingPromise;
}
