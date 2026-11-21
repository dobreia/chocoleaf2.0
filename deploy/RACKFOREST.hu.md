# RackForest – telepítési állapot, 2026. november 12.

**Aktuális állapot: a tulajdonos újabb kérésére az új rendszer ismét éles a `https://www.chocoleaf.hu` címen.** A www nélküli domain a www-s HTTPS-címre irányít. A `chocoleaf.service` fut, automatikus indulása engedélyezett. Az újraélesítés előtt friss mentés készült: `/root/chocoleaf-atvitel/ujraelesites-t3ej3uZX`. A frontend, az API, az adminvédelem és az átirányítás ellenőrzése sikeres.

A helyi adatbázisból 5 szolgáltatás, 6 meghirdetett kurzus és 2 admin került át, a meglévő adminjelszavakkal. A korábbi visszakapcsoláskor az új adatbázisban 1 foglalás és 0 utalványrendelés volt; ezek megmaradtak. Az akkori mentés: `/root/chocoleaf-atvitel/visszakapcsolas-RH2FTqwJ/chocoleaf-uj.dump`. Egyik domaincsere sem írt felül adatbázist. A köztes leállítás alatt az új rendszer levél- és szinkronfolyamatai nem futottak; most a normál alkalmazásfolyamat részeként ismét működnek.

## Hol fut?

- Alkalmazás: `/var/www/chocoleaf2`, backend: `backend`, frontend: `frontend/dist`.
- Node.js: `/opt/chocoleaf-node24/bin/node`, verzió: 24.22.3. A régi rendszer Node.js-verziója változatlan.
- Systemd: `chocoleaf.service`, jelenleg **active / enabled**. A külön `chocoleaf` rendszerfelhasználóval fut, hiba utáni újraindulással.
- Az új backend kizárólag `127.0.0.1:3001` címen figyel. A fődomain aktív Nginx-konfigurációja az új frontendhez és ehhez a backendhez irányít. A telepített konfiguráció megőrzött példánya: `/root/chocoleaf-atvitel/chocoleaf.hu.nginx`.
- PostgreSQL 18.6: `18/main`, kizárólag helyi elérés, port: **5433**. Adatbázis és szerepkör: `chocoleaf`. A korábban telepített, üres PostgreSQL 14-es példány az 5432-es porton maradt; az új alkalmazás azt nem használja.
- Érzékeny beállítások: `/var/www/chocoleaf2/backend/.env`, kizárólag a futtató felhasználó és root számára. Nincs a Gitben vagy a nyilvános frontendkönyvtárban.
- Feltöltések: `/var/www/chocoleaf2/backend/uploads`; privát utalvány-PDF-ek: `/var/www/chocoleaf2/backend/private/vouchers`.
- Aktív fődomain-konfiguráció: `/etc/nginx/sites-available/chocoleaf.hu`.

Az UFW aktív, kívülről az SSH és a Nginx portjait engedi. Az új backend és az adatbázis helyi címre kötött. A szolgáltatás fájlrendszere nagyrészt csak olvasható; az alkalmazás saját feltöltéseihez, privát PDF-jeihez és saját munkakönyvtárához van írási hozzáférése.

## Az új rendszer élesítésekor ellenőrzött működés

Sikeres volt a valódi HTTPS-en kiszolgált frontend, az aloldalak közvetlen megnyitása, a JavaScript/CSS-kiszolgálás, az API és a PostgreSQL kapcsolata. Az API visszaadja az 5 szolgáltatást és a 6 időpontot. Az admin API belépés nélkül 401-et ad. A kérésforrás-ellenőrzés és a Secure/HttpOnly/SameSite=Strict munkamenetsüti ellenőrzése sikeres. Az éles függőségek auditja 0 ismert sérülékenységet jelzett.

Az újraélesítéskor a nyilvános HTTPS-ellenőrzés ismét sikeres volt: a főoldal és az aloldalak, a statikus fájlok, az API, az 5 szolgáltatás, a 6 időpont, a belépés nélkül védett admin API és a www-s átirányítás rendben működött. A két rendszer adatai továbbra sem szinkronizálódnak automatikusan.

Az SMTP-kapcsolat és hitelesítés a szerverről is sikeres, tényleges levélküldés nélkül. A teljes új vásárlás–utalás–adminjóváhagyás folyamat első valódi rendelését továbbra is ellenőrizni kell. A Google-fiók új HTTPS-callbackjének engedélyezése a Google Cloudban szükséges, ha a névjegy-/naptárszinkront használjátok; ez külön külső fiókbeállítás.

## A képfeldolgozó szerverhez illesztett változata

A VPS processzora nem támogatja a Sharp előre fordított Linux x64 csomagjának szükséges utasításait. A javított **Sharp 0.35.5** megmaradt, a **libvips 8.18.7** és a Node-kiegészítő forrásból lett lefordítva a géphez. JPEG, PNG és WebP feldolgozása és az utalvány-PDF előállítása sikeres volt.

- Saját libvips: `/opt/chocoleaf-libvips`.
- A szolgáltatás `LD_LIBRARY_PATH` értéke: `/opt/chocoleaf-libvips/lib`.
- Az elkészült natív modul megőrzött példánya: `/var/lib/chocoleaf/native/sharp-linux-x64-0.35.5.node`.
- A fordítási források és naplók: `/root/chocoleaf-atvitel/native-build`.

**Az `npm ci` törli a node_modules könyvtárat, ezért utána a natív modult is vissza kell telepíteni.** Változatlan Sharp-verzió és ugyanaz a gép esetén rootként, a függőségek telepítése után:

```bash
install -d -o chocoleaf -g chocoleaf -m 700 /var/www/chocoleaf2/backend/node_modules/sharp/src/build/Release
install -o chocoleaf -g chocoleaf -m 600 /var/lib/chocoleaf/native/sharp-linux-x64-0.35.5.node /var/www/chocoleaf2/backend/node_modules/sharp/src/build/Release/sharp-linux-x64-0.35.5.node
```

Sharp-/libvips-verzióváltásnál a régi binárist nem szabad visszamásolni: új fordítás és képfeldolgozási próba szükséges. A sikertelen WebAssembly-próba csomagjai kikerültek; a tényleges runtime függőségei az eredeti lockfile alapján, tiszta `npm ci` telepítéssel kerültek fel.

## Felügyelet és mentések

```bash
systemctl status chocoleaf.service --no-pager
journalctl -u chocoleaf.service -n 50 --no-pager
curl -fsS https://www.chocoleaf.hu/api/health
```

Az átállítás előtti fájl- és adatbázismentések: `/root/chocoleaf-atvitel/atallitas-elott`. A helyi adatbázis eredeti mentése és a feltöltött alkalmazáscsomag is a privát `/root/chocoleaf-atvitel` könyvtárban maradt. Ezek titkokat/személyes adatokat is tartalmaznak, ezért nem szabad nyilvános webkönyvtárba másolni őket.

Ez egyszeri telepítési mentés, nem ütemezett, külső helyre is másolt biztonsági mentés. A következő frissítés előtt új adatbázis- és fájlmentés szükséges; a folyamatos mentési rend külön üzemeltetési feladat.

## Régi rendszer és visszaállítás

A régi alkalmazás változatlanul megmaradt a `/var/www/transfer` könyvtárban, a korábbi PM2-folyamattal a 3000-es porton. A `transfer.chocoleaf.hu` régi konfigurációja sem változott. A régi rendszer átutalási rendelései memóriában voltak; ezért a régi PM2-folyamatot az átállítás nem indította újra és nem állította le.

A régi szerveren talált 8 PDF-ből 4-et a tulajdonos tesztként azonosított. A másik 4 valódi; a PDF-ek szerinti lejáratuk 2026. május 24., július 5. és július 17. A fájlokat és leltárukat megőriztük, de nem aktiváltuk újra és nem írtuk át a lejáratukat. A leltár: `/root/chocoleaf-atvitel/legacy-vouchers-review.json`. A tulajdonos nem adott meg meghosszabbított lejáratokat.

A régi fődomain-konfiguráció visszaállításához a mentett `chocoleaf.hu.nginx` fájlt kell visszatenni a `/etc/nginx/sites-available/chocoleaf.hu` helyére, majd `nginx -t` után Nginx-reload szükséges. Ez visszaviszi a fődomaint a 3000-es portra. A már élesben keletkezett új adatokat ilyenkor nem szabad régi adatbázismentéssel felülírni; az új szolgáltatás/adatbázis és az új rendelések sorsát külön kell kezelni.
