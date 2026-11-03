# Google Névjegyek és körlevélcímkék

## Megvalósítási terv és működés

Egyirányú szinkron: az ügyfelek és lefoglalt kurzusok forrása a ChocoLeaf.
A Google Névjegyekben az összesített és kurzusonkénti címkéket, valamint egy
menthető, több konkrét kurzusból összeállított körlevélcsoportot tartunk naprakészen.
Egy ügyfél az e-mail-címe alapján egyszer szerepel. A kiválasztott kurzusok között VAGY kapcsolat van.
A választó a szolgáltatások nevét és stabil azonosítóját használja, nem a kezdő/haladó
kategóriát. Egy kurzus különböző meghirdetett időpontjaira foglalók együtt szerepelnek.
Alapból a nem lemondott foglalások számítanak, a múltbeli kurzusok is;
a lemondottak bevonása külön kapcsolható. A törölt kurzus megőrzött előzménye is választható.

A Google-naptár kapcsolata, tokenjei és működése külön marad. A névjegyekhez csak
a contacts és userinfo.email engedélyt kérjük; Gmail-üzeneteket nem olvasunk és nem küldünk.
A Google contacts engedélye a teljes névjegyzékre szól: e-mail szerinti párosításhoz
a névjegyeket be kell olvasni. Ezeket nem másoljuk teljes egészükben az adatbázisba.
Helyben az ügyfél és a Google-erőforrás azonosítóját, a kívánt állapotot és hibákat tároljuk.
Az OAuth-frissítőtoken és a PKCE verifier AES-256-GCM titkosítással kerül az adatbázisba.

A szinkron percenként ellenőriz, egy körben legfeljebb 20 ügyfelet dolgoz fel,
a Google-írásokat sorosan végzi. Hatóránként teljes ellenőrzést is végez;
a „Frissítés most” gomb teljes ellenőrzést kér. Több szerverpéldány között PostgreSQL
advisory lock akadályozza a párhuzamos módosítást. A feladatállapot adatbázisban marad,
újraindítás után folytatható. A kurzus neve és azonosítója a foglalás végleges törlésekor is megmarad.
Kurzus átnevezésekor a címke is frissül, az azonosító és az elmentett választás megmarad.
Az `018-contacts-course-audience.sql` migráció megőrzi a Google-kapcsolatot, de a régi
kategóriaalapú választást üres kurzusválasztásra állítja: a konkrét kurzusokat újra ki kell jelölni.
A régi kategóriacímkéket nem törli, de a szinkron eltávolítja belőlük az alkalmazás ügyfeleit.

## Egyszeri Google Cloud-beállítás – ezt kell elvégezned

1. Nyisd meg a https://console.cloud.google.com/ oldalt. Használhatod a meglévő
   Google-naptár projektjét és webes OAuth-kliensét is.
2. Az APIs & Services → Library oldalon engedélyezd a **People API** szolgáltatást.
3. A Google Auth Platform / OAuth consent screen részen állítsd be az alkalmazás
   nevét, támogatási e-mailjét és célközönségét. Az engedélyekhez add hozzá:
   - `https://www.googleapis.com/auth/contacts`
   - `https://www.googleapis.com/auth/userinfo.email`
4. Tesztelési állapotban add hozzá a használni kívánt Google-fiókot a tesztfelhasználókhoz.
   Testing állapotban a névjegy-hozzáférés frissítőtokenje általában 7 nap után lejár;
   folyamatos éles működéshez a Cloud Console közzétételi/ellenőrzési lépéseit is el kell végezni.
   A szükséges ellenőrzés a Google projekt- és fiókbeállításaitól függ.
5. A Clients / Credentials oldalon **Web application** típusú OAuth-kliens kell.
   Az Authorized redirect URIs listába add hozzá pontosan:
   - helyben: `http://127.0.0.1:5174/api/contacts/google/callback`
   - élesben: `https://A-SAJAT-DOMAINED/api/contacts/google/callback`
   Az éles cím HTTPS legyen. A helyi cím egyezzen a ténylegesen megnyitott
   böngészőcímmel; localhost és 127.0.0.1 között ne váltogass a belépés során.
6. A `backend/.env.contacts.example` mintája alapján állítsd be a backend `.env` fájlját.
   A `.env` fájlt és a kulcsokat ne töltsd GitHubra.
   Ha a naptárhoz már van `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`
   és `CALENDAR_TOKEN_KEY`, a névjegyszinkron ezeket is tudja használni,
   de az új callback URL-t és a People API-t akkor is be kell állítani.
7. Új kulcsot például ezzel készíthetsz a saját terminálodban:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   A 64 hexadecimális karakteres értéket őrizd meg. A kulcs későbbi cseréje
   új Google-összekapcsolást igényel. A `.env.local-test` felülírhat `.env`-értékeket,
   ezért ha azt használod, annak beállításait is ellenőrizd.
8. Indítsd újra a backendet. A szokásos indítás futtatja az új migrációt és a háttérszinkront.
   Külön telepítési folyamat esetén: `npm run migrate`, majd a backend újraindítása.
9. Admin → **Körlevél / Google** → **Összekapcsolás Google-fiókkal**.
   Válaszd ki a megfelelő fiókot és engedélyezd a névjegyek kezelését.
10. Várd meg a **Naprakész** állapotot. A Google Névjegyekben ellenőrizd
    az első néhány ügyfelet és a ChocoLeaf-címkéket. Ez az első valódi fiókos próba;
    az automatizált tesztek szimulált Google-szolgáltatással működnek.

## Használat

- **ChocoLeaf – összes ügyfél**: a kiválasztott foglalási szabálynak megfelelő összes ügyfél.
- **ChocoLeaf – kurzus: …**: az adott nevű kurzus ügyfelei, minden meghirdetett időpontból.
- **ChocoLeaf – aktuális körlevél**: az adminban elmentett összes ügyfél vagy
  több kurzus egyesített címzettlistája, ismétlődő e-mail-címek nélkül.

Mentsd el a címzettcsoportot, várd meg a szinkron végét, majd Gmailben készíts levelet.
A Címzett mezőbe a saját címed, a Titkos másolat (Bcc) mezőbe a csoport kerüljön.
A Gmail az ekkor hozzáadott címzettekkel dolgozik; egy már nyitott levél nem veszi át
utólag a csoport változásait. Küldés előtt a csoportot szükség esetén add hozzá újra.
A Gmail saját napi és címzettszám-korlátai továbbra is érvényesek.

## Párosítás és adatmegőrzés

- Korábbi CSV-importból származó vagy személyes névjegyet pontos e-mail-egyezéssel kapcsolunk.
  A meglévő Google-névjegy nevét, telefonját és további adatait megőrizzük.
- A ChocoLeaf által létrehozott névjegyek nevének változása átkerül; csak a név mezőt frissítjük.
- Belső megjegyzés, telefonszám, számlázási adat nem kerül át az automatikus szinkronnal.
- Google-névjegyet vagy címkét nem törlünk. Ha egy ügyfél már nem tagja egy csoportnak,
  a ChocoLeaf által kezelt címkéből kivesszük; a névjegy és az egyéb címkék megmaradnak.
- Leválasztás leállítja az írásokat és törli a helyben tárolt frissítőtokent. A Google-oldali
  engedélyt a Google-fiókod biztonsági beállításaiban is visszavonhatod.
- Másik Google-fiókhoz először le kell választani az előző kapcsolatot. A régi fiók
  adatai megmaradnak; az új fiókhoz újra egyeztetjük a névjegyeket és címkéket.

## Hibák és teendők

- **redirect_uri_mismatch**: a Cloud Console-ban és a környezetben karakterre pontosan
  ugyanaz a callback URL kell. Ne legyen véletlenül más port, domain vagy záró perjel.
- **403 / hozzáférés megtagadva**: ellenőrizd a People API engedélyezését, az OAuth-tesztfelhasználót,
  és hogy az összekapcsolásnál megadtad-e a névjegy-hozzáférést.
- **Lejárt/visszavont hozzáférés**: a szinkron megáll; a Google-kapcsolat megújítása gombbal lépj be újra.
- **429, hálózati vagy szolgáltatói hiba**: növekvő várakozással, legfeljebb óránként,
  a Retry-After fejléc figyelembevételével újrapróbálunk. A foglalások ettől működnek.
- **Több azonos című névjegy**: egyesítsd a megfelelő névjegyeket a Google Névjegyekben,
  majd Frissítés most. Több e-mailes névjegynél az ügyfél címe legyen az alapértelmezett,
  különben a Gmail másik címre is címezhetne; ezt nem módosítjuk csendben.
- **Ütköző címkenév**: egy meglévő, nem a szinkron által létrehozott címke nem sajátítható ki.
  Nevezd át a régi címkét, majd kérj frissítést. Az importtal létrehozott sima „ChocoLeaf”
  címke nem ütközik az új „ChocoLeaf – …” nevekkel.
- **Bizonytalan létrehozás**: a People API nem fogad el saját idempotens névjegyazonosítót.
  Ha a Google fogadhatta a kérést, de elveszett a válasz, nem küldünk új létrehozást.
  E-mail és alkalmazásjelölő alapján újra keressük az eredményt; a Google listája késhet.
  Ha a létrehozás tényleg nem történt meg, kézi Google-oldali ellenőrzés után az adott
  hibánál engedélyezheted az új létrehozást. Ez szükséges ahhoz, hogy ne készítsünk vakon másolatokat.

## Források

- https://developers.google.com/people/v1/contacts
- https://developers.google.com/people/api/rest/v1/people.connections/list
- https://developers.google.com/people/api/rest/v1/contactGroups.members/modify
- https://developers.google.com/identity/protocols/oauth2
- https://support.google.com/contacts/answer/30970?hl=hu
