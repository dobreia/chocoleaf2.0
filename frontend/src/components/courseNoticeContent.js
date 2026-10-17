import {sessionsOf} from './courseSessions.js';

export function courseBookingNotice(service, offers) {
  const description='A foglalással az összes alkalmat lefoglalod. Az ár a teljes kurzusra szól.';
  const isMultiSession=offers?.length
    ? offers.some(offer=>sessionsOf(offer).length>1)
    : Number(service?.session_count || 1)>1;
  return isMultiSession ? {
    title:'Ez egy több alkalmas kurzus.',
    description,
  } : null;
}
