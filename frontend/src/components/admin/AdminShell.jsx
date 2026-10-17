import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../../api/courses";
import { Field, SaveForm } from "./UI";
import "../../styles/AdminWorkspace.css";
export default function AdminShell() {
  const [user, setUser] = useState(undefined);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
    const expire = () => setUser(null);
    window.addEventListener("admin-session-expired", expire);
    return () => window.removeEventListener("admin-session-expired", expire);
  }, []);
  if (user === undefined)
    return (
      <main className="cl-admin">
        <p>Bejelentkezés ellenőrzése…</p>
      </main>
    );
  if (!user)
    return (
      <main className="cl-admin cl-login">
        <a href="/">ChocoLeaf</a>
        <h1>Admin belépés</h1>
        <SaveForm
          label="Bejelentkezés"
          onSave={async () => {
            setUser(
              await api("/auth/login", {
                method: "POST",
                body: { email, password },
              }),
            );
            setPassword("");
          }}
        >
          <Field
            label="Email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Jelszó"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </SaveForm>
      </main>
    );
  return (
    <div className="cl-admin">
      <header className="cl-top">
        <NavLink to="/admin" className="cl-brand">
          ChocoLeaf <small>ADMIN</small>
        </NavLink>
        <div>
          <a href="/">Weboldal</a>
          <button
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              setUser(null);
              navigate("/admin");
            }}
          >
            Kilépés
          </button>
        </div>
      </header>
      <div className="cl-workspace">
        <nav className="cl-nav" aria-label="Admin navigáció">
          {[
            ["", "Áttekintés"],
            ["calendar", "Naptár"],
            ["calendar-sync", "Telefonos naptár"],
            ["bookings", "Foglalások"],
            ["services", "Szolgáltatások"],
            ["courses", "Időpontok"],
            ["customers", "Ügyfelek"],
            ["inquiries", "Megkeresések"],
            ["content", "Oldaltartalmak"],
            ["giftcards", "Utalványok"],
            ["payments", "Fizetések és számlák"],
          ].map(([path, label]) => (
            <NavLink end to={"/admin/" + path} key={path}>
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="cl-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
