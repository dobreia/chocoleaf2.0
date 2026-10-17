# Ügyfélbemutató

## Indítás

1. Indítsd el a `HELYI-TESZT.cmd` fájlt. Ha már fut, előbb állítsd le Ctrl+C-vel, majd indítsd újra.
2. Weboldal: http://127.0.0.1:5174 — Admin: http://127.0.0.1:5174/admin.
3. Az adminbelépéshez a `backend/.env` ADMIN_EMAIL és ADMIN_PASSWORD értékei használhatók. Ezeket ne másold a bemutató anyagába.

Az indító kizárólag a külön `chocoleaf_stripe_local` adatbázist használja. Minden aktív, fizethető képzéshez legalább két jövőbeli időpontot készít, amennyiben ennyi még nincs. A meglévő adatokat nem törli. A hiányzó jogi oldalakat egyértelműen megjelölt tesztszöveggel tölti fel; a már szerkesztett tartalmat megőrzi.

## Javasolt bemutatási sorrend

1. Főoldal, galéria, bemutatkozás; keskeny ablakban a mobilmenü.
2. Képzések → Részletek → időpont → foglalási és számlázási adatok → automatikus Stripe-átirányítás.
3. Stripe tesztkártya: `4242 4242 4242 4242`, jövőbeli lejárat és tetszőleges háromjegyű CVC. A bemutatóhoz tesztadatokat adj meg.
4. Visszatérés után sikeres fizetés; az adminban megjelenik a fizetett, visszaigazolásra váró foglalás. Az admin visszaigazolhatja.
5. A `backend/.local-mail` mappában nyisd meg a vásárlói és adminleveleket. A vásárlói kezelési linkkel módosítási vagy lemondási kérelem küldhető; ez az adminban jóváhagyható vagy elutasítható.
6. Ajándékutalvány: érték, darabszám, nevek, kézbesítési cím, számlázás, Stripe-tesztfizetés. Rövid feldolgozás után a helyi levél PDF-csatolmányként tartalmazza az utalványokat.
7. Admin: naptár nap/hét/hónap nézete; szolgáltatás szerkesztése és képfeltöltés; időpont felvétele; manuális foglalás; ügyfelek és megkeresések; oldaltartalom szerkesztése.
8. Kapcsolat és ajánlatkérés: küldj tesztüzenetet, majd jelöld kezeltnek az adminban.

## A bemutató határai

- A helyi indító valódi Stripe **tesztkörnyezethez** csatlakozik; a `backend/.env.local-test` fájlban tesztkulcs és internetkapcsolat szükséges. Nem történik valódi pénzterhelés.
- Billingo-számla helyi módban nem készül. A felület ezt jelzi. Valódi számlázáshoz a Billingo-beállítások és külön integrációs ellenőrzés szükségesek.
- `LOCAL_MAIL_MODE=capture` esetén az emailek helyi `.eml` fájlok; `LOCAL_MAIL_MODE=real` esetén a beállított SMTP-szolgáltatón keresztül valódi postafiókba mennek. Részletek: `backend/EMAIL.hu.md`. A háttérfeldolgozók 15 másodpercenként futnak, így a levél nem mindig azonnal jelenik meg.
- A telefonos Google-naptár előnézete megmutatható, a tényleges szinkronhoz saját Google OAuth-beállítás és fiókösszekapcsolás kell.
- A jogi tesztszövegek kizárólag bemutatásra szolgálnak.

## Fejlesztői ellenőrzések

2026. október 11-i ellenőrzés: 67 backendteszt, 16 frontendteszt és 4 összetett Edge-böngészős forgatókönyv sikeres. A lint, a production build, a helyi indítás ellenőrzése és a statikus kép-/eszközhivatkozások vizsgálata is sikeres. A böngészős tesztek lefedik a nyilvános oldalakat és képeiket, a 390 px széles mobilnézetet és menüt, az összes adminoldal betöltését, az érdeklődés beküldését/kezelését, a foglalási és utalványfizetési folyamatot szimulált Stripe-pal, a PDF létrejöttét, a foglalási kezelőlinket, továbbá a szolgáltatás-, kép-, időpont-, foglalás- és tartalomkezelést, valamint a kijelentkezést.

A valódi Stripe-hálózati fizetést, Billingo-számlakiállítást, internetes email-kézbesítést és Google-fiókhoz kapcsolódást ez az ellenőrzés nem igazolja; a helyi bemutató és a szimulált külső szolgáltatókkal végzett tesztek eredményét rögzíti.

- Backend: `node --test --test-concurrency=1 test/*.test.cjs` a backend mappából.
- Frontend: `node --test --test-concurrency=1 test/*.test.mjs`, `npm run lint`, `npm run build` a frontend mappából.
- Böngésző: `npm run test:e2e` a frontend mappából. A konfiguráció a telepített Microsoft Edge-et használja; a szerverek kizárólag a 3012/5184 tesztportokon futnak, külön memóriabeli adatbázissal. A Stripe-válaszokat ez az automatizált teszt szimulálja; nem használ saját kulcsot és nem indít külső fizetést.
- Helyi indítás: `npm run local:check` a backend mappából (kulcs és külső fizetés nélkül ellenőrzi a PostgreSQL-t, az adminbelépést, a frontend–backend kapcsolatot és a helyi levélfogadót).
