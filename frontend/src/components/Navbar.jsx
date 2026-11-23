import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import "../styles/Navbar.css";
import AdminNavItem from './AdminNavItem';
import { siteLinks, siteActions } from './siteNavigation';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <nav className="chocoleaf-navbar" aria-label="Fő navigáció">
      <div className="container navbar-container">
        <Link className="chocoleaf-brand" to="/" onClick={closeMenu}>
          <img className="chocoleaf-brand__logo" src="/assets/logo.png" alt="ChocoLeaf – főoldal" />
        </Link>

        <button
          className="navbar-toggle"
          type="button"
          aria-controls="primary-navigation"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Menü bezárása" : "Menü megnyitása"}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div
          className={`navbar-menu ${isOpen ? "is-open" : ""}`}
          id="primary-navigation"
        >
          <ul>
            {siteLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "is-active" : ""}`
                  }
                  to={link.to}
                  onClick={closeMenu}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            <AdminNavItem onClick={closeMenu} />
          </ul>
          <div className="navbar-actions">
            {siteActions.map(link => (
              <Link className={link.className} to={link.to} key={link.to} onClick={closeMenu}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
