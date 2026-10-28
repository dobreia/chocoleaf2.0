const {fail}=require('./rules');
function configuration(){
  const value=key=>(process.env[key]||'').trim();
  const details={beneficiary:value('TRANSFER_BENEFICIARY'),bankName:value('TRANSFER_BANK_NAME'),
    account:value('TRANSFER_ACCOUNT'),iban:value('TRANSFER_IBAN'),swift:value('TRANSFER_SWIFT')};
  if(!details.beneficiary || (!details.account && !details.iban))
    fail('Az átutalási adatok beállítása még nem teljes. Kérjük, keress minket.',503);
  return details;
}
function instructions(amount,notice,id){
  const details=configuration();
  const origin=(process.env.FRONTEND_URL||'http://localhost:5173').split(',')[0].replace(/\/$/,'');
  return `\n\nÁtutalási adatok\nKedvezményezett: ${details.beneficiary}${details.bankName?'\nBank: '+details.bankName:''}${details.account?'\nBankszámlaszám: '+details.account:''}${details.iban?'\nIBAN: '+details.iban:''}${details.swift?'\nSWIFT: '+details.swift:''}\nÖsszeg: ${amount} Ft\nKözlemény: ${notice}\nUtalási adatok: ${origin}/transfer?id=${encodeURIComponent(id)}\nA fizetés beérkezését az adminisztrátor ellenőrzi.`;
}
module.exports={configuration,instructions};
