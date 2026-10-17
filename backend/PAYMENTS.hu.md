# Stripe és Billingo

Gyors helyi próba Billingo-fiók nélkül: [LOCAL-TEST.hu.md](LOCAL-TEST.hu.md). A `HELYI-TESZT.cmd` indító külön tesztadatbázissal, 3002/5174 portokon és helyi levélfogadóval működik. Csak Stripe tesztkulcsot kell megadni; a Billingo-számlázást ez a tesztmód kihagyja.

A nyilvános foglalások és az ajándékutalványok kizárólag Stripe Checkout fizetést használnak. Nincs automatikus átutalásos visszaállás: hiányzó kulcsok esetén a fizetés nem indítható. A korábbi `PAYMENT_PROVIDER` változó már nem kapcsolja át a vásárlói folyamatot. A korábbi átutalásos rekordok kezelése megmarad.

Az adminfelületen kézzel létrehozott foglalások továbbra is manuális, átutalásos foglalások. A manuális és korábbi átutalásos foglalásokhoz ez a bekötés nem készít automatikus számlát.

## Beállítás

1. A `.env.payments.example` változóit add a backend `.env` fájljához. A titkos kulcsok kizárólag a backendbe kerüljenek.
2. Stripe tesztkulccsal kezdd (`sk_test_…`). A webhook URL: `https://SAJAT-API-DOMAIN/api/payments/webhook`. Események: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`. A végpont saját aláíró titka a `STRIPE_WEBHOOK_SECRET` (`whsec_…`). Helyben a Stripe CLI `stripe listen --forward-to localhost:3001/api/payments/webhook` parancsa használható a CLI által adott titokkal.
3. Billingo v3 API-kulcs szükséges partner létrehozási, dokumentum létrehozási, vendor-azonosítós lekérdezési és nyilvános számlalink lekérdezési jogosultsággal. A `BILLINGO_BLOCK_ID` a kiválasztott számlatömb azonosítója. Csak elkülönített Billingo tesztkörnyezethez/teszttömbhöz tartozó beállítással tesztelj: a Stripe tesztkulcs önmagában nem teszi tesztüzeművé a Billingót.
4. Állítsd be külön a foglalások és utalványok áfakulcsát és bizonylattípusát. Ezeknek nincs alapértékük: a számlázási besorolást a vállalkozás könyvelési beállításai alapján kell megadni. Támogatott típus: `invoice` vagy `advance`. Előlegszámla választásakor a későbbi végszámla elkészítése külön feladat; ezt a rendszer nem automatizálja. A fizetés napja (Europe/Budapest) kerül teljesítési és esedékességi dátumként a bizonylatra. Ezt a modellt bevezetés előtt ellenőrizni kell a választott bizonylattípussal és az utalványok kezelésével együtt.
5. A `FRONTEND_URL` első címe legyen a vásárlói oldal valódi címe. Állítsd be a meglévő SMTP-változókat az emailküldéshez, és az utalvány PDF sablonját a meglévő README szerint.
6. `npm install`, majd `npm run migrate` és `npm start`. A szerver induláskor is futtatja a migrációkat. A 006-os migráció önálló fizetési táblát ad hozzá; a 007-es a foglalás előtti fizetési előkészítést vezeti be. A korábban mentett foglalásokat megőrzi.

## Működés és helyreállítás

- A szerver rögzíti az összeget és a számlázási adatokat, majd egy folytatható fizetési oldalra irányít. A Checkout HUF összege a forintérték százszorosa.
- Foglalás előtt kizárólag a `payment_orders` táblába kerül fizetési előkészítés és ideiglenes helytartás. Nem jön létre `bookings` rekord, kezelési link vagy foglalási email. A helytartás csökkenti a szabad kapacitást, de nem jelenik meg foglalásként vagy résztvevőként az adminlistában és a naptárszinkronban.
- Igazolt sikeres fizetéskor egyetlen adatbázis-tranzakció hozza létre a fizetett foglalást, kapcsolja össze a fizetéssel, és ütemezi a kezelési linket tartalmazó visszaigazolást. Az ismételt Stripe-esemény nem hoz létre második foglalást. Sikertelen/megszakított fizetésből nem lesz foglalás; a helytartás a Checkout igazolt lejáratakor szabadul fel.
- A visszairányítás önmagában nem jelent sikeres fizetést. Csak ellenőrzött Stripe-esemény vagy szerveroldali Stripe-lekérdezés állítja fizetettre a rendelést. A foglalás adminisztrátori visszaigazolási folyamata megmarad.
- A Checkout létrehozása stabil idempotenciakulcsot használ. Az ismételt webhook nem küld új fizetési értesítést, és nem indít második számlát.
- A 15 másodpercenként ébredő háttérfolyamat ellenőrzi a függő fizetéseket, elkészíti a számlákat és kiküldi az utalványokat. Több backendpéldánynál PostgreSQL advisory lock védi a számlázási munkát. A tényleges újrapróbálkozás hibánál 5 perc.
- A fizetésre kb. 30 perc áll rendelkezésre. Az elhagyott Checkout Stripe által igazolt lejárata felszabadítja a foglalást. Ha a Checkout létrehozásának válasza elveszett, a rendszer a Stripe-munkamenetek között is ellenőriz, mielőtt felszabadítaná a helyet. Stripe-elérési hiba esetén tovább tartja a helyet az egyeztetésig.
- A Billingo `vendor_id` értéke `chocoleaf-<payment UUID>`. Az újrapróbálkozás először ezt keresi vissza, így egy elveszett számlakiállítási válasz után is a már létrejött számlával folytatja. A számlalink emailje a meglévő tartós outboxba kerül.
- Az admin **Fizetések és számlák** oldalán látható az állapot és a hiba, elérhető a számla, és ütemezhető újrapróbálkozás. A fizetési és kezelési linkek bizalmasak.
- A jelenlegi SMTP-küldés legalább egyszeri kézbesítést valósít meg: ha a folyamat az SMTP-elfogadás után, a helyi visszaigazolás mentése előtt áll le, az email ismételten megérkezhet. A PDF-utalványok sorszáma ilyenkor is azonos.
- A Stripe-visszatérítést és a Billingo sztornó/helyesbítő számlát jelenleg a szolgáltatói felületeken kell kezelni. A foglalás lemondása nem indít automatikus visszatérítést. A helyi fizetési tábla a sikeres eredeti fizetést követi; a visszatérítések szinkronizálása nem része ennek a bekötésnek.
- Magyarországi számlázási cím támogatott. Céges vásárlásnál magyar adószám szükséges.

## Ellenőrzés

`npm test` a backendben; `npm run build`, `npm run lint` és `npm test` a frontendben. A fizetési tesztek izolált PostgreSQL-motorral és helyettesített Stripe/Billingo válaszokkal futnak, nem terhelnek bankkártyát és nem állítanak ki valódi számlát. Élesítés előtt saját tesztfiókkal szükséges egy foglalást és egy utalványt végigpróbálni, valamint megszakítást, lejáratot és ismételt webhook-küldést ellenőrizni.

Források: [Stripe Checkout teljesítés](https://docs.stripe.com/checkout/fulfillment), [Stripe HUF-kezelés](https://docs.stripe.com/currencies), [Billingo hivatalos OpenAPI](https://api.swaggerhub.com/apis/Billingo/Billingo/3.0.14). A letöltött hivatalos séma: `billingo-openapi.json`.
