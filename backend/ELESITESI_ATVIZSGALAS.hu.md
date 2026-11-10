# Élesítési áttekintés – 2026. november 10.

## Döntési összefoglaló

A rendszer működő foglalási alkalmazás, nem pusztán bemutatófelület. Az átutalásos induláshoz nem szükséges előbb elkészíteni a Stripe-ot, a Billingót, a saját körlevélszerkesztőt vagy az összes hátralévő F-feladatot.

**A jelenlegi állapotban még nem javasolt nyilvánosan megnyitni a rendelést.** Előbb a függőségek biztonsági frissítése és az elavult fizetési levelek kezelése szükséges. Ezután az éles konfigurációt, mentést, tartalmat és egy valódi vásárlási próbát kell lezárni. Az átutalások és a számlák kezdetben kézzel is kezelhetők, kijelölt felelőssel.

A vizsgálat a helyi forrásra, tesztekre, csomagellenőrzésre és elszigetelt adatbázisos próbára terjedt ki. Nem kapcsolódtam az éles szerverhez, Google Cloud-fiókhoz vagy tényleges ügyfélpostafiókhoz. A szerveroldali üzemeltetési elemeket ezért ellenőrizendőként jelölöm, nem állítom, hogy a szerveren biztosan hiányoznak. Az alkalmazás működését ebben a felmérésben nem módosítottam.

Prioritások:

- **P0:** nyilvános rendelés előtt javítandó konkrét kockázat/hiba.
- **P1:** indulásig lezárandó üzleti, tartalmi vagy üzemeltetési feladat.
- **P2:** korai továbbfejlesztés, amely kezdetben kézzel vagy a meglévő felülettel kiváltható.
- **P3:** későbbi kényelmi, marketing- vagy skálázási fejlesztés.

## P0 – ténylegesen talált, javítandó problémák

### E01. Biztonsági frissítés kell az éles függőségekhez

A `npm audit --omit=dev --json` élő ellenőrzése a backendben **5 csomagbejegyzést** jelzett: 1 kritikus, 3 magas, 1 közepes besorolással. A frontendben 2 bejegyzés van: 1 magas és 1 közepes. Ezek csomagszintű jelzések, nem hét bizonyítottan kihasználható alkalmazáshiba.

| Terület | Telepített csomag | Találat | Teendő |
|---|---|---|---|
| Backend | `body-parser@2.2.2`, Expressen keresztül | Magas: tömörített kérés feldolgozása folyamatleállást okozhat | Express/függőséglánc ellenőrzött frissítése; az alkalmazás `express.json` feldolgozója előtt nincs ehhez külön védelem |
| Backend | `nodemailer@7.0.13` | Magas összesített csomagbesorolás, több környezetfüggő advisory | Támogatott, javított verzióra frissítés; az audit főverzióváltást is javasol, ezért SMTP-, HTML-, PDF- és naptár-MIME-teszt szükséges |
| Backend | `proxy-addr@2.0.7` | Kritikus besorolású, speciális proxy-alhálózat-beállítást érintő hiba | Frissítés és reverse-proxy-ellenőrzés. A jelenlegi `trust proxy = 1` nem az advisory hibás IPv6-alhálózatos példája; az itteni kihasználhatóságot nem igazoltam |
| Backend | `qs@6.15.2` | Közepes | Közvetett függőség frissítése az Express-lánccal együtt |
| Backend | `sharp@0.35.4` | Magas, Linux/librsvg környezetfüggő kockázat | Javított kiadás; feltöltés és WebP-konverzió újratesztelése. A feltöltés adminvédett, de a dekóder verzióját ettől még javítani kell |
| Frontend | `react-router@7.16.0`, `react-router-dom@7.16.0` | Magas/közepes csomagszintű jelzések | Javított Router-verzió, útvonalak és átirányítások próbája. A jelentések egy része Framework/RSC/SSR módra vonatkozik; ez a projekt `BrowserRouter` alapú, ezért nem mind alkalmazható közvetlenül |

Az ellenőrzés csak audit volt, `npm audit fix` vagy kényszerített főverziófrissítés nem történt. Frissítés után új audit és teljes regresszió kell, a lockfile-okkal együtt.

Elsődleges közlemények:

- [body-parser: tömörített kérés miatti DoS](https://github.com/advisories/GHSA-27r3-jxmh-p828)
- [proxy-addr: proxy-alhálózat és IP-meghamisítás](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)
- [sharp: librsvg-függőség](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- [React Router: a Framework módra korlátozott DoS-jelzés](https://github.com/advisories/GHSA-chx6-hx7r-mcp5)

### E02. Lemondás/fizetési változás után régi fizetési felszólítás maradhat a levélsorban

**Elszigetelt adatbázisos próbával igazolt hiba.** Létrehoztam egy átutalásos foglalást, küldés előtt lemondtam, majd megvizsgáltam a küldési sort. A foglalás már `cancelled`, de **2 korábbi, átutalási adatokat tartalmazó értesítés** továbbra is küldhető maradt: egy ügyfél- és egy adminlevél. Valódi levelet a próba nem küldött.

Forrás: `src/domain/notifications.js` – a normál levél a létrehozáskori szöveget/HTML-t tárolja; a küldő nem ellenőrzi újra a foglalás állapotát. `src/domain/bookingCalendar.js` az elavult naptárverziókat már kezeli, de ez nem vonatkozik a normál fizetési levelekre.

Hatás: SMTP-kimaradás után lemondott vagy már fizetett foglalásra is megérkezhet a korábbi fizetési felszólítás. Ez félrevezető fizetési helyzetet teremthet.

Teendő: a levelek kapjanak foglalás-/rendeléskapcsolatot és értesítéstípust/verziót; állapotváltás vagy küldés előtt az elavult fizetési kérések legyenek érvénytelenítve. A történeti előzmény és a ténylegesen küldendő levél különüljön el. Próba: létrehozás → SMTP-kimaradás → fizetés/lemondás/átfoglalás → helyreállás; csak az aktuális teendő menjen ki.

## P1 – az átutalásos induláshoz lezárandó feladatok

| Azonosító | Feladat | Mi látszik most? | Mikor tekinthető késznek? |
|---|---|---|---|
| E03 | Éles szerver és kiadási eljárás | Nincs verziókezelt Nginx/systemd/Docker/deploy-konfiguráció vagy CI/CD-folyamat a repóban | HTTPS-domain, statikus frontend build, SPA-visszaesés `index.html`-re, `/api` proxy, háttérben újrainduló backend; dokumentált frissítés és visszaállás |
| E04 | Éles konfiguráció ellenőrzése | Alapértelmezések több helyen localhostra esnek vissza; az általános backend `.env.example`, amelyet a README említ, hiányzik | `NODE_ENV=production`, valódi `FRONTEND_URL`, éles adatbázis, banki adatok, feladó/admin SMTP-címek, helyes proxybeállítás; a helyi tesztmód ne kerüljön élesbe |
| E05 | Mentés és helyreállítás | A repo nem tartalmaz automatizált mentési/visszaállítási eljárást | Ütemezett adatbázismentés, `backend/uploads`/`UPLOAD_DIR`, privát utalványok és Google titkosító kulcsok biztonságos mentése; visszatöltési próba külön környezetbe |
| E06 | PDF- és galériafájlok telepítése | A backend közvetlenül olvas a `frontend/public/assets` könyvtárból | A galéria, üres utalványsablon és betűkészletek a szerveren is az elvárt útvonalon maradjanak. A `frontend/dist` és backend önmagában nem elegendő minden funkcióhoz |
| E07 | Éles levélkézbesítés és felügyelet | HTML, PDF, hibaállapot, újrapróbálás és adminlista működik; éles kézbesítést a teszt nem igazol | Valódi doménről próba Gmailbe és más levelezőbe, feladóhitelesítés ellenőrzése, PDF/meghívó/módosítás/lemondás kipróbálása, felelős a hibás levelek napi ellenőrzésére |
| E08 | Végleges oldal- és jogi tartalmak | A szerkesztő kész, a valódi szöveget adatbázisból tölti; az éles adatbázis tartalma itt nem ellenőrzött | Impresszum, adatkezelés, rendelési és sütifeltételek tényleges tartalma; a foglalás/utalvány pénzügyi és lemondási szabályaival egyező szövegek |
| E09 | Rendelési feltételek megjelenítése és rögzítése | A kurzusfoglalási és utalványvásárlási formon nincs külön feltétel-elfogadási mező/verziónyilvántartás | Megállapodni az elfogadási folyamatban, azt az űrlapba építeni, a szükséges verziót/időpontot szerveroldalon rögzíteni. A kódellenőrzés nem helyettesíti a végleges tartalmak szakmai ellenőrzését |
| E10 | Utalványoldal szövegének összehangolása | A vásárlási oldal „Minden utalvány 1 fő részére szól” szöveget mutat, a beváltás értékalapú és többfős foglalásra is működik | A kommunikáció mondja ki az értékösszeget, a maradványegyenleg hiányát, a lejáratot és a teljes kód használatát; a PDF szövegét is össze kell olvasni a működéssel |
| E11 | Fizetetlen foglalások kezelési szabálya | A férőhely azonnal foglalttá válik, automatikus átutalási lejárat/felszabadítás nincs | Fizetési határidő, adminellenőrzés és felszabadítási folyamat. Kezdetben kézi is lehet, de legyen kijelölt felelőse; az automatikus változat az F17 része |
| E12 | Kézi számlázás indulási folyamata | Átutalásos rendeléskor és „Fizetve” állapotnál nem készül Billingo-számla | Ki, mikor és mely adatokból állítja ki/küldi a számlát; a céges számlázási cím használata. Ez nem várhat a Stripe indulásáig, az automatizálás viszont későbbre hagyható |
| E13 | Adatmegőrzés és külső szolgáltatások | Levelek, PDF-ek, megkeresések és ügyfélelőzmények automatikus megőrzési/takarítási szabály nélkül maradnak. A főoldali térkép és külső betűkészlet külön felhasználói kapcsoló nélkül töltődik | Adattípusonként megőrzési rend, hozzáférés/törlési kérelmek kezelése; a tényleges külső betöltések és a sütitájékoztató egyeztetése. A jelenlegi „Süti-információk” gomb csak felugró szöveg |
| E14 | Éles elfogadási próba | Automatizált tesztek és helyi böngészős folyamatok vannak | Telefonon és asztali böngészőben valódi rendelés → levél → utalás adminjelölése → visszaigazolás → naptár → módosítás/lemondás; mentésből visszaállítás és újraindítás utáni próba |

E03/E04/E05/E07 környezeti pontoknál a szerveren meglévő megoldás is elfogadható. Ellenőrizni és dokumentálni kell, nem feltétlenül mindent újra megépíteni.

## Részben kész vagy hiányzó funkciók

| Funkció | Tényleges állapot | Ajánlott besorolás |
|---|---|---|
| F10 – megkeresésállapotok | `new` és `handled`, külön olvasottsági mező; „folyamatban”, ajánlatküldési állapot/árajánlat-generátor nincs | P2, a jelenlegi két állapottal indulhat |
| F12 – köremail | Kurzusonkénti célzás, Google-címkék, címzett-előnézet és export működik. A levelet Gmailben írod meg; saját adminos kampányszerkesztő nincs | A választott Google-megoldás használható, a natív küldő P3 |
| Marketing-hozzájárulás/leiratkozás | A célcsoportot foglalási előzmény adja, nincs külön marketingpreferencia/tiltólista | Marketingküldés előtt P1: dönteni és rögzíteni, ki kerülhet körlevélbe és hogyan kérhet leiratkozást. Ez különbözik a tranzakciós értesítéstől |
| F17 – félbemaradt fizetés | A megőrzött Stripe-útban van fizetési lejárat és helyreállítás. Az aktuális átutalásos úton nincs 2/24 órás fizetési emlékeztető vagy automatikus lejárat | P2 automatizálás; az E11 kézi minimumfolyamata indulásig szükséges |
| F18 – manuális adminfoglalás | Már létezik és küld értesítést. Alapból függőben, manuális átutalásos rekord, számlázási adat és utalási referencia nélkül | Nem nulláról hiányzó funkció. P2: számlázási adatok, fizetési felhívás, utalványbevitel, létrehozási státusz kényelmes kezelése |
| F19 – megszüntetés | Adminlemondás és védett törlés, ügyfélnek tokenes, admin által jóváhagyandó lemondási kérelem működik | Alapja kész; külön „félbemaradt foglalás megszüntetése” folyamat és az F17-kapcsolat P2 |
| F20 – 72 órás emlékeztető | Nem találtam hozzá ütemezőt vagy küldési nyilvántartást. A naptármeghívó nem helyettesíti | P2, az első jövőbeli kurzusok előtt érdemes befejezni. Döntés kell a 72 órán belüli foglalásról és áthelyezésről |
| Stripe | A jelenlegi `provider()` mindig `transfer` értéket ad; a kártyás ág megőrzött és tesztelt, de éles használatra ezen a kiadáson nincs bekapcsolva | Külön kiadás; az átutalásos indulást nem kell miatta halasztani |
| Billingo | Kódja a Stripe-fizetésekhez van. A külön céges számlázási e-mail helyett jelenleg `order.email` kapja a számlát; előleg utáni végszámla nincs automatizálva | A bevezetéskor külön feladat; a címzettet, bizonylattípust és áfát előtte véglegesíteni kell |
| Stripe + utalvány | A backend kifejezetten elutasítja a Stripe-os utalványbeváltást | A Stripe bekapcsolása előtt kötelező befejezni, különben az F16 megszűnne azon az úton |
| Utalványegyenleg/promók | Részleges felhasználás, fennmaradó egyenleg, külön egyenlegoldal és promókód nincs | P3, a most jóváhagyott működés tudatosan kizárja |
| Utalványok adminállapota | Név, kód, érték, lejárat és felhasználás látható. Külön lejárathosszabbító/utalványletiltó kezelő nincs | P2, főként szervezői lemondás és lejárt utalvány esetére |
| Google-integrációk | OAuth, titkosított tokenek, háttérszinkron és hibakezelés kész | Éles HTTPS callback, saját fiók, jogosultságok és tartós hozzáférés ellenőrzése; nem a helyi kapcsolat átmásolása önmagában |
| Utalvány-/megkereséslisták | Legfeljebb 500 rekordot kérnek le; a megkeresés keresése ezen a listán kliensoldali | P2: szerveroldali keresés és lapozás, különben a régebbi sorok normál listában eltűnnek |
| Fizetések és számlák menü | Kifejezetten Stripe-rendeléseket listáz, nem az összes aktuális átutalást | P2: elnevezés/tájékoztatás igazítása vagy egységes pénzügyi lista |

## P2/P3 – technikai és felületi befejeznivalók

- **Metaadatok:** `frontend/index.html` címe még `frontend`, a dokumentum nyelve `en`. Nincs útvonalankénti cím/leírás, sitemap vagy robots fájl a `public` könyvtárban. Márkázás, magyar nyelv, keresőmegjelenés beállítása szükséges.
- **Hibafelügyelet:** adatbázis-health endpoint és adminos levélhiba van, külső elérhetőségfigyelő/riasztási beállítás nem látszik a repóban. Egy leállt backend nem fogja saját magáról időben értesíteni az admint.
- **Biztonsági üzemeltetés:** a jelszó hash-elt, a cookie HttpOnly, production alatt Secure, az adminvégpontok védettek. Kétfaktoros belépés és szerepkörkezelés nincs; kezdetben erős egyedi jelszó és dokumentált szerveroldali helyreállítás kell. A `createAdmin.js` már alkalmas jelszó-visszaállításra, tehát ez nem teljesen hiányzó képesség.
- **Spam/terhelésvédelem:** van IP-alapú korlát, de egy közös, folyamatmemóriás számláló. Több folyamatra nem közös, újraindításkor törlődik; a login és több publikus funkció egymás keretét is fogyaszthatja. Eltérő végpontokra hangolt korlát és proxyoldali védelem érdemes; a fizetetlen férőhelyfoglalás külön visszaélési felület.
- **Auditnapló:** nincs teljes „ki, mikor, milyen korábbi értékről mire módosított” adminnapló. Pénzbeérkezés, utalvány, lemondás, törlés esetén hasznos korai bővítés.
- **Megőrzés/tárhely:** képcsere után a régi feltöltés megmarad, PDF-ek és levélcsatolmányok is gyűlnek. Takarítás csak hivatkozásvizsgálattal, a megőrzési szabályokhoz igazítva történjen.
- **Nagyobb forgalom:** a `domain/store.js` minden domaintranzakciót ugyanazzal az advisory lockkal sorosít. Ez most védi az egyediséget, de lassú PDF-készítés alatt más módosítások is várhatnak. Kis induló oldalnál nem önmagában blokkoló; terhelési próba után célzott zárak/háttérfeldolgozás indokolt.
- **Valódi PostgreSQL-próba:** az alap tesztadapter egy PGlite-kapcsolatot sorosít. Van `TEST_DATABASE_URL` támogatás külön sémákkal; élesítés előtt dedikált valódi PostgreSQL-en is le kell futtatni a konkurens férőhely- és utalványpróbát.
- **Dokumentáció:** F13 dátumos formátumot ír, miközben a tényleges végleges kód `GIFT-XXXXXX-01`; F12/F18/F19 jelölése részben lemaradt a megvalósítás mögött. A README-ben régi tesztszámok, korábbi állapotok és hiányzó `.env.example` hivatkozás is maradt. Egyetlen aktuális élesítési leírás kell.
- **Automatikus kiadás:** a korábban felvetett „prod branch → automatikus weboldalfrissítés” nincs megvalósítva a repóban. Kézi, dokumentált telepítéssel el lehet indulni; automatizálás csak mentés, migráció és visszaállási rend után következzen.

## Mi működik már, és nem igényel újraírást?

Szolgáltatások és meghirdetések kezelése; többalkalmas csomagok; szerveroldali férőhely- és ütközésellenőrzés; átutalási oldal; kézi fizetési állapot; bizalmas foglaláskezelő link; jóváhagyott lemondás/átfoglalás; adminnaptár; ügyfélelőzmény és export; Gmail-válasz; dinamikus/egyéni utalványérték; rövid utalványkód és beváltási korlátok; PDF-küldés; formázott levél és levélsorkezelő; adminhitelesítés; Google-naptár és névjegyszinkron alapjai.

Az ellenőrzött statikus assethivatkozásoknál nem találtam hiányzó vagy csak kis-/nagybetűben eltérő útvonalat. Generált személyes PDF vagy valódi `.env` nem szerepel a jelenlegi követett fájlok között; a teljes Git-előzmény titokvizsgálatát ez nem helyettesíti.

## Javasolt lezárási sorrend

1. E01: biztonsági függőségfrissítés, utána teszt/audit.
2. E02: elavult fizetési levelek életciklusának javítása.
3. E08–E10: végleges tartalom, elfogadási folyamat, utalványkommunikáció.
4. E11–E12: átutalási határidő, napi admineljárás és kézi számlázás.
5. E03–E07: éles konfiguráció, fájlok, mentés, újraindulás és SMTP.
6. E13–E14: adatkezelési működés, éles vásárlási/mobilos próba, visszaállítás.
7. F20, majd F17: emlékeztetők és fizetéskövetés automatizálása.
8. Később Stripe/Billingo, marketingbővítések és automatikus kiadás.

## Ellenőrzési jegyzőkönyv

- Backend teljes megismételt futás: **149/149 sikeres**, `node --test --test-concurrency=1 --test-reporter=spec test/*.test.cjs`.
- Az első teljes futásban a `course-sessions.test.cjs` folyamat külön hibával állt meg. Önállóan 15/15 sikeres lett, majd a teljes, naplózott ismétlés is 149/149 sikeres. Forrásmódosítás nem kellett; ezt a futási ingadozást érdemes a későbbi CI-ben is figyelni.
- Frontend: **49/49 sikeres**, a teljes lint és a production build is sikeres.
- Utalványos böngészős próba: sikeres (valódi, elkülönített teszt-backenddel).
- Levélkezelési böngészős próba: sikeres; előnézet, biztonságos adminlink, újrapróbálás, megerősítéses törlés és szűrés.
- Függőségek: backend 5, frontend 2 auditált csomagbejegyzés; csak az éles függőségek (`--omit=dev`) ellenőrzése történt.
- E02 reprodukciója elszigetelt PGlite-adatbázison: lemondott foglalás után 2 elavult utalási értesítés maradt a sorban. Nem küldtem valódi levelet és nem módosítottam az éles/helyi ügyféladatbázist.
- Nincs ebben a vizsgálatban igazolt éles HTTPS/DNS/SMTP/Billingo/Stripe-fizetés, telefonos naptárpróba, visszatöltési próba vagy éles szerverterhelési mérés.

## Indulási ellenőrzőlista

- [ ] E01 függőségfrissítés és utóellenőrzés kész.
- [ ] E02 elavult fizetési levél javítva és próbával lefedve.
- [ ] Éles tartalmak, banki adatok és utalványfeltételek ellenőrizve.
- [ ] Fizetési határidő, napi adminellenőrzés és kézi számlázás rögzítve.
- [ ] Production konfiguráció, HTTPS, proxy, SPA-útvonalak és automatikus backend-újraindítás ellenőrizve.
- [ ] Galéria, PDF-sablon, fontok és tartós feltöltések telepítve.
- [ ] Mentés és külön környezetbe visszatöltés kipróbálva; előző kiadás visszaállítható.
- [ ] Valódi ügyfél- és adminlevél, PDF és naptármeghívó ellenőrizve.
- [ ] Többalkalmas és utalványos vásárlás, lemondás és szervezői lemondás mobilon is kipróbálva.
- [ ] Hibás levelek, beérkező megkeresések és függő fizetések napi felelőse megnevezve.

Az indulás feltétele a fenti minimum lezárása; a P2/P3 funkciók teljes befejezése nem előfeltétel.
