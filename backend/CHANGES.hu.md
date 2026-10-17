# Módosítások – 2026-09-09

- Napi naptár: óránként csoportosított részletes adatlapkártyák, kezdés/vég, időtartam, létszám, elérhetőség, megjegyzések.
- Heti naptár: tömör kártyák az ügyfél, idő, szolgáltatás és státusz adataival; kis képernyőn naponta egymás alá rendezve.
- Havi naptár: foglalásszám, legfeljebb két kártya, +X további gomb a napi nézethez; keskeny képernyőn görgethető hétnapos rács.
- Adatlap minden nézetből megnyitható. A nézet- és dátumváltás betöltési hibája javítva.
- Munkatárs- és nyitvatartás-kezelés eltávolítva a navigációból, útvonalakból, listákból, formokból és API-kból. A kapcsolódó régi adatbázisadatok megmaradnak, de nem szabályozzák a foglalást.
- Közös műhelyidő: különböző alkalmak nem fedhetik egymást. Az egy alkalomra szóló csoportos foglalások továbbra is a férőhelykorlátig működnek. Régi átfedő alkalmakra új foglalás nem készül az ütközés rendezéséig.
- Dashboard: pénzügyi KPI és backend aggregáció eltávolítva; öt foglalási kártya rugalmas elrendezésben.
- A globális régi tiltott időszakok belső korlátként megmaradnak. Az online módosítási határidő is megmarad; ez nem nyitvatartás.

## Érintett fájlok
Frontend: src/pages/admin/{Calendar,Bookings,Slots,Records,Dashboard}.jsx; src/components/admin/{CalendarViews.jsx,calendarModel.js,AdminShell.jsx}; src/App.jsx; src/styles/AdminWorkspace.css; Settings.jsx törölve; test/calendar.test.mjs és npm test parancs.
Backend: src/domain/{schedule,courses,bookings,slotResponse}.js; src/routes/{scheduleAdminRoutes,bookingAdminRoutes,recordsAdminRoutes,publicRoutes}.js; src/index.js; test/integration.test.cjs. README-k és audit frissítve. Nincs romboló migráció.

## Ellenőrzés
33 sikeres backend integrációs teszt, 7 sikeres naptárteszt, sikeres frontend lint és production build. A naptártesztek a renderelt tartalmat és eseménykezelőket is ellenőrzik. Böngészős/mobilos vizuális teszt ebben a körben nem történt. A tesztadatbázis PostgreSQL-kompatibilis PGlite; a többkapcsolatos valódi PostgreSQL teszt külön TEST_DATABASE_URL-lel futtatható.

A csomagok a valódi backenddel működő alkalmazást tartalmazzák, nem a külön mintaadatos demót. Az online demó ebben a körben nem lett újrapublikálva.

## 2026-09-13
- Kurzus- és ajándékutalvány-oldalak új, reszponzív szerkezete.
- Törölhető/átírható létszámmező, backend validációval.
- Heti/havi naptár kurzusalkalmanként összesít; résztvevőlista és foglalásszerkesztés.
- Valódi admin képfeltöltés, dekódolás, tartós fájlmentés és előnézet.
- 37 backend- és 11 frontendteszt; böngészős vizuális ellenőrzés környezeti korlát miatt hátravan.

## 2026-09-15 – telefonos naptár
- Google OAuth, egyszer használható state, PKCE és titkosított refresh token.
- Külön Google-naptár, kurzusonként egy esemény, aktív létszám és adminlink.
- Tartós frissítési sor, 15 másodperces egyeztetés, újrapróbálás és helyreállítás.
- Admin kapcsolódási/státuszoldal, telefonos útmutató, kézi újraegyeztetés és leválasztás.
- 005-ös hozzáadó migráció; a demó nem kapcsolódik valódi Google-fiókhoz.
