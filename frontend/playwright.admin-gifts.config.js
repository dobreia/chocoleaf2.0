import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,
  testIgnore:[],testMatch:'**/admin-gift-issue.spec.js',outputDir:'test-results/admin-gifts',
  use:{...base.use,baseURL:'http://127.0.0.1:5199'},
  webServer:[
    {...base.webServer[0],url:'http://127.0.0.1:3029/api/health',
      env:{BROWSER_PAYMENT_PROVIDER:'transfer',BROWSER_API_PORT:'3029',BROWSER_FRONTEND_URL:'http://127.0.0.1:5199'}},
    {...base.webServer[1],url:'http://127.0.0.1:5199',
      command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5199 --strictPort',
      env:{LOCAL_API_URL:'http://127.0.0.1:3029',VITE_API_URL:'/api'}},
  ],
});
