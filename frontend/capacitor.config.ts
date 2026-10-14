import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.zemda.app',
  appName: 'Zemda',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false }
    },
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
