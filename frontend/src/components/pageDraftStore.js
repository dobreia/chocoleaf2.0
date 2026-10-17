const prefix = 'chocoleaf:page-draft:v1:';
let initializedWindow;

function storage() {
  if (typeof window === 'undefined') return null;
  try {
    const store = window.sessionStorage;
    if (initializedWindow !== window) {
      initializedWindow = window;
      if (window.performance.getEntriesByType?.('navigation')[0]?.type !== 'reload') {
        for (const key of Object.keys(store)) if (key.startsWith(prefix)) store.removeItem(key);
      }
    }
    return store;
  } catch { return null; }
}

export function draftKey(page, name) {
  return prefix + JSON.stringify([page, name]);
}

export function readDraft(key, fallback) {
  try {
    const raw = storage()?.getItem(key);
    if (raw === null || raw === undefined) return fallback();
    const parsed = JSON.parse(raw);
    return parsed && Object.hasOwn(parsed, 'value') ? parsed.value : fallback();
  } catch { return fallback(); }
}

export function writeDraft(key, value) {
  try {
    const store = storage();
    if (value === undefined) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify({ value }));
  } catch { /* Forms still work when browser storage is unavailable or full. */ }
}

export function clearPageDrafts(page) {
  const store = storage();
  if (!store) return;
  try {
    for (const key of Object.keys(store)) {
      if (!key.startsWith(prefix)) continue;
      try {
        if (JSON.parse(key.slice(prefix.length))[0] === page) store.removeItem(key);
      } catch { store.removeItem(key); }
    }
  } catch { /* Storage may be disabled during the session. */ }
}
