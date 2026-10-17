import { NavLink } from "react-router-dom";

const legalLinks = [
  { to: "/legal/imprint", label: "Impresszum" },
  { to: "/legal/privacy", label: "Adatkezelési tájékoztató" },
  { to: "/legal/terms", label: "Rendelési feltételek" },
  { to: "/legal/cookies", label: "Sütik" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <p className="site-footer__brand">ChocoLeaf</p>
          <p className="site-footer__text">
            Egyedi csokoládés élmények, ajándékok és műhelyprogramok.
          </p>
        </div>

        <nav className="site-footer__legal" aria-label="Jogi linkek">
          {legalLinks.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <p className="site-footer__copyright">© {year} ChocoLeaf</p>
      </div>
    </footer>
  );
}
