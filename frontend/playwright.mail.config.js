import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,testIgnore:[],testMatch:'**/mail-management.spec.js',
  use:{...base.use,baseURL:'http://127.0.0.1:5197'},
  webServer:[
    {...base.webServer[0],url:'http://127.0.0.1:3025/api/health',env:{BROWSER_PAYMENT_PROVIDER:'transfer',BROWSER_API_PORT:'3025',BROWSER_FRONTEND_URL:'http://127.0.0.1:5197'}},
    {...base.webServer[1],command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197 --strictPort',url:'http://127.0.0.1:5197',env:{LOCAL_API_URL:'http://127.0.0.1:3025',VITE_API_URL:'/api'}}
  ]
});
