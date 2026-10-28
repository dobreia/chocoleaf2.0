import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testIgnore:'**/transfer-checkout.spec.js',workers:1,timeout:180000,
  use:{baseURL:'http://127.0.0.1:5184',channel:'msedge',headless:true,actionTimeout:15000,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:[
    {command:'node ../backend/test/browser-server.cjs',url:'http://127.0.0.1:3012/api/health',timeout:120000,reuseExistingServer:false},
    {command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5184 --strictPort',url:'http://127.0.0.1:5184',env:{LOCAL_API_URL:'http://127.0.0.1:3012',VITE_API_URL:'/api'},timeout:120000,reuseExistingServer:false}
  ]
});
