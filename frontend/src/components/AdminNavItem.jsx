import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/courses';
import '../styles/AdminNavItem.css';

export default function AdminNavItem({ onClick, itemClassName }) {
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    let live = true;
    let request = 0;
    const check = () => {
      const current = ++request;
      api('/auth/me')
        .then(() => { if (live && current === request) setAuthenticated(true); })
        .catch(() => { if (live && current === request) setAuthenticated(false); });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const onExpired = () => { request++; setAuthenticated(false); };
    check();
    const timer = setInterval(check, 60000);
    window.addEventListener('focus', check);
    window.addEventListener('admin-session-expired', onExpired);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('admin-session-expired', onExpired);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return authenticated ? (
    <li className={itemClassName}>
      <Link className="nav-link admin-access-link" to="/admin" onClick={onClick}>Admin</Link>
    </li>
  ) : null;
}
