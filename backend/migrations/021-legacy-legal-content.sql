-- Source: 3github_chocoleaf/chocoleaf/public/{impressum,privacy-policy,rendelesi-feltetelek,cookie-policy}.html
-- Import the original document text, without page scripts, styles or tracking.
-- Only missing, blank or exact unmodified local demo pages are replaced.
-- Existing administrator content is preserved. Internal links use current routes.

INSERT INTO content_pages(slug,title,body) VALUES('imprint','Impresszum',$legacy_imprint$A **ChocoLeaf – Kézműves Édességkészítés** weboldalt üzemelteti:

- **Név:** Braun Edit egyéni vállalkozó
- **Székhely:** 1039 Budapest, Huba utca 3.
- **Adószám:** 66578921-1-41
- **Nyilvántartási szám:** 36239682
- **FELIR:** AA6639194
- **Nyilvántartásba vevő hatóság:** Budapesti Kereskedelmi és Iparkamara
- **Telefon:** +36 20 373 4023
- **E-mail:** info@chocoleaf.hu
- **Weboldal:** [https://chocoleaf.hu](https://chocoleaf.hu)

## Felelős személy

Tartalomért felelős: **Braun Edit**, a ChocoLeaf márka tulajdonosa és üzemeltetője.

## Panaszkezelés és fogyasztóvédelem

Amennyiben panaszt kíván benyújtani szolgáltatásunkkal kapcsolatban, kérjük, írjon az **info@chocoleaf.hu** címre. Ha a panaszra adott válasz nem kielégítő, a fogyasztó a lakóhelye szerint illetékes **békéltető testülethez** fordulhat.

**Budapesti Békéltető Testület**
 1016 Budapest, Krisztina krt. 99. 
Web: [https://bekeltetes.hu](https://bekeltetes.hu)

## Szerzői jog

A weboldal teljes tartalma (szöveg, képek, logó, grafikai elemek) a ChocoLeaf tulajdona, és szerzői jogvédelem alatt áll. Az anyagok másolása, terjesztése vagy módosítása kizárólag a tulajdonos előzetes írásbeli engedélyével lehetséges.$legacy_imprint$)
ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body
WHERE btrim(content_pages.body)='' OR content_pages.body=$demo_imprint$BEMUTATÓ – TESZTTARTALOM

Ez az oldal a helyi ügyfélbemutató része. A végleges impresszum az éles indulás előtt kerül feltöltésre.

A bemutatóban Stripe-tesztfizetést használunk, tényleges terhelés és számlakiállítás nélkül. A tesztlevelek helyben tekinthetők meg.

Az oldal szövege az adminfelület Oldaltartalmak menüpontjában szerkeszthető.$demo_imprint$;

INSERT INTO content_pages(slug,title,body) VALUES('privacy','Adatkezelési tájékoztató',$legacy_privacy$A jelen adatkezelési tájékoztató célja, hogy ismertesse, hogyan kezeli a **ChocoLeaf – Kézműves Édességkészítés** (a továbbiakban: „Szolgáltató”) az Ön személyes adatait a [chocoleaf.hu](https://chocoleaf.hu) weboldalon keresztül.

## 1. Az adatkezelő adatai

- **Név:** Braun Edit egyéni vállalkozó
- **Székhely:** 1039 Budapest, Huba utca 3.
- **Telefon:** +36 20 373 4023
- **E-mail:** info@chocoleaf.hu

## 2. Az adatkezelés célja

A weboldalon található **ajánlatkérő űrlap** kitöltése során megadott személyes adatok (név, e-mail cím, telefonszám, termék-leírás) kizárólag a kapcsolatfelvétel és a kért ajánlat elkészítése céljából kerülnek felhasználásra.

## 3. A kezelt adatok köre

- Név
- E-mail cím
- Telefonszám
- A termék / kérés leírása
- Az üzenet elküldésének dátuma és IP-címe (FormSubmit rendszer által generált metaadat)

## 4. Az adatkezelés jogalapja

Az adatkezelés jogalapja az Ön **önkéntes hozzájárulása** (GDPR 6. cikk (1) bekezdés a) pont). Az adatok megadása nem kötelező, azonban a kapcsolatfelvételhez szükséges.

## 5. Az adatok megőrzésének ideje

Az ajánlatkéréssel kapcsolatos adatokat legfeljebb **6 hónapig** őrizzük meg, vagy addig, amíg az ügy lezárásra nem kerül, illetve Ön nem kéri az adatok törlését.

## 6. Adattovábbítás és adatfeldolgozók

A weboldalon használt űrlap a **FormSubmit** (formsubmit.co) szolgáltatón keresztül továbbítja az adatokat az info@chocoleaf.hu e-mail címre. A FormSubmit az üzeneteket nem tárolja tartósan, csak továbbítja.

Ezen kívül az oldal a [Cookie-tájékoztatóban](/legal/cookies) részletezett harmadik felek (pl. Barion, Cal.com) technikailag szükséges sütijeit alkalmazza, amelyek bizonyos esetekben adatátvitellel járhatnak.

## 7. Az érintettek jogai

Ön jogosult:

- tájékoztatást kérni az Önről kezelt adatokról,
- kérni azok helyesbítését vagy törlését,
- kérni az adatkezelés korlátozását,
- tiltakozni az adatkezelés ellen,
- hozzájárulását bármikor visszavonni.

Kérését e-mailben az **info@chocoleaf.hu** címen teheti meg, a kérelmet a lehető legrövidebb időn belül feldolgozzuk.

## 8. Panasz benyújtásának joga

Ha úgy érzi, hogy adatait jogellenesen kezeltük, panaszt tehet a **Nemzeti Adatvédelmi és Információszabadság Hatóságnál (NAIH)**.

**Cím:** 1055 Budapest, Falk Miksa utca 9-11. **Web:** [https://naih.hu](https://naih.hu) **Telefon:** +36 (1) 391-1400

## 9. A tájékoztató frissítése

Jelen adatkezelési tájékoztató 2025. október 1-jén lépett hatályba. A Szolgáltató fenntartja a jogot, hogy a tartalmát bármikor módosítsa, amelyről a weboldalon keresztül tájékoztatást nyújt.$legacy_privacy$)
ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body
WHERE btrim(content_pages.body)='' OR content_pages.body=$demo_privacy$BEMUTATÓ – TESZTTARTALOM

Ez az oldal a helyi ügyfélbemutató része. A végleges adatkezelési tájékoztató az éles indulás előtt kerül feltöltésre.

A bemutatóban Stripe-tesztfizetést használunk, tényleges terhelés és számlakiállítás nélkül. A tesztlevelek helyben tekinthetők meg.

Az oldal szövege az adminfelület Oldaltartalmak menüpontjában szerkeszthető.$demo_privacy$;

INSERT INTO content_pages(slug,title,body) VALUES('terms','Rendelési feltételek',$legacy_terms$A jelen rendelési feltételek a **ChocoLeaf – Kézműves Édességkészítés** szolgáltatásaira vonatkoznak, melyeket **Braun Edit egyéni vállalkozó** (székhely: 1039 Budapest, Huba utca 3., adószám: 66578921-1-41, e-mail: [info@chocoleaf.hu](mailto:info@chocoleaf.hu)) nyújt.

## 1. A rendelés menete

- Megrendelés leadható az ajánlatkérő űrlapon, e-mailben vagy telefonon.
- A rendelés beérkezését követően a Szolgáltató egyeztet a részletekről.
- Az egyedi termékek pontos ára az egyeztetés után kerül meghatározásra.
- Az ajánlat elfogadásával a megrendelés véglegessé válik.

### Workshopok

- A workshopokra a weboldalon elérhető foglalási rendszeren keresztül lehet jelentkezni.
- A foglalás a workshop teljes díjának kifizetésével válik véglegessé.

### Ajándékutalvány

- Lehetőség van névre szóló ajándékutalvány vásárlására.
- Az utalvány szólhat konkrét workshopra vagy meghatározott névértékre.
- Az Ajándékutalvány pénzre nem váltható át, visszatérítés nem kérhető.

## 2. Fizetési feltételek

- Fizetés előre Barionon keresztül vagy helyszínen készpénzzel / azonnali átutalással.
- A Barion rendszer biztonságos, bankkártya-adatokat a Szolgáltató nem kezeli.
- Előre fizetés esetén a rendelés a fizetés beérkezése után kerül visszaigazolásra.

## 3. Teljesítés és átvétel

- Az egyedi termékek elkészítési ideje minimum **7 nap**.
- A pontos átvételi időpont egyeztetés alapján történik.
- Az esetleges késedelemről a Szolgáltató időben értesít.

## 4. Lemondás és módosítás

### Édességek, torták

- 120 órával (5 nappal) korábban: díjmentes lemondás.
- 72–120 órával: a rendelés 50%-a felszámításra kerül.
- 72 órán belül: a rendelés értékének 100%-a fizetendő.

### Workshop

- 120 órával korábban: díjmentes, 100% visszatérítés.
- 72–120 órával: 50% visszatérítés.
- 72 órán belül: nincs visszatérítés.

### Ajándékutalvánnyal foglalt workshop

- Időpontmódosítás és lemondás 72 órával korábban 1 alkalommal lehetséges.
- 72 órán belül az utalvány beváltottnak minősül.

## 5. Minőség és reklamáció

- A termékek kézzel készülnek, kisebb eltérés előfordulhat.
- Reklamációt átvételt követően haladéktalanul kérjük jelezni.
- Indokolt esetben javítás, csere vagy részleges visszatérítés biztosított.

## 6. Fogyasztóvédelem és panaszkezelés

Panasz benyújtható a Szolgáltatónál ([info@chocoleaf.hu](mailto:info@chocoleaf.hu)), illetve az alábbi szerveknél:

- Budapesti Békéltető Testület – 1016 Budapest, Krisztina krt. 99.
- BFKH Fogyasztóvédelmi Osztály – 1033 Budapest, Harrer Pál u. 9–11.
- III. ker. Jegyző – 1033 Budapest, Fő tér 1.

## 7. Adatkezelés

A személyes adatok kezelése az [adatkezelési tájékoztató](/legal/privacy) szerint történik.

## 8. Egyéb rendelkezések

A Szolgáltató fenntartja a jogot a feltételek módosítására, amelyről a weboldalon ad tájékoztatást.

**Hatálybalépés dátuma: 2025. december 8.**$legacy_terms$)
ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body
WHERE btrim(content_pages.body)='' OR content_pages.body=$demo_terms$BEMUTATÓ – TESZTTARTALOM

Ez az oldal a helyi ügyfélbemutató része. A végleges rendelési feltételek az éles indulás előtt kerül feltöltésre.

A bemutatóban Stripe-tesztfizetést használunk, tényleges terhelés és számlakiállítás nélkül. A tesztlevelek helyben tekinthetők meg.

Az oldal szövege az adminfelület Oldaltartalmak menüpontjában szerkeszthető.$demo_terms$;

INSERT INTO content_pages(slug,title,body) VALUES('cookies','Sütik (cookie-k) kezelése',$legacy_cookies$Ez a tájékoztató a **ChocoLeaf – Kézműves Édességkészítés** weboldal ([chocoleaf.hu](https://chocoleaf.hu)) sütijeinek használatáról szól. Célja, hogy átláthatóan bemutassa, milyen típusú cookie-kat alkalmazunk, milyen célból, és hogyan tudja Ön kezelni a hozzájárulását.

## Mi az a süti (cookie)?

A cookie egy kis adatfájl, amelyet a weboldal helyez el a látogató eszközén. Segítségével az oldal megjegyzi bizonyos beállításokat vagy munkameneteket, így gördülékenyebbé válik a használat.

## A sütik típusai

### 1. Szükséges sütik

Ezek nélkül az oldal alapvető funkciói (pl. fizetés, időpontfoglalás, űrlapok) nem működnének, ezért nem tilthatók le.

| Név / Szolgáltató | Cél | Tárolás ideje |
| --- | --- | --- |
| **Barion Payment** – [barion.com](https://www.barion.com/hu/) | Biztonságos online fizetés feldolgozása és a tranzakciók hitelesítése | Munkamenet / 1 év |
| **Cal.com** – [cal.com](https://cal.com) | Időpontfoglalás kezelése, foglalásokhoz kapcsolódó session-süti | Munkamenet |
| **cookieConsent_basic_v1** – saját | A sütikre vonatkozó hozzájárulási beállítások tárolása | 6 hónap |

### 2. Analitikai sütik (hozzájárulás után)

Ezek segítenek megérteni, hogyan használják látogatóink az oldalt, hogy javíthassuk a felhasználói élményt. Csak akkor aktiváljuk őket, ha Ön elfogadta az „Analitika” kategóriát.

| Név / Szolgáltató | Cél | Tárolás ideje |
| --- | --- | --- |
| **Google Analytics 4** – [google.com](https://analytics.google.com) | Látogatottsági és használati statisztikák gyűjtése anonim módon | 2 év |

### 3. Marketing sütik (hozzájárulás után)

Ezekkel mérjük a hirdetések teljesítményét és a közösségi médiás kampányok hatékonyságát.

| Név / Szolgáltató | Cél | Tárolás ideje |
| --- | --- | --- |
| **Meta Pixel (Facebook)** – [facebook.com](https://facebook.com) | Hirdetési kampányok mérése és remarketing | 90 nap |

## Hozzájárulás kezelése

A weboldal első megnyitásakor megjelenő sütikezelő bannerben adhat engedélyt az egyes sütikategóriákra. A döntését bármikor módosíthatja az oldal alján található **„Süti-beállítások”** gomb segítségével.

## További információ

A sütik kezelése és törlése böngészőnként eltérő lehet. Az alábbi hivatkozásokon tájékozódhat:

- [Google Chrome](https://support.google.com/chrome/answer/95647)
- [Mozilla Firefox](https://support.mozilla.org/hu/kb/sutik-torlese)
- [Safari](https://support.apple.com/hu-hu/guide/safari/sfri11471/mac)
- [Edge](https://support.microsoft.com/hu-hu/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09)$legacy_cookies$)
ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,body=EXCLUDED.body
WHERE btrim(content_pages.body)='' OR content_pages.body=$demo_cookies$BEMUTATÓ – TESZTTARTALOM

Ez az oldal a helyi ügyfélbemutató része. A végleges sütik az éles indulás előtt kerül feltöltésre.

A bemutatóban Stripe-tesztfizetést használunk, tényleges terhelés és számlakiállítás nélkül. A tesztlevelek helyben tekinthetők meg.

Az oldal szövege az adminfelület Oldaltartalmak menüpontjában szerkeszthető.$demo_cookies$;
