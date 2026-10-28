import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let target;
      try { target = hash && document.getElementById(decodeURIComponent(hash.slice(1))); }
      catch { /* A malformed fragment should not break navigation. */ }
      if (target) target.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0, left: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
}
