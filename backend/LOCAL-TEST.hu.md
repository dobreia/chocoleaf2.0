# Localhostos Stripe-teszt

Az indító külön `chocoleaf_stripe_local` PostgreSQL-adatbázist használ, létrehozza a szükséges táblákat és egy jövőbeli tesztidőpontot. Az admin belépési adatai az eredeti `backend/.env` ADMIN_EMAIL és ADMIN_PASSWORD értékei. A meglévő foglalások és ügyféladatok nem kerülnek át a tesztadatbázisba.

## Amit neked kell megadnod

1. A Stripe Dashboard tesztkörnyezetében keresd meg a titkos API-kulcsot (`sk_test_…`).
2. A `backend/.env.local-test` fájlban töltsd ki a `STRIPE_SECRET_KEY=` sort. Ne a chatbe küldd a kulcsot.
3. A projekt gyökerében indítsd el a `HELYI-TESZT.cmd` fájlt dupla kattintással. Alternatíva: a backend mappában `npm run local`.
4. Nyisd meg: http://127.0.0.1:5174. Az admin: http://127.0.0.1:5174/admin.

Az indító automatikusan elindítja a helyileg telepített Stripe CLI-t, átadja a webhook aláíró titkát a backendnek, majd elindítja a backendet és a frontendet. Nem kell külön CLI-bejelentkezés vagy kézi webhookbeállítás: a CLI a megadott tesztkulcsot használja környezeti változóként. A kulcsok nem kerülnek a parancssori argumentumokba vagy a naplóba.

A terminált hagyd nyitva; leállítás: Ctrl+C. Kulcsmódosítás után indítsd újra. A teszt külön portokat használ: backend 3002, frontend 5174. A szokásos 3001/5173 fejlesztői oldal ezzel párhuzamosan futhat. Ha a 3002 vagy 5174 port foglalt, előbb állítsd le a korábbi tesztindítót.

## Mit tudsz kipróbálni?

- Ajándékutalvány és foglalás: válaszd ki, töltsd ki az adatokat, majd fizess a Stripe tesztoldalán.
- Tesztkártya: `4242 4242 4242 4242`, jövőbeli lejárat, háromjegyű CVC.
- Sikertelen kártya: `4000 0000 0000 0002`.
- Fizetés előtt nincs foglalás az adminlistában. Sikeres fizetés után pontosan egy fizetett foglalás jön létre. Megszakításkor nem keletkezik foglalás; a helytartás a fizetés lejáratakor szabadul fel.
- `LOCAL_MAIL_MODE=capture` esetén a levelek `.eml` fájlként a `backend/.local-mail` mappában találhatók. `LOCAL_MAIL_MODE=real` esetén valódi emailküldés történik a backend/.env SMTP-adataival; az admincím a MAIL_ADMIN. A PDF mindkét módban csatolmány. Részletes beállítás: `EMAIL.hu.md`.
- Ebben a helyi tesztmódban **Billingo-számla nem készül**. Az állapot ezt külön jelzi. Ez a Stripe és a foglalási folyamat kipróbálására szolgál, nem a Billingo végpont teljes tesztje.

## Billingo tesztelése később

A teljes számlázási integrációhoz a saját Billingo tesztbeállításaidat kell megadnod a `.env.payments.example` alapján, majd a szokásos indítást használnod (`npm start` / `npm run dev`) külön Stripe CLI webhooktovábbítással. A helyi indító mindig kihagyja a Billingót. A helyi tesztből már fizetett rendelésekhez utólag sem állít ki számlát az alkalmazás.

## Technikai ellenőrzés kulcs nélkül

`npm run local:check`: ellenőrzi a tesztadatbázist, a migrációkat, a frontend–backend kapcsolatot, az admin belépést, a tesztidőpontot és a helyi SMTP-fájlkimenetet, majd leállítja a saját folyamatait. Nem hívja a Stripe-ot és nem szimulál sikeres fizetést.

Forrás: [Stripe CLI API-kulcs](https://docs.stripe.com/cli/api_keys), [webhooktovábbítás](https://docs.stripe.com/cli/listen), [tesztkártyák](https://docs.stripe.com/testing).
