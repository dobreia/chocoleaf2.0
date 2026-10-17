import { useState } from "react";
import { api } from "../api/courses";
import "../styles/HomePage.css";

export default function HomePage() {
  const [formStatus, setFormStatus] = useState("");
  const [sending, setSending] = useState(false);
  async function submitInquiry(e) {
    e.preventDefault();
    if (sending) return;
    const form = e.currentTarget;
    const d = new FormData(form);
    setSending(true);
    try {
      const r = await api("/inquiries", {
        method: "POST",
        body: {
          name: d.get("Név"),
          email: d.get("Email"),
          phone: d.get("Telefonszám"),
          subject: d.get("Termék") || "Ajánlatkérés",
          message: d.get("Részletek") + "\nÁtvétel: " + d.get("Dátum"),
        },
      });
      setFormStatus(r.message);
      form.reset();
    } catch (err) {
      setFormStatus(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="home-page">
      <section className="hero">
        <video autoPlay muted loop playsInline className="hero-video">
          <source src="/assets/landing_video.mp4" type="video/mp4" />A böngésződ
          nem támogatja a videólejátszást.
        </video>

        <img className="logo" src="/assets/logo.png" alt="" />

        <nav className="navbar navbar-expand-xl">
          <div className="container-fluid">
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarNav"
              aria-controls="navbarNav"
              aria-expanded="false"
              aria-label="Menü megnyitása"
            >
              <span className="navbar-toggler-icon"></span>
            </button>

            <div className="nav-buttons">
              <a href="#form">
                <button className="button-primary">Ajánlatkérés</button>
              </a>

              <a href="/courses">
                <button className="button-secondary">Képzések</button>
              </a>
            </div>

            <div
              className="collapse navbar-collapse justify-content-between"
              id="navbarNav"
            >
              <ul className="navbar-nav mx-auto text-center">
                <li className="nav-item">
                  <a className="nav-link" aria-current="page" href="/">
                    Főoldal
                  </a>
                </li>

                <li className="nav-item">
                  <a className="nav-link" href="#introduction">
                    Rólam
                  </a>
                </li>

                <li className="nav-item">
                  <a className="nav-link" href="/gallery">
                    Munkáim
                  </a>
                </li>

                <li className="nav-item">
                  <a className="nav-link" href="#footer">
                    Kapcsolat
                  </a>
                </li>

                <li className="nav-item">
                  <a className="nav-link" href="/giftcard">
                    Ajándékutalvány
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </nav>

        <div className="hero-content">
          <h1>A Te szíved, az Én kezem</h1>
          <h2>Egyedi kézműves édességkészítés</h2>

          <a href="/courses">
            <button className="button-secondary">Időpontfoglalás</button>
          </a>
        </div>

        <div className="first-divider" aria-hidden="true" />
      </section>

      <section className="introducing bg-cream">
        <section>
          <div className="infinite-carousel">
            <div className="carousel-track">
              <img src="/assets/carousel/img1.jpg" alt="" />
              <img src="/assets/carousel/img2.jpg" alt="" />
              <img src="/assets/carousel/img3.jpg" alt="" />
              <img src="/assets/carousel/img4.jpg" alt="" />
              <img src="/assets/carousel/img5.jpg" alt="" />
              <img src="/assets/carousel/img6.jpg" alt="" />
              <img src="/assets/carousel/img7.jpg" alt="" />
              <img src="/assets/carousel/img8.jpg" alt="" />
              <img src="/assets/carousel/img9.jpg" alt="" />
              <img src="/assets/carousel/img10.jpg" alt="" />

              <img src="/assets/carousel/img1.jpg" alt="" />
              <img src="/assets/carousel/img2.jpg" alt="" />
              <img src="/assets/carousel/img3.jpg" alt="" />
              <img src="/assets/carousel/img4.jpg" alt="" />
              <img src="/assets/carousel/img5.jpg" alt="" />
              <img src="/assets/carousel/img6.jpg" alt="" />
              <img src="/assets/carousel/img7.jpg" alt="" />
              <img src="/assets/carousel/img8.jpg" alt="" />
              <img src="/assets/carousel/img9.jpg" alt="" />
              <img src="/assets/carousel/img10.jpg" alt="" />
            </div>
          </div>

          <a href="/gallery">
            <button className="button-primary gallery-button">
              További képek
            </button>
          </a>
        </section>

        <h1 id="introduction">Bemutatkozás</h1>

        <div className="container">
          <div className="row">
            <div className="col-lg">
              <p>
                Gyerekkorom óta a konyhában érzem magam igazán otthon. Már 10
                évesen tökélyre fejlesztettem a kókuszgolyót, később pedig a
                nagymamámtól megtanultam a család féltve őrzött
                süteményreceptjeit. A sütés szeretete azóta is végigkíséri az
                életemet.
                <br />
                Az édességek iránti szenvedélyem 2015-ben kapott új lendületet,
                amikor egy bonbonkészítő tanfolyamon rájöttem: a csokoládé nem
                csak édesség - <strong>
                  alkotás, élmény és művészet.
                </strong>{" "}
                Azóta folyamatosan tanulok, kísérletezek és új ízeket fedezek
                fel.
                <br />
                Hogy a lehető legmagasabb szinten készíthessek egyedi
                desszerteket, 2019-ben elvégeztem a Cukrász OKJ képzést, majd{" "}
                <strong>
                  2023-ban a Magyar Agrár- és Élettudományi Egyetem csokoládé-,
                  kávé- és teakészítő mester szaktanácsadó képzését is.
                </strong>
                <br />
                Számomra minden desszert egy történet. Egy születésnap, egy
                esküvő, egy meglepetés vagy egy különleges pillanat része.
              </p>
            </div>

            <div className="col-lg">
              <p>
                Kislányom ételallergiája és barátaim speciális étrendjei miatt a
                <strong>
                  {" "}
                  mentes és diétás édességek készítését is örömmel
                  vállalom.{" "}
                </strong>
                Így azok is élvezhetik az igazán különleges desszerteket,
                akiknek különleges étrendre van szükségük.
                <br />
                Egy barátnőm különleges tortarendelése indította el a
                vállalkozásomat - a torta hatalmas sikert aratott, és azóta
                egyre több megkeresés érkezik{" "}
                <strong>
                  egyedi tortákra, kézműves csokoládékra és bonbonokra.
                </strong>
                <br />
                <br />
                Nálam minden desszert:
                <br />
                🍫 kézműves
                <br />
                🎂 egyedi
                <br />
                ✨ és szeretettel készül
                <br />
                <br />
                <strong>Neked milyen édességet készítsek?</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="container contact-container">
          <div className="row">
            <div className="col-sm order-2 order-sm-1 contact-button">
              <a href="#footer">
                <button className="button-primary">Kapcsolat</button>
              </a>
            </div>

            <div className="col-sm order-1 order-sm-2">
              <div className="profile-container">
                <div className="profile-name">
                  <p className="name">Braun Edit</p>
                  <p className="profession">Cukrász</p>
                </div>

                <div>
                  <img src="/assets/profile.jpg" alt="" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card-container">
          <div className="container">
            <div className="row">
              <div className="col-sm-6 col-lg-3">
                <p>Torták</p>

                <div className="image-container">
                  <img src="/assets/cake.jpg" alt="" />

                  <div className="overlay-text">
                    Egyedi torták készítése alkalomhoz illő stílusban és
                    dekorációval. Torta házhoz szállítás! Gluténmentes és
                    kalóriaszegény verziókban is teljes értékű egyedi
                    tortakészítést vállalok.
                  </div>
                </div>
              </div>

              <div className="col-sm-6 col-lg-3">
                <p>Sütemények</p>

                <div className="image-container">
                  <img src="/assets/cookies.jpg" alt="" />

                  <div className="overlay-text">
                    Egyedi kézműves sütemények készítése catering vagy
                    csapatépítő eseményekre. Különleges kialakítás, egyedi
                    igények teljesítése. Bonbon, fánk, teasütemény.
                  </div>
                </div>
              </div>

              <div className="col-sm-6 col-lg-3">
                <p>Desszertek</p>

                <div className="image-container">
                  <img src="/assets/desserts.jpg" alt="" />

                  <div className="overlay-text">
                    Speciális kézműves desszertek készítése különleges
                    alkalmakra. Nem csak egyedi ízvilággal, hanem különleges
                    megjelenéssel, egyedi dekorációkkal is.
                  </div>
                </div>
              </div>

              <div className="col-sm-6 col-lg-3">
                <p>Bonbonok</p>

                <div className="image-container">
                  <img src="/assets/bonbons.jpg" alt="" />

                  <div className="overlay-text">
                    Egyedi házi készítésű különleges bonbonok, amelyek
                    garantáltan sikert aratnak. Prémium összetevők, Kézműves
                    bonbonkészításhez.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider-top">
        <svg viewBox="0 0 1200 20" preserveAspectRatio="none">
          <path
            d="M0,0 L10,20 L20,0 L30,20 L40,0 L50,20 L60,0 L70,20 L80,0 L90,20 L100,0 L110,20 L120,0 L130,20 L140,0 L150,20 L160,0 L170,20 L180,0 L190,20 L200,0 L210,20 L220,0 L230,20 L240,0 L250,20 L260,0 L270,20 L280,0 L290,20 L300,0 L310,20 L320,0 L330,20 L340,0 L350,20 L360,0 L370,20 L380,0 L390,20 L400,0 L410,20 L420,0 L430,20 L440,0 L450,20 L460,0 L470,20 L480,0 L490,20 L500,0 L510,20 L520,0 L530,20 L540,0 L550,20 L560,0 L570,20 L580,0 L590,20 L600,0 L610,20 L620,0 L630,20 L640,0 L650,20 L660,0 L670,20 L680,0 L690,20 L700,0 L710,20 L720,0 L730,20 L740,0 L750,20 L760,0 L770,20 L780,0 L790,20 L800,0 L810,20 L820,0 L830,20 L840,0 L850,20 L860,0 L870,20 L880,0 L890,20 L900,0 L910,20 L920,0 L930,20 L940,0 L950,20 L960,0 L970,20 L980,0 L990,20 L1000,0 L1010,20 L1020,0 L1030,20 L1040,0 L1050,20 L1060,0 L1070,20 L1080,0 L1090,20 L1100,0 L1110,20 L1120,0 L1130,20 L1140,0 L1150,20 L1160,0 L1170,20 L1180,0 L1190,20 L1200,0 Z"
            fill="#EEE8DC"
          />
        </svg>
      </div>

      <section className="benefits bg-blue">
        <h1>Miért válassz engem?</h1>

        <div className="container">
          <div className="row">
            <div className="col-sm benefit-container">
              <img src="/assets/Ikonok/offer.png" alt="" />
              <h2>ÁR-ÉRTÉK ARÁNY</h2>

              <p>
                Finomságaim a legkülönlegesebb, legjobb minőségű és legjobb áron
                készülnek.
              </p>
            </div>

            <div className="col-sm benefit-container">
              <img src="/assets/Ikonok/sugar.png" alt="" />
              <h2>HOZZÁADOTT CUKOR NÉLKÜL</h2>

              <p>
                Finomat cukor nélkül is lehet sütni, így diéta mellett is
                rendelhetsz kalóriaszegény édességeket.
              </p>
            </div>

            <div className="col-sm benefit-container">
              <img src="/assets/Ikonok/cake2.png" alt="" />
              <h2>EGYEDI</h2>

              <p>
                Gondos figyelemmel, kreativitással és lelkesedéssel dolgozom
                azon, hogy az ünnep valódi élmény legyen.
              </p>
            </div>

            <div className="col-sm benefit-container">
              <img src="/assets/Ikonok/gluten-free.png" alt="" />
              <h2>TERMÉSZETES</h2>

              <p>
                Minden esetben kizárólag természetes, kiváló alapanyagokból
                készülnek munkáim.
              </p>
            </div>

            <div className="col-sm benefit-container">
              <img src="/assets/Ikonok/clock.png" alt="" />
              <h2>GYORS</h2>

              <p>
                Hamarosan rendezvény és még nincs tortád? Add le rendelésed és
                rövid határidővel elkészítem!
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="wave-separator">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path
            d="M0,96 C480,192 960,0 1440,96 L1440,320 L0,320 Z"
            fill="#6C485C"
          />
        </svg>
      </div>

      <section className="bg-purple">
        <h1>Alkalomra, céges rendezényre, vagy csak úgy...</h1>

        <h2>
          A torták, sütemények, ínycsiklandó finomságok nélkülözhetetlen elemei
          egy jó közösségi eseménynek, ezért rendszeresen vállalok
          édességkészítést minden alkalomra.
        </h2>

        <p>
          <img src="/assets/Ikonok/check.svg" alt="" />
          Egyedi torták és kézműves csokoládék, bonbonok céges rendezvényekre
          vagy akár családi eseményekre.
        </p>

        <p>
          <img src="/assets/Ikonok/check.svg" alt="" />
          Esküvői csomagok összeállítása esküvői tortával, ehető köszönő
          ajándékkal és aprósüteményekkel.
        </p>

        <p>
          <img src="/assets/Ikonok/check.svg" alt="" />
          Édes teasütemények, sós ropogósok készítése, igény szerint, akár
          hozzáadott cukor, glutén, tartósítószer, dió-és mogyóróféle
          alapanyagok nélkül.
        </p>

        <p>
          <img src="/assets/Ikonok/check.svg" alt="" />
          Egyéni kívánságok, extra igények megvalósítása, személyreszabott
          forma, ízvilág és díszítés. Határ a csillagos ég!
        </p>

        <a href="#form">
          <button className="button-primary">Ajánlatkérés</button>
        </a>

        <div className="vr"></div>
      </section>

      <section id="opinions" className="bg-cream">
        <div className="container-md">
          <h1>Rólam mondták</h1>

          <h2>
            Hogyan látnak eddigi ügyfeleim, mik a tapasztalataik a munkámról?
          </h2>

          <div className="row">
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card">
                <div className="header">
                  <div className="left">
                    <p>Jantner Anna</p>

                    <div className="rating">
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                    </div>
                  </div>

                  <div className="google-tooltip">
                    <img
                      className="google"
                      src="/assets/Ikonok/google.svg"
                      alt=""
                    />
                  </div>
                </div>

                <div className="text">
                  <p>
                    Régóta igyekszünk csak élményeket adni a családban
                    ajándékba. Ez a délután élmény volt a javából! Fantasztikus
                    környezet, barátságos, szakmailag felkészült foglalkozás!
                    Edit maga a megtestesült kedvesség! Ezen a helyen mindenki
                    csoki mesternek érezheti magát!
                  </p>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card">
                <div className="header">
                  <div className="left">
                    <p>Prech Erzsébet</p>

                    <div className="rating">
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                    </div>
                  </div>

                  <div className="google-tooltip">
                    <img
                      className="google"
                      src="/assets/Ikonok/google.svg"
                      alt="Facebook"
                    />
                  </div>
                </div>

                <div className="text">
                  <p>
                    Mindennek ellent tudok állni, kivéve a ChocoLeaf
                    kísértésnek. A legjobb mentes (és mentetlen) sütik és
                    csokik. Ráadásul mindent tud a kávéról is. Meg a kávés
                    csokiról. Meg a málnásról, az epresről, a töltött, a
                    töltetlen, a szögletes, a kerek, a lyukas és a mindenféle
                    csokoládéról is.
                  </p>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card">
                <div className="header">
                  <div className="left">
                    <p>Szilágyi Mónika</p>

                    <div className="rating">
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                    </div>
                  </div>

                  <div className="google-tooltip">
                    <img
                      className="google"
                      src="/assets/Ikonok/google.svg"
                      alt="Facebook"
                    />
                  </div>
                </div>

                <div className="text">
                  <p>
                    Szeretném megköszönni a fantasztikus esküvői tortákat! A
                    kinézetük pontosan olyan lett, amilyet megálmodtunk,
                    tökéletesen illeszkedett az esküvőnk hangulatához. A cukrász
                    végig rendkívül segítőkész volt, és az ízek egyszerűen
                    mennyeiek voltak. Mindenki imádta a tortákat, igazi
                    mestermunka!
                  </p>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card">
                <div className="header">
                  <div className="left">
                    <p>Kovács Judit</p>

                    <div className="rating">
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                      <img src="/assets/Ikonok/star-icon.svg" alt="" />
                    </div>
                  </div>

                  <div className="google-tooltip">
                    <img
                      className="google"
                      src="/assets/Ikonok/google.svg"
                      alt=""
                    />
                  </div>
                </div>

                <div className="text">
                  <p>
                    Egy csodálatos élményben volt részünk! Mindent megismertünk
                    a csokoládéról és a készítéséről! Emellett isteni finomakat
                    kóstoltunk. Szívből ajánlom mindenkinek!🥰
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="opinions-button">
            <a
              target="_blank"
              rel="noreferrer"
              href="https://www.google.hu/maps/place/ChocoLeaf+Egyedi+%C3%89dess%C3%A9gk%C3%A9sz%C3%ADt%C3%A9s/@47.5816146,19.0500818,17z/data=!4m8!3m7!1s0x4741d9a4d236dde1:0x8392a04d68e92e4d!8m2!3d47.581611!4d19.0526567!9m1!1b1!16s%2Fg%2F11q9hrsctg?entry=ttu&g_ep=EgoyMDI1MDkxNi4wIKXMDSoASAFQAw%3D%3D"
            >
              <button className="button-primary">
                Nézd meg az eredeti kommenteket!
              </button>
            </a>
          </div>
        </div>
      </section>

      <div className="second-divider" aria-hidden="true" />

      <section id="form" className="bg-blue">
        <h1>Ajánlatkérés</h1>

        <h2>
          Ajánlatkérésed telefonon, emailben, vagy ezen űrlap kitöltésével is le
          tudod adni.
          <br />
          Édesség rendelést minimum 1 hetes elkészítési határidővel tudunk
          vállalni!
        </h2>

        <div className="form-bg">
          <form onSubmit={submitInquiry} acceptCharset="UTF-8">
            <input type="hidden" name="_captcha" value="true" />

            <input type="text" name="_honey" style={{ display: "none" }} />

            <input type="text" name="Név" id="nev" placeholder="Név" required />

            <input
              type="email"
              name="Email"
              id="email"
              placeholder="Email cím"
              required
            />

            <input
              type="tel"
              name="Telefonszám"
              id="telefon"
              placeholder="Telefonszám"
              required
            />

            <input
              type="text"
              name="Termék"
              id="termek"
              placeholder="Termék megnevezése"
            />

            <textarea
              name="Részletek"
              id="reszletek"
              rows={8}
              placeholder="Termék leírása"
              required
            ></textarea>

            <label htmlFor="datum">Átvételi időpont</label>

            <input
              type="date"
              id="datum"
              name="Dátum"
              className="date-input"
              required
            />

            <p>
              Az űrlap beküldésével az{" "}
              <a href="/privacy-policy">adatkezelési tájékoztatót</a> elolvastam
              és elfogadom.
            </p>

            <input
              type="submit"
              disabled={sending}
              value={sending ? "Küldés…" : "Küldés"}
            />
            <p role="status">{formStatus}</p>
          </form>
        </div>

        <h3>
          Az űrlap beküldése után felvesszük veled a kapcsolatot, és küldünk egy
          ajánlatot.
        </h3>
      </section>

      <section id="footer" className="bg-light-purple">
        <div className="container-lg">
          <div className="footer-flex">
            <div className="footer-left">
              <img
                src="/assets/logo.png"
                alt="ChocoLeaf logó"
                className="footer-logo"
              />

              <h1>ChocoLeaf - kézműves édességek</h1>

              <p>
                Egyedi csokoládé-, torta- és süteménytervezés, akár glutén- és
                cukormentes változatban is.
                <br />
                Rövid határidővel, teljesen személyre szabottan.
              </p>

              <div className="footer-legal">
                <a href="/impressum">Impresszum</a> ·{" "}
                <a href="/rendelesi-feltetelek">Rendelési feltételek</a> ·{" "}
                <a href="/privacy-policy">Adatkezelés</a> ·{" "}
                <a href="/cookie-policy">Sütik kezelése</a>
              </div>

              <div className="payment-logos">
                <p>Biztonságos bankkártyás fizetés a Stripe oldalán.</p>
              </div>
            </div>

            <div className="footer-right">
              <h1>Kapcsolat</h1>

              <div className="footer-contact">
                <div className="footer-icons">
                  <div className="icons-left">
                    <p>
                      <img src="/assets/Ikonok/phone.png" alt="" />
                      06 20 373 4023
                    </p>

                    <p>
                      <img src="/assets/Ikonok/email.png" alt="" />
                      info@chocoleaf.hu
                    </p>

                    <p>
                      <img src="/assets/Ikonok/location.png" alt="" />
                      1039 Budapest, Huba utca 3.
                    </p>
                  </div>

                  <div className="icons-right">
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href="https://www.facebook.com/egyedicsokiestorta"
                    >
                      <p>
                        <img src="/assets/Ikonok/facebook.png" alt="" />
                        /egyedicsokiestorta
                      </p>
                    </a>

                    <a
                      target="_blank"
                      rel="noreferrer"
                      href="https://www.instagram.com/chocoleaf"
                    >
                      <p>
                        <img src="/assets/Ikonok/instagram.png" alt="" />
                        @chocoleaf
                      </p>
                    </a>

                    <a
                      target="_blank"
                      rel="noreferrer"
                      href="https://www.tiktok.com/@chocoleaf"
                    >
                      <p>
                        <img src="/assets/Ikonok/tik-tok.png" alt="" />
                        @chocoleaf
                      </p>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="footer-map">
            <iframe
              title="ChocoLeaf térkép"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2691.2907062999084!2d19.05006497669869!3d47.58158738970397!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4741d9eae0a0600f%3A0x91a29abbcd6f8eb9!2sBudapest%2C%20Huba%20u.%203%2C%201039!5e0!3m2!1shu!2shu!4v1756814572505!5m2!1shu!2shu"
              width="100%"
              height="200"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
            ></iframe>
          </div>
        </div>
      </section>

      <button
        className="cookie-fab"
        onClick={() =>
          window.alert(
            "Az adminbejelentkezéshez szükséges munkamenetsütit használunk. A beágyazott Google Térkép külső szolgáltatás, saját adatkezelési feltételekkel. Részletek a Sütik oldalon.",
          )
        }
      >
        Süti-információk
      </button>
    </div>
  );
}
