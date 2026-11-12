const {fail}=require('./rules');
function configuration(){
  const value=key=>(process.env[key]||'').trim();
  const details={beneficiary:value('TRANSFER_BENEFICIARY'),bankName:value('TRANSFER_BANK_NAME'),
    account:value('TRANSFER_ACCOUNT')};
  if(!details.beneficiary || !details.account)
    fail('Az átutalási adatok beállítása még nem teljes. Kérjük, keress minket.',503);
  return details;
}
function instructions(amount,notice,id){
  const details=configuration();
  const origin=(process.env.FRONTEND_URL||'http://localhost:5173').split(',')[0].replace(/\/$/,'');
  return `\n\nÁtutalási adatok\nKedvezményezett: ${details.beneficiary}${details.bankName?'\nBank: '+details.bankName:''}\nBankszámlaszám: ${details.account}\nÖsszeg: ${amount} Ft\nKözlemény: ${notice}\nUtalási adatok: ${origin}/transfer?id=${encodeURIComponent(id)}\nA fizetés beérkezését az adminisztrátor ellenőrzi.`;
}
module.exports={configuration,instructions};
