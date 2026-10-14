let initialization: Promise<void> | undefined;

export async function nativeGoogleCredential(clientId: string): Promise<string> {
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Configure o client ID web do Google para o Android.');
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  initialization ??= SocialLogin.initialize({ google: { webClientId: clientId, mode: 'online' } }).catch(error => { initialization = undefined; throw error; });
  await initialization;
  const response = await SocialLogin.login({ provider: 'google', options: {} });
  if (response.result.responseType !== 'online' || !response.result.idToken) throw new Error('O Google não retornou uma credencial válida.');
  return response.result.idToken;
}
