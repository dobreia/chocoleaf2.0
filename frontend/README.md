# ChocoLeaf frontend

A meglévő React/Vite alkalmazás továbbfejlesztett változata. Az archívumot `frontend` könyvtárba bontsd, a backend legyen mellette `backend` néven.

```sh
npm ci
npm run dev
```

A fejlesztői cím `http://localhost:5173`, az admin belépés `/admin`. A backend induljon a 3001-es porton. Alapértelmezett API-útvonal: `/api`, fejlesztésben Vite proxyval.

```sh
npm test
npm run lint
npm run build
```

A `dist` a statikus build. Éles tárhelyen SPA fallback szükséges az `index.html`-re, az `/api` útvonalat pedig a Node backendhez kell továbbítani. A backend nélkül a foglalás/admin nem működik; nincs beépített fake adatforrás. A `VITE_API_URL` buildidőben felülírható, de az admin sütikhez az azonos origin ajánlott.

A főoldal megjelenése és tartalma megmaradt. Az admin saját, a meglévő ChocoLeaf színvilághoz illeszkedő felületet kapott; a CSS-ek nem írják felül a főoldalt.

Részletes indítás, migráció, email/admin beállítás, üzleti szabályok és ellenőrzési korlátok: a backend csomag `README.hu.md` és `AUDIT.hu.md` fájlja.

A böngészős és mobilos vizuális ellenőrzést az elkészítési környezet blokkolta. A sikeres lint/build és backend integrációs tesztek mellett ezért saját böngészős elfogadási próba még szükséges.

Aktuális működés: nincs munkatárs-/nyitvatartás-kezelés és pénzügyi dashboard KPI. A napi naptár részletes foglalásokat, a heti/havi kurzusalkalmanként összesített férőhelyeket mutat. A CourseEventDetails résztvevőlistából egyedi foglalás szerkeszthető. A kurzusrészletező és utalványoldal új reszponzív elrendezést kapott (ExperiencePages.css). A SeatCount megőrzi a gépelés közbeni üres értéket. A szolgáltatásűrlap ImageUpload komponense valódi backendfeltöltést használ, az ImageAsset kezeli a képek megjelenítését. A 11 automatizált frontendteszt nem helyettesít böngészős vizuális próbát.

Telefonos naptár: `/admin/calendar-sync`, Google-összekapcsolás és szinkronállapot, valós kurzusadatokból készített előnézet, iPhone/Android útmutató. Backendbeállítás szükséges, lásd `CALENDAR-SYNC.hu.md` a backend csomagban. A Google-esemény adminlinkje a konkrét dátumot és kurzusrészletezőt nyitja meg.
