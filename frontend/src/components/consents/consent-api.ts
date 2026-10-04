import { buildApiUrl, getApiBaseUrl } from '../../api/client';

export const CONSENT_MODULES=['general','ZemdaFono','ZemdaTO','ZemdaNutri','ZemdaPsico','ZemdaPP','ZemdaPersonal','ZemdaFisio','ZemdaOdonto','Zemda360','ZemdaEstetic','ZemdaMed','ZemdaBody'];
export const consentDate=(value?:string|null)=>value?new Date(value.includes('T')?value:value.replace(' ','T')+'Z').toLocaleString('pt-BR'):'—';
export async function publicConsentApi<T>(path:string,body?:object):Promise<T> {
  const response=await fetch(buildApiUrl(getApiBaseUrl(),`/v1/public/consents/${path}`),{
    method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,
    credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||'Não foi possível carregar o termo.');
  return data;
}
export async function downloadConsentPdf(id:string,preview=false):Promise<void> {
  const viewer=preview?window.open('about:blank','_blank'):null;
  if(preview&&!viewer) throw new Error('Permita abrir a visualização do PDF no navegador.');
  if(viewer){viewer.opener=null;viewer.document.title='Carregando documento';viewer.document.body.textContent='Carregando PDF para visualização e impressão...';}
  try {
  const response=await fetch(buildApiUrl(getApiBaseUrl(),`/v1/consents/${id}/pdf`),{
    headers:{Authorization:`Bearer ${localStorage.getItem('auth_token')||''}`,'X-Tenant-ID':localStorage.getItem('active_tenant_id')||''},cache:'no-store'
  });
  if(!response.ok) { const data=await response.json(); throw new Error(data.error||'Erro ao gerar PDF.'); }
  const url=URL.createObjectURL(await response.blob());
  if(viewer){viewer.location.replace(url);setTimeout(()=>URL.revokeObjectURL(url),300000);return;}
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`termo-${id}.pdf`;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  } catch(error){viewer?.close();throw error;}
}
