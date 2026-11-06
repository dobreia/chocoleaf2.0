import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,testIgnore:[],testMatch:'**/voucher-redemption.spec.js',
  use:{...base.use,baseURL:'http://127.0.0.1:5196'},
  webServer:[
    {...base.webServer[0],url:'http://127.0.0.1:3024/api/health',env:{BROWSER_PAYMENT_PROVIDER:'transfer',BROWSER_API_PORT:'3024',BROWSER_FRONTEND_URL:'http://127.0.0.1:5196'}},
    {...base.webServer[1],command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5196 --strictPort',url:'http://127.0.0.1:5196',env:{LOCAL_API_URL:'http://127.0.0.1:3024',VITE_API_URL:'/api'}}
  ]
});
