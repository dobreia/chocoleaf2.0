import { Fragment, useEffect, useRef } from 'react';
import { useDraftPage } from './usePageDraft';
import { clearPageDrafts } from './pageDraftStore';

export default function DraftNavigation({ children }) {
  const page = useDraftPage();
  const previous = useRef(page);
  useEffect(() => {
    if (previous.current !== page) clearPageDrafts(previous.current);
    previous.current = page;
  }, [page]);
  useEffect(() => {
    const onShow = event => { if (event.persisted) clearPageDrafts(page); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [page]);
  return <Fragment key={page}>{children}</Fragment>;
}
