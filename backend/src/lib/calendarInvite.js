const addressparser = require('nodemailer/lib/addressparser');

const LOCATION = 'ChocoLeaf – 1039 Budapest, Huba utca 3.';
const text = value => String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
  .replace(/;/g, '\\;').replace(/,/g, '\\,');
const parameter = value => String(value).replace(/\^/g, '^^').replace(/\r\n|\r|\n/g, '^n').replace(/"/g, "^'");
const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

// RFC 5545 folds at 75 octets, without splitting UTF-8 characters.
function fold(line) {
  let part = '', bytes = 0;
  const lines = [];
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > 75) {
      lines.push(part);
      part = ' ';
      bytes = 1;
    }
    part += char;
    bytes += size;
  }
  return [...lines, part].join('\r\n');
}

function organizer() {
  const parsed = addressparser(process.env.MAIL_FROM || process.env.MAIL_USER || '')[0];
  return parsed?.address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.address)
    ? parsed.address : 'info@chocoleaf.hu';
}

function eventTitle(payload) {
  return `${payload.title}${payload.count > 1 ? ` – ${payload.index}/${payload.count}. alkalom` : ''}`;
}

function invitation({ uid, sequence, payload, method, now = new Date() }) {
  const description = `A foglalás ${payload.seats} főre szól.\n` +
    (payload.count > 1 ? `Ez a kurzus ${payload.index}/${payload.count}. alkalma. A foglalás az összes alkalomra szól.\n` : '') +
    `Foglalási azonosító: ${payload.bookingId}\n` +
    'A naptári elfogadás vagy elutasítás nem módosítja a foglalásodat. ' +
    'Módosítást vagy lemondást az eredeti visszaigazoló levél foglaláskezelő linkjén kérhetsz.';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ChocoLeaf//Booking Calendar//HU',
    'CALSCALE:GREGORIAN', `METHOD:${method}`, 'BEGIN:VEVENT',
    `UID:${uid}`, `SEQUENCE:${sequence}`, `DTSTAMP:${stamp(now)}`, `LAST-MODIFIED:${stamp(now)}`,
    `DTSTART:${stamp(payload.start)}`, `DTEND:${stamp(payload.end)}`,
    `SUMMARY:${text(eventTitle(payload))}`, `LOCATION:${text(payload.location)}`,
    `DESCRIPTION:${text(description)}`, `ORGANIZER;CN="ChocoLeaf":mailto:${payload.organizer}`,
    `ATTENDEE;CN="${parameter(payload.name)}";CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=${method === 'REQUEST' ? 'TRUE' : 'FALSE'}:mailto:${payload.email}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE',
    'CLASS:PRIVATE', 'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { invitation, eventTitle, organizer, LOCATION };
