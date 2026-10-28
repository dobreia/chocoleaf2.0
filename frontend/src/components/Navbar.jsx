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
          ChocoLeaf
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
            {[...siteLinks, ...siteActions].map((link) => (
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
        </div>
      </div>
    </nav>
  );
}
