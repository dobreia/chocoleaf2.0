import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,
  testIgnore:[],testMatch:'**/transfer-checkout.spec.js',
  webServer:base.webServer.map((server,index)=>index===0
    ? {...server,env:{...server.env,BROWSER_PAYMENT_PROVIDER:'transfer'}} : server),
});
