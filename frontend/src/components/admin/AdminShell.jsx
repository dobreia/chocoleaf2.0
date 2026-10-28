import { useCallback, useEffect, useRef, useState } from "react";
import { usePageDraftState, useClearPageDrafts } from '../usePageDraft';
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../../api/courses";
import { Field, SaveForm } from "./UI";
import "../../styles/AdminWorkspace.css";
export default function AdminShell() {
  const [user, setUser] = useState(undefined);
  const [unreadInquiries, setUnreadInquiries] = useState(0);
  const inquiryRequest = useRef(0);
  const refreshInquiryCount = useCallback(() => {
    const request = ++inquiryRequest.current;
    return api('/admin/inquiries/unread-count')
      .then(({unread}) => {
        if (request === inquiryRequest.current) setUnreadInquiries(unread);
      })
      .catch(() => { /* Keep the last count if the connection is temporarily unavailable. */ });
  }, []);
  const [email, setEmail, resetEmail] = usePageDraftState('login.email', ""),
    [password, setPassword] = useState("");
  const navigate = useNavigate();
  const clearDrafts = useClearPageDrafts();
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
    const expire = () => { clearDrafts(); setUser(null); };
    window.addEventListener("admin-session-expired", expire);
    return () => window.removeEventListener("admin-session-expired", expire);
  }, [clearDrafts]);
  useEffect(() => {
    if (!user) return;
    const requestState = inquiryRequest;
    refreshInquiryCount();
    const timer = setInterval(refreshInquiryCount, 30000);
    window.addEventListener('focus', refreshInquiryCount);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshInquiryCount);
      requestState.current++;
    };
  }, [user, refreshInquiryCount]);
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
            clearDrafts();
            setPassword("");
            resetEmail();
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
              clearDrafts();
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
              {path === 'inquiries' && unreadInquiries > 0 &&
                <span className="cl-nav-unread" aria-label={`${unreadInquiries} olvasatlan megkeresés`}>{unreadInquiries}</span>}
            </NavLink>
          ))}
        </nav>
        <main className="cl-content">
          <Outlet context={{refreshInquiryCount}} />
        </main>
      </div>
    </div>
  );
}
