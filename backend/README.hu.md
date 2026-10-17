# ChocoLeaf – működés és indítás

## Helyi fejlesztői indítás

A backend mappában az `npm run local` indítja a teljes helyi környezetet. A weboldal címe **http://127.0.0.1:5174**, a kipróbálható időpontválasztóé **http://127.0.0.1:5174/idopont-minta**. A backend a 3002-es porton fut. A terminált hagyd nyitva; leállítás: Ctrl+C.

Az indító a külön helyi tesztadatbázisba szükség esetén teljes, a szolgáltatás alkalomszámának megfelelő mintakurzusokat hoz létre. A meglévő kurzusok időpontjait nem írja át. Az `npm run local:check` ellenőrzi az indítást, az adminbelépést és a helyi levélfogadót, majd leállítja az ellenőrzéshez indított szervereket.

## Többalkalmas kurzusmeghirdetések (F06)

Az admin a **Szolgáltatások** oldalon, a kurzus létrehozásakor vagy szerkesztésekor állítja be az **Alkalmak száma** mezőt (1–100); a **+ Új alkalom hozzáadása** gomb itt növeli az alkalomszámot. Az **Időpontok → + Új kurzusmeghirdetés** űrlapján a kurzus kiválasztása automatikusan létrehozza az összes szükséges dátummezőt. Új meghirdetésnél csak az egyes alkalmak kezdését kell megadni; a befejezést a szolgáltatás alkalmankénti időtartamából automatikusan számítjuk, és csak olvasható mezőben mutatjuk. A backend is kiszámítja a hiányzó befejezést. Az alkalmak nem adhatók hozzá vagy törölhetők. Meglévő meghirdetés szerkesztésekor a befejezések továbbra is külön módosíthatók, így az eltérő hosszúságú alkalmak is kezelhetők. Ugyanarra a napra is felvehető több, egymást nem átfedő alkalom. A megadott ár a teljes kurzus ára / fő, a férőhely és a foglalási státusz közös. A foglalás és a fizetés egyetlen csomagra történik.

A szolgáltatás alkalomszámának módosítása csak az új meghirdetésekre érvényes. A korábbi meghirdetések megtartják a saját alkalmaikat, az eltérő számú régi meghirdetések is szerkeszthetők. A foglalás vagy megkezdett fizetés miatti zárolást piros figyelmeztetés jelzi; ilyenkor a meghirdetés szolgáltatása sem cserélhető.

A vendégoldali foglalási naptárban a kurzus kezdőnapja választható; a további alkalmak nem önálló foglalási lehetőségek. A kártyák már kiválasztás előtt felsorolják a teljes csomag időpontjait, árát és férőhelyeit. Ha egy kezdőnapon egyetlen csomag indul, automatikusan kiválasztjuk; több csomag közül a vendég választ. A kiválasztott csomag összes napját közös kiemelés és alkalomsorszám jelzi. A másik hónapban lévő alkalom a „Mutasd a naptárban” gombbal megtekinthető, a kiválasztott csomag, az űrlap és a fizetési próbálkozás azonosítójának megtartásával, oldalfrissítés után is. Egy napra eső több alkalom sorszámai együtt jelennek meg. A hónaplapozó nyilak az adott hónapban induló kurzusok böngészésére szolgálnak.

A `/courses` listakártyákon és a kurzusrészletek tetején az oldal mályvás színeihez illő kiemelés jelzi a többalkalmas foglalást. A cím mindenhol egységesen „Ez egy Több alkalmas kurzus.”; a leírás: „Ez egy többalkalmas kurzus. A foglalással az összes alkalmat lefoglalod. Az ár a teljes kurzusra szól.” A megjelenést a foglalható meghirdetések alkalomszáma határozza meg, meghirdetés hiányában a szolgáltatás alkalomszáma. Egyalkalmas meghirdetésnél nincs ilyen jelzés.

Az első foglalás vagy fizetésindítás rögzíti az alkalmak számát. A még el nem kezdődött dátumok közösen menthető szerkesztőből külön módosíthatók, a résztvevők értesítésével. Az elkezdődött alkalom időpontja nem változtatható. A jelentkezés az első alkalom kezdetekor lezárul, az ügyféloldali lemondási és átfoglalási határidő az első alkalomhoz számítódik. Az átfoglalás azonos alkalomszámú, teljes kurzuscsomagra vonatkozik.

A `010-course-sessions.sql` migráció a meglévő időpontokból egyalkalmas meghirdetéseket készít, a foglalások és a Google-események kapcsolatának megtartásával. A `011-service-session-count.sql` hozzáadja a szolgáltatás alkalomszámát; alapértéke a szolgáltatás meglévő meghirdetései közül a legnagyobb alkalomszám, meghirdetés nélkül 1. A korábbi időpontokat és foglalásokat nem írja át. A backend induláskor lefuttatja a hiányzó migrációkat; külön is indítható: `npm run migrate`. A backend és a frontend együtt frissítendő.

Az időpontok forrása a `course_sessions` tábla; a `course_session_times` nézet a korábbi, közvetlenül importált egyalkalmas adatokat is kezeli. A `courses.start_time` az első kezdés, a `courses.end_time` az utolsó befejezés: ez az életciklus határa, az ütközéseket az egyes alkalmak tényleges időtartamával kell vizsgálni. Egy Google-szinkronfeladat egy `session_id`-hoz tartozik, a `course_id` a közös meghirdetésre mutat.

Az automatikus e-mail-emlékeztetők az F20 feladatai; az alkalmak külön időpontjai és azonosítói már rendelkezésre állnak a minden alkalom előtti küldéshez.

## Mit tartalmaz ez a változat?

A meglévő React 19 / Vite frontend és Express 5 / PostgreSQL backend továbbfejlesztése. A főoldal tartalma, képei, színei és szerkezete megmaradt. A főoldali űrlap saját API-ra került, a hibás linkek javítva, az oldalspecifikus CSS elkülönítve. A külön feltöltött courses.json a valódi szolgáltatáskatalógus kezdeti importja; nem generál foglalásokat vagy fiktív statisztikákat.

A két archívumot egymás melletti `backend` és `frontend` könyvtárba bontsd ki. Ez fontos: a galéria és az utalványgenerátor a frontend meglévő képeit, betűkészleteit és PDF-sablonját használja.

## Fejlesztői indítás

Követelmény: Node.js 24, npm és PostgreSQL 16 vagy újabb. A forráshoz lockfile tartozik.

1. Készíts egy `chocoleaf` PostgreSQL-adatbázist és hozzá megfelelő jogosultságú alkalmazásfelhasználót. Meglévő adatbázisnál először biztonsági mentésen vagy tesztmásolaton dolgozz.
2. A `backend/.env.example` másolata legyen `backend/.env`. Add meg a `DATABASE_URL` értékét. A régi `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` beállítás is támogatott, ha nincs `DATABASE_URL`.
3. A backend könyvtárában:

```sh
npm ci
npm run migrate
```

4. A backend `.env` fájljában add meg az `ADMIN_EMAIL` és `ADMIN_PASSWORD` értékét. A jelszó legyen legalább 12 karakter. Ezután:

```sh
npm run admin:create
npm start
```

Az admin létrehozása ugyanazzal az emaillel jelszó-visszaállításként is működik, és érvényteleníti az admin meglévő munkameneteit. Az `ADMIN_PASSWORD` értékét a létrehozás után el lehet távolítani a konfigurációból. Nincs alapértelmezett jelszó és nincs nyilvános adminregisztráció.

5. A frontend könyvtárában:

```sh
npm ci
npm run dev
```

A Vite `/api` kéréseit a `localhost:3001` backendnek továbbítja. A publikus oldal a `http://localhost:5173`, az admin a `/admin` útvonalon érhető el. Fejlesztésben a `FRONTEND_URL=http://localhost:5173` beállítás szükséges. A frontend alapértelmezett API-prefixe `/api`; szükség esetén a `VITE_API_URL` változóval állítható, majd új build szükséges.

## Első adminbeállítások

1. Szolgáltatások: ellenőrizd az importált szöveget, képet, árat, időtartamot és alap férőhelyet. A katalógusadatok csak egyszer kerülnek importálásra; újraindítás nem írja felül az admin módosításait.
2. Időpontok: hozz létre jövőbeli alkalmakat. A program nem talál ki időpontokat a naptárban. A korábbi seed hibás, egymást átfedő és múltbeli mintadátumait nem futtatja.
3. Oldaltartalmak: töltsd ki a vállalkozás tényleges impresszumát, adatkezelését, rendelési és sütifeltételeit. A feltöltött projektben ezek csak üres vázak voltak; az új verzió szerkeszthető adatbázisoldalakat ad, de a hiányzó jogi adatokat nem találja ki.
4. Állítsd be az emailküldést és a banki adatokat, majd végezz saját próbafoglalást és levélkézbesítési próbát.

## Foglalási szabályok

- `services`: stabil szolgáltatásazonosító, megnevezés, leírás, kategória, képek, alap időtartam, ár, férőhely és aktív állapot.
- `courses`: a meglévő tábla megmarad, egy rekord egy meghirdetett csoportos alkalom. A `service_id` köti a szolgáltatáshoz.
- `bookings`: egy ügyfél foglalása, több férőhely is kérhető. Az összeg az adott alkalom ára × létszám; admin később külön módosíthatja.
- Egy csoportos alkalomra több ügyfél foglalhat, a kapacitásig. Ez nem dupla foglalás. A lefoglalt helyek számítása `SUM(seats)`, nem a foglalási rekordok száma.
- Ugyanazon emailhez nem engedünk átfedő aktív foglalást. A névtelen, emailes modellben ez email-azonosságot jelent, nem személyazonosság-ellenőrzést.
- `pending`, `confirmed`, `completed`, `no-show` foglalás foglal férőhelyet. A `cancelled` nem. A teljesített/mulasztott állapot csak az alkalom vége után állítható be.
- A meghirdetett aktív alkalmak közös műhelyidőt foglalnak, egymást nem fedhetik. A korábban eltérő munkatársakkal felvett, egymást átfedő alkalmak megmaradnak, de új foglalást nem fogadnak, amíg az admin az Időpontok oldalon nem rendezi az ütközést.
- A foglalhatóságot a meghirdetett alkalmak adják, heti nyitvatartási korlátozás nincs. A korábban rögzített globális tiltások belső korlátként megmaradnak; a korábbi személyhez rendelt tiltásokat az alkalmazás figyelmen kívül hagyja.
- Inaktív szolgáltatásra/alkalomra és múltbeli kezdésre nem készül új foglalás. Kapacitás nem csökkenthető a lefoglalt helyek alá.
- Foglalásokkal rendelkező alkalom fizikailag nem törölhető. A szolgáltatás törlése inaktiválás. Foglalás végleg csak lemondott és nem „fizetve” állapotban törölhető; így a fizetett ügylet véletlen eltüntetése elkerülhető.
- Az alkalom kezdete/vége adminisztrátori űrlapon szerkeszthető; ez minden résztvevőjét érinti, és emailes értesítést sorba állít. Húzással vagy egérrel átméretezés nincs: csoportos foglalásoknál a pontos űrlapos módosítást használtuk.

## Emailes módosítás és lemondás

A foglalás ügyfélfiók nélkül működik. Foglalás után az adatbázisban tárolt emailküldési sorba kerül az ügyfél és az admin értesítése. Az új foglalás `pending`; az admin visszaigazolhatja.

A levél 256 bites, véletlen kezelési tokent tartalmaz. A foglalásrekordban csak a SHA-256 lenyomata szerepel. A link a böngésző URL-fragmentumában viszi a tokent, az API `X-Booking-Token` fejlécben kapja; ezért nem kerül a szokásos URL/access naplóba. A kezelési linket bizalmasan kell kezelni. A levélküldési sor szükségszerűen tartalmazza a kiküldendő levél teljes szövegét; ehhez csak az adatbázis üzemeltetője férjen hozzá.

A kezelési link az alkalom vége után 30 napig olvasható. Online módosítási/lemondási kérelem alapértelmezetten legalább 24 órával a kezdés előtt küldhető, a határidő az adminban állítható. Egy foglaláshoz egyszerre egy függő kérelem lehet.

Átfoglaláskor az eredeti foglalás az admin jóváhagyásáig megmarad. Az új helyet a kérelem nem foglalja le; jóváhagyáskor újra ellenőrizzük. Ha időközben betelt, a jóváhagyás hibával megáll és az eredeti foglalás megmarad. A lemondás is jóváhagyás után szabadítja fel a férőhelyet. Elfogadás/elutasítás emailt generál.

Az admin a foglalás részleteinél új kezelési linket küldhet régi, token nélküli foglaláshoz is. Ez érvényteleníti a korábbi linket. Az emailcím módosítása szintén új tokent generál.

## Email- és utalványbeállítás

SMTP-hez: `SMTP_HOST`, `SMTP_PORT`, opcionálisan `MAIL_USER`, `MAIL_PASS`, továbbá `MAIL_FROM`, `MAIL_ADMIN`. `SMTP_HOST` nélkül a korábbi Gmail/Nodemailer megoldás használható a `MAIL_USER` és `MAIL_PASS` értékével. A 465-ös port implicit TLS-t használ.

A foglalási értesítések és megkeresések tranzakcióban kerülnek az `outbox` táblába. Az alkalmazás 15 másodpercenként próbál küldeni, hibánál 5 perc múlva újrapróbálja. A dashboard jelzi a kézbesítésre váró levelek számát. A foglalás SMTP-hiba esetén is megmarad. A kézbesítés legalább egyszeri modell: SMTP-siker és adatbázis-commit közötti folyamatleállás esetén ismételt levél lehetséges.

Az utalványrendelések a `gift_orders` táblában maradnak meg. Átutalás jóváhagyása kizárólag bejelentkezett admin által, POST-kéréssel történik. A PDF-sablon és a korábbi generálási design megmarad. A generált, névre szóló PDF-ek a backend `private/vouchers` mappájába kerülnek, nem a publikus webes assets közé. A korábban mellékelt generált utalványmásolat nincs a publikus csomagban.

Banki adatok: `TRANSFER_BENEFICIARY`, `TRANSFER_BANK_NAME`, `TRANSFER_ACCOUNT`, `TRANSFER_IBAN`, `TRANSFER_SWIFT`. A korábban még be nem kötött Barion továbbra sem aktív fizetési lehetőség; nincs szimulált kártyás fizetés.

## Adatkonzisztencia és jogosultságok

A foglalást, átfoglalást, státusz-visszaállítást, alkalomszerkesztést és elérhetőségi változtatásokat közös PostgreSQL advisory tranzakciós zár sorosítja. A foglalási kapacitásellenőrzés és a mentés egy tranzakcióban történik, az érintett alkalom rekordzárolásával. Ez a jelenlegi méretű műhelyhez szándékosan konzervatív; nagyobb forgalomnál erőforrásonkénti zárolásra bontható. Külső rendszerek ne írják közvetlenül a foglalási táblákat a domainlogika megkerülésével.

Backendoldali inputellenőrzés és adatbázis-CHECK korlátok védik az alapadatokat. A CHECK-ek a régi rekordokat `NOT VALID` módon hagyják meg ellenőrzésre, az új írásokra viszont érvényesek. A migráció nem töröl vagy találomra javít korábbi foglalásokat.

Admin jelszó: sózott scrypt. Munkamenet: szerveroldali, tokenlenyomattal; 8 órás lejárat, HttpOnly + SameSite=Strict cookie. Éles környezetben `NODE_ENV=production` Secure sütit állít be, tehát HTTPS szükséges. A backend ellenőrzi az adminjogosultságot. Origin-ellenőrzés, korlátozott CORS, kérésméretkorlát és egyszerű alkalmazásonkénti/IP-alapú rate limit is van. Ez nem helyettesít egy többpéldányos éles rendszer központi rate limiterét.

## Élesítés

- A frontend `npm run build` kimenete a `dist`. A csomagban a forrás és a build is megtalálható.
- A frontend tárhelyen állíts be SPA fallbacket az `index.html`-re. Az API végpontokat ne irányítsd a frontend HTML-re.
- Az `/api` útvonal reverse proxyval menjen a folyamatosan futó Node backendhez. Célszerű ugyanazon publikus origint használni, hogy az admin sütik megfelelően működjenek. A sima statikus/PHP tárhely önmagában nem futtatja az Express szervert.
- A `FRONTEND_URL` a valódi frontend origin legyen, útvonal és záró perjel nélkül. Ez határozza meg a levelekben küldött linkek címét is.
- HTTPS mögött állítsd `NODE_ENV=production` értékre. Ha a backend kizárólag egy megbízható reverse proxy mögött érhető el, `TRUST_PROXY=1` teszi lehetővé a valódi kliens-IP használatát. Közvetlenül kitett backendnél maradjon 0.
- Adatbázis- és SMTP-titkokat ne tölts a frontendbe. Az eredeti feltöltött `.env` értékeit nem csomagoltuk tovább; `.env.example` mutatja a szükséges kulcsokat.
- Migráció előtt készíts adatbázismentést, majd tesztmásolaton ellenőrizd a korábbi foglalásokat, árakat és időpontokat.
- A 003-as migráció a korábbi, időzóna nélküli `courses.start_time/end_time` értékeket budapesti helyi időként értelmezi. Ha a valódi adatbázisod ilyen mezőkben UTC-adatot tárolt, a migráció futtatása előtt ezt a konkrét átalakítást igazítani kell. A feltöltés nem tartalmazott adatbázisdumpot.
- Ezután szükséges a teljes böngészős, mobilos próba és egy tényleges levélkézbesítési próba a saját emailfiókoddal.

## Ellenőrzések

```sh
# backend könyvtár
npm test
# frontend könyvtár
npm run lint
npm run build
```

A backend tesztjei alapértelmezésben elszigetelt PGlite adatbázison futnak. Ez valódi PostgreSQL-motor WASM-változata, nem előre gyártott API-válaszok halmaza. Az adapter egy kapcsolatot sorosít, ezért a párhuzamos HTTP-kérések tesztje önmagában nem igazolja a külön PostgreSQL-kapcsolatok/munkafolyamatok közötti zárviselkedést.

Valódi PostgreSQL-lel ugyanaz a tesztsor futtatható `TEST_DATABASE_URL` megadásával. A teszt saját, véletlen nevű sémát hoz létre és csak azt törli a végén; ettől függetlenül dedikált tesztadatbázist használj. Ebben a módban 12 kapcsolatos valódi pool teszteli az advisory és rekordzárakat.

37 integrációs teszt sikeresen lefutott az átadás előtti ellenőrzés során. Lefedés: login/logout, adminvédelem, Origin-védelem, migrációismétlés, szolgáltatás és alkalom létrehozása, átfedés, múltbeli időpont, kapacitás, több férőhely, idempotens újrapróbálás, kezelési token, jóváhagyásos módosítás és lemondás, keresés/lapozás/statisztika, párhuzamos kérések, eltávolított végpontok, használaton kívüli korábbi beállítások, közös időpontütközés, megkeresés, tartalomszerkesztés, utalványrendelés, tokenrotáció, adatbáziskorlát, SMTP-sor és PDF-küldés. SMTP-tesztek csak helyi levélfogadóhoz kapcsolódtak.

Böngészős vizuális/E2E és mobilos ellenőrzést a rendelkezésre álló környezet blokkolta. A valódi éles adatbázis, SMTP-fiók, DNS/HTTPS és a jogi tartalom nem volt elérhető a feltöltésben. Emiatt ezeket nem tekintjük igazoltan élesítésre késznek. Részletek: `AUDIT.hu.md`.

## Egyszerűsítés – 2026. szeptember 9.

A munkatárs- és nyitvatartás-kezelés oldala, navigációja és API-ja megszűnt. A meglévő adatbázis táblái és mezői adatmegőrzés miatt változatlanok; nincs romboló migráció. Új munkatárs-hozzárendelés nem készül, és a régi hozzárendelés nem befolyásolja a foglalhatóságot. A belső `settings.cancellation_hours` módosítási határidő megmarad (alapérték: 24 óra); ez nem nyitvatartás.

A dashboard öt foglalási mutatót mutat, pénzügyi összesítést nem kérdez le. Napi naptár: óránként csoportosított részletes kártyák. Heti és havi naptár: egy kurzusalkalom egy esemény, kurzusnévvel, kezdéssel és összesített létszám/kapacitás adattal. Havi nézetben két alkalom után további események jelzése jelenik meg. Kattintásra az alkalom résztvevőlistája, majd az egyes foglalások szerkesztője nyitható meg.

## Képfeltöltés és új oldalak – 2026. szeptember 13.

Az admin szolgáltatásűrlapjai gépről választott PNG/JPEG/WebP képet fogadnak, legfeljebb 5 MB mérettel és 16 millió pixellel. A backend valóban dekódolja és WebP formátumba alakítja a képet, legfeljebb 2400 pixeles oldallal. Az adatbázis csak az elérési utat tárolja. A feltöltés adminjogosultságot igényel; a képek publikusan olvashatók a /api/media útvonalon.

Az UPLOAD_DIR opcionális abszolút könyvtár; alapértelmezésben backend/uploads. Élesítéskor tartós, írható kötetre állítsd, és mentsd az adatbázissal együtt. Több backendpéldány közös tárolót igényel. A reverse proxy ezt az API-útvonalat is továbbítsa. Képcsere/eltávolítás a szolgáltatás hivatkozását módosítja; a régi fájlok megmaradnak más hivatkozások védelmében, automatikus takarítás nincs. A csomag nem tartalmaz felhasználói feltöltéseket.

A kurzusrészletező valós elérhetőségből mutatja a következő alkalmakat, férőhelyeket és a közvetlen foglalási linket. Az utalványoldal a meglévő átutalásos rendelésre épül. A létszám átmenetileg üres lehet gépelés közben, mentéskor pozitív egész és kapacitáskorlát szükséges. A frontend 11 automatizált tesztje a naptárat és létszámkezelést ellenőrzi. A backendtesztek képfeltöltést, cserét, hivatkozáseltávolítást és szerverújraindítás utáni olvasást is lefednek.

## Standard kapacitás – 2026. szeptember 15.
Az alap férőhely minden új szolgáltatásnál 6 fő. Az új alkalom a szolgáltatás férőhelyét örökli. A 004-es migráció egyszer beállítja a meglévő szolgáltatásokat és alkalmakat 6 főre; ha egy alkalomra ennél többen foglaltak aktívan, annak kapacitása a már lefoglalt létszám marad. Az admin később egyedileg módosíthatja a kapacitást.

## Telefonos Google-naptár – 2026. szeptember 15.
Az admin Telefonos naptár oldalán egyirányú Google-szinkron kapcsolható be, iPhone Naptárban is megjeleníthető külön kurzusnaptárral. A funkció egyszeri Google OAuth-szerverbeállítást igényel. Részletes beállítás, működés, újrapróbálás és üzemeltetés: **CALENDAR-SYNC.hu.md**. Az átadáskor 52 backend-integrációs teszt és 11 frontendteszt sikeres; a Google-válaszokat a tesztek szimulálják, valódi Google-fiókos és telefonos próba az éles kulcsok beállítása után szükséges.
# Stripe és Billingo

A bankkártyás fizetés és automatikus számlázás beállítása: [PAYMENTS.hu.md](PAYMENTS.hu.md). A konfigurációs minta: [.env.payments.example](.env.payments.example).

