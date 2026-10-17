# Felmérés és átadási állapot

## Kiinduló állapot

A feltöltés két forráscsomagot és egy ötelemes szolgáltatáskatalógust tartalmazott. Adatbázisdump nem volt. A frontend React 19, React Router 7, Bootstrap 5, Vite 8 alapú. A backend Express 5 és `pg`, a meglévő utalványgenerátor `pdf-lib` + `fontkit`, a levelezés Nodemailer.

A forrásban az admin API-k autentikáció nélkül működtek. A foglalás csak létrehozható volt, adminban csak három foglalási és négy fizetési státusz volt állítható. A foglalási limit rekordszámot, nem férőhelyet számolt. A státusz-visszaállítás és kapacitáscsökkentés megkerülte az ütközésvizsgálatot. Nem volt foglalási email, bizalmas kezelési link, admin dashboard, közös naptár, nyitvatartás, munkatárs- és ügyfélkezelés. Több publikus oldal csak fejlesztői placeholder szöveget tartalmazott. A főoldalon több elavult útvonal és külső formsubmit űrlap szerepelt. Az utalványok memóriában tárolt rendelésadatai elvesztek újraindításkor; a fizetési jóváhagyás GET + közös URL-token kombinációt használt. Egy generált személyes utalvány a publikus assets közt volt.

## Oldalak

| Útvonal | Állapot / működés |
|---|---|
| `/` | Eredeti főoldal megőrizve; működő saját ajánlatkérő API, hibás linkek javítva, CSS elkülönítve |
| `/courses` | Valódi szolgáltatáskatalógus, képek, időtartam és ár |
| `/courses/:id` | API-s részletes oldal a feltöltött tartalommal |
| `/courses/:id/book` | Naptár, valódi férőhelyek, létszám, összeg, validáció, siker/hiba állapot |
| `/booking/manage#…` | Bizalmas emailes foglaláskezelés, módosítási/lemondási kérelem |
| `/gallery` | A meglévő képek valódi fájlrendszeres listája |
| `/about` | A főoldal meglévő bemutatkozó szövegének felhasználása |
| `/contact`, `/quote-request` | Saját API, adatbázisban megmaradó megkeresések |
| `/giftcard`, `/giftcards` | Meglévő ajándékutalvány-folyamat, tartós rendelési adatok |
| `/transfer`, `/transfer.html` | Beállított banki adatok és utalási közlemény |
| `/legal/*` | Működő adatbázisoldalak és admin szerkesztő; a tényleges hiányzó szöveget az üzemeltető adja meg |
| `/admin` | Szerveroldali login, valós dashboard, következő foglalások, email-sor állapota |
| `/admin/calendar` | Nap/hét/hónap, foglalás részletei és szerkesztése |
| `/admin/bookings` | Létrehozás, részletek, státusz, ár/fizetés, átfoglalás, lemondás, védett törlés, kérelmek |
| `/admin/services` | Szolgáltatás-CRUD, inaktiválás, katalógusadatok |
| `/admin/courses`, `/admin/courses/:id` | Alkalmak kezelése, időtartam, kapacitás |
| `/admin/customers` | Foglalásokból képzett ügyféllista, keresés, név/telefon módosítás |
| `/admin/inquiries` | Beküldött megkeresések és kezelt státusz |
| `/admin/content` | Impresszum, adatkezelés, rendelési és sütifeltételek szerkesztése |
| `/admin/giftcards` | Utalványrendelések, védett fizetési jóváhagyás és PDF-email |
| Régi `/idopont`, `/privacy-policy`, `/impressum`, `/rendelesi-feltetelek`, `/cookie-policy` | Átirányítás a megfelelő jelenlegi oldalra |

## Megőrzött bővíthetőség

A meglévő alkalom- és foglalásazonosítók nem változnak. A szolgáltatás külön azonosítót kap, ezért a későbbi átnevezés nem bontja szét az alkalmak csoportját. Az alkalmak egy közös műhely időrendjét használják. A régi munkatárs-hozzárendelések csak történeti adatként maradnak meg. A frontend egy közös API-klienst, külön admin komponenseket és külön formázási segédmodult használ. A backend domainrétege külön kezeli a tranzakciókat, foglalásokat, elérhetőséget, szolgáltatásokat, hitelesítést és értesítéseket.

## Megmaradó, ténylegesen külső feltételek

- A hiányzó jogi szöveg és vállalkozási adatok feltöltése.
- A valódi adatbázisséma/időzónák és korábbi foglalások ellenőrzése a migráció előtt. A régi időpontütközéseket nem töröltük találomra.
- Saját SMTP- és átutalási beállítások, admin létrehozása, HTTPS és reverse proxy.
- Valódi többkapcsolatos PostgreSQL-próba és teljes böngészős/mobilos elfogadási teszt. Az itt futtatott PGlite teszt és build ezt nem helyettesíti.
- Nincs aktív Barion-integráció: ennek valódi szolgáltatói bekötése az eredeti projektből is hiányzott, és nem készült helyette fake fizetés.
- Nincs drag/resize a naptárban. A csoportos alkalom pontos kezdési/befejezési ideje az Időpontok adminoldalon módosítható, a résztvevők értesítésével.
- Emailküldés SMTP-commit határesetben megismétlődhet. Többpéldányos/nagy forgalmú üzemeltetésnél központi rate limiting és részletes auditnapló további indokolt bővítés.

A végső assetellenőrzés három hiányzó főoldali képet talált (`line.png`, `line2.png`, `logo_horizontal_full.png`). A lábléclogó a meglévő `logo.png` képet használja, a két hiányzó dekoratív elválasztót egyszerű, márkaszínű CSS-elválasztó pótolja.


A szeptember 9-i kiegészítés felülírja a korábbi funkciólistát: nincs munkatárs- és nyitvatartás-kezelés, a dashboard nem tartalmaz pénzügyi KPI-t. A naptár nézetei külön részletességűek. Az eredeti audit bevezetője a feltöltött kiinduló állapotot dokumentálja.
