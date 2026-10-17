# Emailküldés

A backend/.env fájlban állítsd be a saját levelezőszolgáltatód adatait a .env.mail.example alapján:

- SMTP_HOST: a szolgáltató SMTP-kiszolgálója.
- SMTP_PORT: 587 (STARTTLS) vagy 465 (TLS), a szolgáltató szerint.
- MAIL_USER, MAIL_PASS: SMTP-felhasználónév és jelszó / alkalmazásjelszó.
- MAIL_FROM: a szolgáltatónál engedélyezett feladó emailcíme.
- MAIL_ADMIN: az adminértesítések címzettje.

A jelszót ne tedd verziókezelésbe és ne küldd chatben. Az értékek módosítása után indítsd újra a backendet. Az indulás automatikusan alkalmazza az emailcsatolmányok migrációját is.

## Értesítések

- Sikeres foglalási fizetés: a vásárlónak adatok, időpont, létszám, összeg, fizetési és foglalási állapot, bizalmas kezelési link. Az adminnak foglalási adatok, elérhetőségek, megjegyzés és adminlink.
- Foglalás adminisztrátori visszaigazolása, módosítása, lemondási/módosítási kérelme és döntése: vásárlói és adminértesítés.
- Utalvány: rendelésindítási értesítések, fizetés után a vásárlónak a névre szóló PDF-ek csatolmányként; az adminnak értesítés a kiállításról és küldési sorba helyezésről.
- Elkészült Billingo-számla: külön email a vásárlónak a megnyitási linkkel.

A levelek és az utalványcsatolmányok adatbázisban tárolt küldési sorból mennek ki. A feldolgozó 15 másodpercenként indul, hiba esetén 5 perc múlva újrapróbálkozik. Az admin kezdőoldalán a kiküldetlen levelek száma látható. Az SMTP-szerver átvétele nem bizonyítja a beérkezést: spam/pattogó levél esetén a szolgáltató naplóit is ellenőrizni kell. Hálózati megszakadáskor, ha a szerver már átvette a levelet, de a visszajelzés elveszett, az újrapróbálás ismételt kézbesítést okozhat.

## Helyi teszt

A `backend/.env.local-test` fájlban a `LOCAL_MAIL_MODE=real` kapcsolja be a valódi küldést. A HELYI-TESZT.cmd ilyenkor a backend/.env SMTP-beállításait használja, induláskor ellenőrzi a hitelesítést, és hiba esetén érthető üzenettel leáll. A vásárlói levelek az űrlapban megadott címre, az adminlevelek a MAIL_ADMIN címre mennek. A PDF-ek valódi csatolmányok. A Stripe ettől tesztmódban marad, Billingo-számla továbbra sem készül.

Kapcsolatellenőrzés levélküldés nélkül: `npm run mail:check` a backend mappából. Az SMTP-hitelesítés sikere még nem igazolja egy levél kézbesítését; ezt saját emailcímmel végzett tesztfoglalással és utalványvásárlással ellenőrizheted.

A `LOCAL_MAIL_MODE=capture` visszakapcsol a helyi SMTP-fogadóra: a levelek a backend/.local-mail mappába kerülnek .eml fájlként. A `npm run local:check` a kapcsolótól függetlenül mindig helyben fogadja a tesztleveleket.

A localhostos foglaláskezelő linkek az alkalmazást futtató számítógépen nyithatók meg. Másik készülékről elérhető linkekhez nyilvánosan elérhető weboldal szükséges.
