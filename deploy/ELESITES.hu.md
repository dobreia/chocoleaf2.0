# ChocoLeaf – előkészítés a www.chocoleaf.hu domainre

A nyilvános cím **https://www.chocoleaf.hu**. Az új frontend ugyanazon a domainen, a `/api` útvonalon éri el a backendet. Külön API-domainre és frontendbe másolt titkokra nincs szükség. **2026. november 12-én az új rendszer élesítve lett, majd rövid visszakapcsolás után a tulajdonos újabb kérésére ismét az új rendszer került élesbe. A szolgáltatás fut, automatikus indulása engedélyezett; a nyilvános ellenőrzések sikeresek.** A tényleges szerverbeállításokat és a frissítéshez szükséges natív képfeldolgozó lépéseit a [RackForest üzemeltetési jegyzet](RACKFOREST.hu.md) tartalmazza. Az alábbi általános telepítési leírás önmagában nem helyettesíti a szerverhez tartozó jegyzetet.

## Beállítások

A szerveren a `backend/.env.production.example` alapján készítsd el a `backend/.env` fájlt. A meglévő SMTP-jelszót, Google-kliensadatokat és titkosító kulcsokat tartsd meg; a minta üres titokmezői nem használható értékek. A fájl ne kerüljön Gitbe vagy a nyilvános webkönyvtárba. A futtató felhasználónak legyen olvasási joga, másnak ne.

Az éles értékek:

```dotenv
NODE_ENV=production
FRONTEND_URL=https://www.chocoleaf.hu
HOST=127.0.0.1
PORT=3001
TRUST_PROXY=1
GOOGLE_CONTACTS_REDIRECT_URI=https://www.chocoleaf.hu/api/contacts/google/callback
GOOGLE_CALENDAR_REDIRECT_URI=https://www.chocoleaf.hu/api/calendar/google/callback
```

A `TRUST_PROXY=1` a mellékelt, egyetlen helyi Nginx proxyt feltételező mintához tartozik. Más proxyfelépítésnél ezt előbb ellenőrizni kell. A 3001-es port ne legyen az internetről elérhető.

A projekt helyi `.env` fájljában a nyilvános linkek és a névjegyes OAuth-visszairányítás már az éles domainre mutatnak. A helyi futtatás környezete továbbra is fejlesztői; az éles `NODE_ENV`, proxy- és szerverbeállításokat a fenti minta adja meg. Az `npm run local` a frontend címét felülírja `http://127.0.0.1:5174` értékre; a helyi Google-visszairányítás a külön `.env.local-test` fájlban van. Ezt a helyi fájlt ne telepítsd a szerverre, és élesben ne az `npm run local` parancsot használd.

A szerver adatbázisát külön állítsd be és ellenőrizd. A helyi `chocoleaf_stripe_local` adatbázist a szerver nem veszi át automatikusan. Az adminfiókok és a tényleges szolgáltatás-/időpontadatok az adatbázisban vannak, ezért ezek átvitelét is meg kell tervezni és mentéssel végezni.

## Google Cloud

A használt OAuth-kliens **Authorized redirect URIs** listájához add hozzá:

- `https://www.chocoleaf.hu/api/contacts/google/callback`
- `https://www.chocoleaf.hu/api/calendar/google/callback` – ha az admin Google-naptárszinkronját is használjátok.

A helyi teszthez használt URI-k maradhatnak a listában. A névjegyekhez és a naptárhoz külön kliens is használható; ilyenkor mindegyiknél a hozzá tartozó címet kell felvenni. A névjegyszinkronnál az alkalmazás HTTPS-kezdőoldala `https://www.chocoleaf.hu`, az engedélyezett domain `chocoleaf.hu` legyen. A szerveren az adminfelületről ellenőrizd/kapcsold össze a Google-fiókot; a helyi adatbázisban tárolt kapcsolat nem kerül át magától. A meglévő titkosító kulcsokat migrált tokenadatok mellett tilos véletlenül lecserélni.

## Frontend, backend és proxy

1. A szerver jelenlegi webhelyéről, adatbázisáról és konfigurációjáról készüljön mentés, mielőtt átállítod a domaint.
2. A projekt mindkét könyvtárában `npm ci` telepítse a rögzített függőségeket. A frontendben `npm run build` készítse el a `dist` könyvtárat. A frontend `VITE_API_URL` értéke `/api`; ehhez nem kell a domain nevével újraépíteni.
3. A teljes backend mellett maradjon meg a `frontend/public/assets` könyvtár: PDF-sablonok, fontok és galéria is innen olvasódhatnak. A feltöltések tartós, írható könyvtára a `UPLOAD_DIR`; a meglévő képfájlokat is át kell másolni és menteni. A privát utalványokat szintén őrizd meg.
4. A backend a `backend` könyvtárból `npm start` paranccsal indul, a szerver `.env` beállításaival. Induláskor adatbázis-migrációkat futtat, ezért előtte adatbázismentés szükséges. Folyamatkezelővel állítsd be az automatikus indulást és újraindulást; ezt a proxy konfigurációja önmagában nem oldja meg.
5. A `deploy/nginx.chocoleaf.conf.example` mintát igazítsd a jelenlegi szerverhez. A benne lévő `/var/www/chocoleaf` és tanúsítványútvonalak minták. A tanúsítványnak a `chocoleaf.hu` és `www.chocoleaf.hu` neveket is le kell fednie. Meglévő Nginx-beállítást ne írj felül ellenőrzés nélkül; aktiválás előtt `nginx -t` szükséges.

A minta a HTTP és a www nélküli címet a www-s HTTPS-címre irányítja. A `/api/` kérések a backendhez mennek, a többi alkalmazásútvonal az `index.html` fájlt kapja. Ez szükséges ahhoz, hogy például egy levélből közvetlenül megnyitott `/booking/manage` vagy `/admin/bookings` oldal is betöltsön.

## Átállítás utáni próba

- `https://www.chocoleaf.hu/api/health` JSON-választ adjon, ne HTML-t.
- A `/courses`, `/admin` és a levélből megnyitott aloldalak frissítés után is működjenek.
- A belépési süti HTTPS mellett Secure és HttpOnly legyen; a belépés és kijelentkezés működjön.
- Egy új próbafoglalás ügyfél- és adminlevelében a linkek a www-s domainre mutassanak; az átutalási adatokat és az utalvány-PDF-et is ellenőrizni kell.
- A Google-névjegyek visszairányítása, valamint használat esetén a naptárkapcsolat működjön.

A már eltárolt régi levelek szövegét a domainbeállítás nem írja át utólag. A korábbi sorban álló tesztleveleket az admin levélkezelőjében ellenőrizd még az éles küldés elindítása előtt. Az E02, az elavult fizetési levelek életciklusának javítása külön feladat; a domainátállítás nem oldja meg.
