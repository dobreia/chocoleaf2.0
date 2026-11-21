# Automatikus élesítés a prod branchből

A `.github/workflows/deploy.yml` a `prod` branchre érkező pushra indul. A `dev` push nem élesít. A `dev` → `prod` merge utáni push is kiváltja. Kézi indítás a GitHub Actions oldalon csak a `prod` branch kiválasztásával élesít.

## Egyszeri GitHub-beállítás

A repóban nyisd meg a **Settings → Secrets and variables → Actions → New repository secret** oldalt:

https://github.com/dobreia/chocoleaf2.0/settings/secrets/actions

Hozd létre ezt a három secretet:

| Name | Secret értéke |
|---|---|
| `DEPLOY_HOST` | `46.29.142.74` |
| `DEPLOY_SSH_KEY` | A gépeden a `backend/logs/github-actions-setup/DEPLOY_SSH_KEY` fájl **teljes tartalma**, a BEGIN/END sorokkal együtt. |
| `DEPLOY_KNOWN_HOSTS` | A `backend/logs/github-actions-setup/DEPLOY_KNOWN_HOSTS` fájl teljes tartalma. Ez a korábban ellenőrzött szerverkulcs, nem friss, ellenőrizetlen keyscan. |

A kulcsfájlok Gitből kizárt könyvtárban vannak. A privát kulcsot ne commitold, és ne másold chatbe vagy issue-ba. A `DEPLOY_SSH_KEY.pub` nyilvános párját nem a privátkulcs-secret mezőbe kell másolni. A workflow a külön `chocoleaf-deploy` szerverfiókot használja, nem a root hozzáférést.

Ezután a jelenlegi változtatásokat commitold és pushold a `dev` branchre. A `prod` branchbe történő merge és push előtt ellenőrizd, hogy a `.github/workflows/deploy.yml`, a `deploy` segédprogramok és a backend sorvég-normalizálási javítása is bekerült. A secrets és a workflow nélküli korábbi commit pusholása nem állítja be az automatizálást.

## Napi használat

1. Fejlesztés és ellenőrzés a `dev` branchen.
2. Állj a `prod` branchre, és merge-eld bele a `dev`-et.
3. Pushold a `prod`-ot. A GitHub **Actions → Deploy prod to ChocoLeaf** futás mutatja az eredményt.
4. Sikeres futásnál a `https://www.chocoleaf.hu/version.json` visszaadja az éles commit azonosítóját. Ez az első automatikus élesítés után lesz elérhető.

Csak a GitHubra pusholt, commitolt kód kerül ki. A gépeden maradt módosítások és a helyi adatbázis nem. A rendszer tesztelési, lint- és buildhibánál nem lép tovább a telepítésre. Egy időben egy élesítés fut; egy már túlhaladott, sorban váró commit nem váltja vissza az újabb prod-verziót.

## Mit csinál a telepítő?

- GitHub-runneren izolált adatbázissal backendtesztek, frontend lint/tesztek/build és a telepítő biztonsági tesztjei futnak. A titkos szerverbeállítások nincsenek a tesztkörnyezetben.
- Csak a kód, a statikus assetek és a frontend build kerül a csomagba. `.env`, ügyféladatok, feltöltések, privát utalványok és `node_modules` nem.
- A korlátozott SSH-kulcs csomagot tölthet fel és az ellenőrzött telepítőt indíthatja; általános shellparancs, SFTP és porttovábbítás nincs engedélyezve.
- A szerver külön release-könyvtárban, a `chocoleaf` felhasználóval telepíti a csomagokat és futtatja az előellenőrzést. A telepített, root tulajdonú segédprogram nem a feltöltött csomagból futtat rootként kódot. Az archívum útvonalai, típusa, mérete, a repó, a branch és a commit ellenőrizve vannak.
- A saját VPS-hez fordított Sharp-modul kerül vissza. Új Sharp-verzióhoz hiányzó natív build esetén a folyamat még az éles rendszer leállítása előtt megáll; más verziójú binárist nem használ fel.
- Az átkapcsolás előtt leállítja az alkalmazás írófolyamatait, menti az adatbázist és a feltöltött/privát fájlokat, majd tranzakcióban futtatja a szükséges migrációkat. Rövid újraindítási szünet előfordulhat.
- A `chocoleaf-current` link az új verzióra vált, az alkalmazás elindul, majd belső és nyilvános HTTPS-ellenőrzés fut. A régi JS/CSS assetek megmaradnak a már megnyitott böngészőfülekhez.
- Ellenőrzési hiba esetén az előző kódverzió indul újra. A GitHub-futás hibás marad, tehát a visszaállítás sem látszik sikeres új telepítésnek.

## Adatok és visszaállítás

Az éles adatbázist **nem** cseréli le a helyi mentésre. A `.env`, a feltöltések és a privát PDF-ek továbbra is az eredeti `/var/www/chocoleaf2/backend` helyen maradnak; a release-ek ezekre hivatkoznak.

Az adatbázist hiba esetén nem tölti vissza automatikusan, mert az friss ügyféladatokat törölhetne. A kódvisszaállítás csak visszafelé kompatibilis sémaváltozásokkal biztonságos. Új migrációban előbb hozzáadni és áttérni érdemes, a régi oszlopok/táblák eltávolítását külön, átgondolt kiadásban kell végezni. A már létező migrációk tartalmi módosítását és törlését a telepítő elutasítja; a Windows/Linux sorvégkülönbség nem számít tartalmi változásnak.

Egy régi commit erőltetett visszapusholása helyett készíts visszavonó/javító commitot, amely megtartja a már alkalmazott migrációkat. A mentésből történő adatbázis-helyreállítás külön adminisztrátori művelet.

## Szerveres útvonalak

| Elem | Hely |
|---|---|
| Aktuális kódra mutató link | `/var/www/chocoleaf-current` |
| Új release-ek | `/var/www/chocoleaf-releases` |
| Eredeti verzió és tartós fájlok | `/var/www/chocoleaf2` |
| Éles szolgáltatás | `chocoleaf.service` |
| Root tulajdonú telepítő | `/usr/local/lib/chocoleaf/production.py` |
| Korlátozott belépési szkript | `/usr/local/lib/chocoleaf/ssh-dispatch.sh` |
| Telepítésenkénti mentések | `/var/backups/chocoleaf` |
| Saját Sharp-cache | `/var/lib/chocoleaf/native` |

A release-ek és a mentések automatikusan nem törlődnek: a tárhelyet időnként ellenőrizni és a régi, már nem szükséges példányokat felügyelten ritkítani kell. A szerveren belüli kiadási mentés nem helyettesít egy külső biztonsági mentést.

A root telepítő segédprogramjának változásait külön adminisztrátori telepítéssel kell átvenni: a workflow szándékosan nem írhatja át a saját root jogosultságú infrastruktúráját. A `deploy/install-ci.sh` egyszeri, illetve felügyelt frissítésre szolgál.

Hivatalos háttér: [GitHub Actions deployment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments), [repository secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
