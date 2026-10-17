# Google-naptár és iPhone – üzemeltetési útmutató

## Mit kap az admin?

Az adminban a **Telefonos naptár** menü `/admin/calendar-sync` útvonalon érhető el. Az Összekapcsolás Google-fiókkal gomb után Google-bejelentkezés és engedélyezés következik. A rendszer külön **ChocoLeaf kurzusok** naptárt készít. Egy kurzusalkalom egy esemény, például „Csokoládé workshop · 4/6 fő”. A címben a tényleges létszám szerepel, a leírásban a szabad helyek és a bizalmas token nélküli adminlink; megnyitásához adminbelépés kell. Személyes résztvevőadat, email, telefonszám és belső megjegyzés nem kerül a Google-eseménybe. Az események a naptár alapértelmezett emlékeztetőit használják.

Egy közös kapcsolt Google-fiók/naptár van az alkalmazáshoz. Az adminok ezt a kapcsolatot kezelik. A Google-ben a tulajdonos később megoszthatja a külön naptárt a kívánt személyekkel. Az alkalmazás nem hívja meg automatikusan a foglalókat vagy más felhasználókat.

## Egyszeri szerverbeállítás

Ez üzemeltetői feladat; a mindennapi adminnak nem kell API-kulcsot bemásolnia.

1. A vállalkozás Google Cloud projektjében engedélyezd a **Google Calendar API** szolgáltatást.
2. Állítsd be a Google Auth Platform hozzájárulási képernyőjét: alkalmazásnév, kapcsolattartó, valódi weboldal/adatkezelési oldal és jogosult domain. Saját Workspace esetén az internal alkalmazástípus is szóba jöhet. Külső felhasználókhoz external alkalmazás kell. A Google által előírt ellenőrzést/publikálást el kell végezni; tesztmód tartós üzemhez nem megfelelő, az engedélyek/refresh tokenek lejárhatnak.
3. Hozz létre egy **Web application** OAuth-klienst. Az engedélyezett redirect URI pontosan legyen például:
   `https://SAJAT-DOMAIN/api/calendar/google/callback`
   Ez a backend végpontja. Az `/api` reverse proxy továbbítása és HTTPS szükséges; SPA fallback nem nyelheti el. Azonos frontend/backend origin ajánlott a biztonságos sütik miatt.
4. A backend környezetében add meg:

```dotenv
FRONTEND_URL=https://SAJAT-DOMAIN
GOOGLE_CALENDAR_CLIENT_ID=...
GOOGLE_CALENDAR_CLIENT_SECRET=...
GOOGLE_CALENDAR_REDIRECT_URI=https://SAJAT-DOMAIN/api/calendar/google/callback
CALENDAR_TOKEN_KEY=...
NODE_ENV=production
```

A titkosítókulcs generálható Node-dal:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

A 64 hex karakteres kulcs titok. Mentsd a szerver titokkezelőjében, az adatbázismentés mellett külön védve; elvesztésekor új Google-összekapcsolás szükséges. Ne generáld újra minden telepítésnél. Google klienssecret és kulcs soha nem kerülhet a frontend buildbe vagy verziókezelésbe.

5. A csomag frissítése után `npm ci`, `npm run migrate`, majd indítsd újra a backendet. A `005-calendar-sync.sql` hozzáadó migráció, üzleti foglalásokat nem módosít.
6. Nyisd meg az admin Telefonos naptár oldalát, csatlakoztasd a választott fiókot, és várd meg a sikeres első frissítést. Ha a Google tesztfelhasználókat igényel, a bejelentkező fióknak szerepelnie kell a listában.

Kért OAuth-scope-ok:

- `calendar.app.created`: csak az alkalmazás által létrehozott naptárak/események kezelése.
- `calendar.calendarlist.readonly`: naptárlista olvasása, hogy megszakadt naptárlétrehozás után az alkalmazás megtalálja saját, azonosítóval jelölt naptárát, és ne hozzon létre másolatot. Személyes naptárak eseményeit nem olvassa.
- `userinfo.email`: a kapcsolt fiók egyértelmű megjelenítése és a véletlen fiókváltás megakadályozása.

OAuth: 10 perces egyszer használható state, PKCE, a kezdeményező érvényes adminmunkamenetéhez és külön HttpOnly/SameSite=Lax böngészősütihez kötve. A normál adminsession továbbra is SameSite=Strict. A refresh token AES-256-GCM titkosítással kerül az adatbázisba; sem tokent, sem authorization code-ot nem adunk vissza a státusz API-ban vagy hibanaplóban.

## Telefonos használat

- **Google Calendar / Android:** ugyanazzal a Google-fiókkal nyisd meg az alkalmazást; jelöld be a ChocoLeaf kurzusokat, és engedélyezd a szinkronizálását.
- **iPhone Naptár:** add hozzá ugyanazt a Google-fiókot a naptárfiókokhoz, engedélyezd a Naptár szinkronját, majd az alkalmazás naptárlistájában jelöld be a ChocoLeaf kurzusokat. Ez Google-naptár megjelenítése az Apple alkalmazásában, nem külön iCloud-másolat. Ha nem látszik, használd a Google hivatalos naptárszinkron-választóját/útmutatóját.
- A telefon helyi időzónája szerint jelenítheti meg az időpontot; az esemény forrásidőzónája Europe/Budapest. Téli/nyári időszámítást az abszolút időpont és IANA-időzóna kezeli.

## Frissítés, hibatűrés

A szerver induláskor, majd 15 másodpercenként egyeztet. Az első egyeztetés a jövőbeli és az elmúlt 30 nap aktív kurzusait is átküldi, üres alkalmakat is. Korábban átküldött régebbi események változásai szintén követhetők. Az aktív férőhelyösszeg minden `status <> 'cancelled'` foglalás `seats` mezőjéből származik, összhangban a meglévő üzleti logikával. Függő lemondási kérelem még nem szabadít férőhelyet.

A frissítési szándékok és Google-eseményazonosítók a `calendar_events` táblában maradnak meg. A worker a jelenlegi adatbázisállapotot egyezteti, ezért egy újraindítás vagy átmeneti hálózati hiba nem veszít el módosítást. Foglalás, jóváhagyott lemondás, átfoglalás, kapacitás/időpont/kurzusnév módosítása is új eseménytartalmat eredményez. Inaktív szolgáltatás/alkalom, illetve fizikailag törölt alkalom korábbi eseménye törlődik a külön Google-naptárból. Újraaktiváláskor új esemény készül.

Egy próbálkozási kör legfeljebb 30 eseményt küld, a munkát körülbelül 20 másodperc után megszakítja a következő körig. A HTTP-kérések 10 másodperc után időtúllépnek. Külön PostgreSQL advisory lock védi a párhuzamos szerverpéldányokat és az összekapcsolás/leválasztás műveleteit; a foglalási tranzakciók ettől függetlenül működnek. A stabil, küldés előtt adatbázisba mentett eseményazonosító kezeli az elfogadott, de elveszett HTTP-válaszok újrapróbálását. Naptárlétrehozás után a leírásban lévő saját marker segít helyreállítani a kapcsolatot, ha a válasz vagy a lokális mentés megszakadt.

Hibánál növekvő, véletlen eltéréssel kiegészített újrapróbálás történik, figyelembe véve a Google Retry-After jelzését. Visszavont/lejárt hitelesítésnél a szinkron megáll, és új összekapcsolást kér. A foglalásokat a Google-hiba nem vonja vissza. Az adminoldal mutatja a várakozó/hibás eseményeket és a frissítési időket; a Frissítés most újraellenőrzi az eseményeket. Ha a háttérfolyamat két percnél régebben ellenőrzött, a felület késést jelez.

A szerver figyelése 15 másodperces, de ez nem telefonos frissítési SLA. Google-hálózat, kvóta, sorhossz és a telefon alkalmazásának szinkronizálása is késleltethet. Felügyelethez figyeld a `calendar_connection.last_scan_at`, `last_error`, `next_attempt_at` és a `calendar_events` hibás/várakozó rekordjait. A háttérfolyamat folyamatosan futó Node szervert igényel; csak kérésenként ébredő tárhely esetén külön ütemezett worker szükséges.

## Szerkesztés és leválasztás

Egyirányú szinkron: a webes admin az elsődleges. A Google-ben kézzel átírt esemény nem módosítja a foglalást. Hatóránként teljes eseményegyeztetés történik, ami az ilyen eltéréseket felülírhatja; a Frissítés most ugyanezt kéri azonnal. Nincs Google-webhook vagy kétirányú foglalásmódosítás.

Leválasztáskor a tárolt refresh token törlődik, a szinkron leáll, a Google-ben lévő naptár és események megmaradnak. A felület ezt megerősítés előtt jelzi. A Google-fiók biztonsági oldalán a hozzáférés külön visszavonható. Ugyanazon fiók újracsatlakoztatása újrahasználja a saját naptárt. Másik fiókhoz előbb leválasztás kell; akkor új naptár készül, a régi fiók naptárát nem töröljük.

## Ellenőrzési határok

Automatizált integrációs tesztek valódi PostgreSQL-motoron (alapértelmezés: PGlite), szimulált Google HTTP-válaszokkal: adminvédelem, OAuth-state/PKCE/süti, tokentitkosítás, egyszeri callback, üres kurzusok, létszám/lemondás, időpont/kapacitás módosítás, tartós újrapróbálás, elveszett válasz, marker-alapú helyreállítás, törlés, visszavont hozzáférés, fiókváltás, leválasztás. Valódi többkapcsolatos PostgreSQL: `TEST_DATABASE_URL` mellett ugyanaz a tesztsor futtatható.

A csomaghoz nincs Google OAuth-kliens vagy valódi Google-fiók megadva. A teljes Google-bejelentkezés és iPhone-megjelenés ezért csak az éles konfiguráció után ellenőrizhető. Elfogadási próba: 0/6 → foglalás 2 főre → 2/6 → jóváhagyott lemondás → 0/6, majd időpont-áthelyezés és telefonos ellenőrzés. Ellenőrizd a visszavont engedély utáni újrakapcsolást is. A statikus online demó csak a valós demóadatokból képzett előnézetet mutatja, nem színlel valódi Google-kapcsolatot.

Hivatalos referenciák:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- https://support.google.com/calendar/answer/99358
