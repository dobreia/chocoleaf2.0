import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { draftKey, readDraft, writeDraft, clearPageDrafts } from './pageDraftStore';

export function useDraftPage() {
  const { pathname, search, hash } = useLocation();
  // Scope management drafts to the booking without storing its bearer token.
  const booking = pathname === '/booking/manage' ? '#' + hash.slice(1).split('.')[0] : '';
  return pathname + search + booking;
}

export function usePageDraftState(name, initialValue) {
  const page = useDraftPage();
  const key = draftKey(page, name);
  const [fallback] = useState(() => () => typeof initialValue === 'function' ? initialValue() : initialValue);
  const [value, setValue] = useState(() => readDraft(key, fallback));
  const current = useRef(value);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);
  const set = useCallback(next => {
    if (!activeRef.current) return;
    const resolved = typeof next === 'function' ? next(current.current) : next;
    current.current = resolved;
    writeDraft(key, resolved);
    setValue(resolved);
  }, [key]);
  const reset = useCallback(() => {
    if (!activeRef.current) return;
    const resolved = fallback();
    current.current = resolved;
    writeDraft(key, undefined);
    setValue(resolved);
  }, [fallback, key]);
  useEffect(() => {
    const onShow = event => { if (event.persisted) reset(); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [reset]);
  return [value, set, reset];
}

// Payment request identifiers must survive refresh along with the form values.
export function usePageDraftRef(name, initialValue) {
  const page = useDraftPage();
  const key = draftKey(page, name);
  const ref = useMemo(() => {
    let value = readDraft(key, () => initialValue);
    return {
      get current() { return value; },
      set current(next) { value = next; writeDraft(key, next); },
    };
  }, [key, initialValue]);
  useEffect(() => {
    const onShow = event => { if (event.persisted) ref.current = initialValue; };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [ref, initialValue]);
  return ref;
}

export function useClearPageDrafts() {
  const page = useDraftPage();
  return useCallback(() => clearPageDrafts(page), [page]);
}
