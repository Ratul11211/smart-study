import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartstudy.app',
  appName: 'Smart Study',
  webDir: 'out',
  server: {
    allowNavigation: ['smart-study-6fee3.firebaseapp.com', 'accounts.google.com']
  }
};

export default config;
