import {budapestISO} from './format.js';

export function calculatedSessionEnd(start, durationMinutes) {
  if (!start) return '';
  const minutes=Number(durationMinutes);
  if (!Number.isInteger(minutes) || minutes<1 || minutes>1440)
    throw new Error('Válassz érvényes időtartamú szolgáltatást.');
  return new Date(Date.parse(budapestISO(start))+minutes*60000).toISOString();
}
