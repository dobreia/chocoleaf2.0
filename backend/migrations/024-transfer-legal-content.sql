-- Remove the retired payment provider without advertising future card payments.
-- Keep the original import migration immutable and preserve unrelated admin text.
CREATE FUNCTION pg_temp.transfer_legal_node(node jsonb, page_slug text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE child jsonb; cleaned jsonb; result jsonb; replacement text;
BEGIN
 IF jsonb_typeof(node)='array' THEN
  result='[]'::jsonb;
  FOR child IN SELECT value FROM jsonb_array_elements(node) LOOP
   cleaned=pg_temp.transfer_legal_node(child,page_slug);
   IF cleaned IS NOT NULL THEN result=result||jsonb_build_array(cleaned); END IF;
  END LOOP;
  RETURN result;
 END IF;
 IF jsonb_typeof(node)<>'object' THEN RETURN node; END IF;
 IF node->>'type'='tableRow' AND page_slug='cookies' AND node::text ILIKE '%barion%' THEN RETURN NULL; END IF;
 IF node->>'type'='paragraph' AND node::text ILIKE '%barion%' THEN
  IF page_slug='terms' THEN
   replacement=CASE WHEN node::text ILIKE '%fizetés%előre%'
    THEN 'A weboldalon leadott workshopfoglalások és ajándékutalvány-rendelések fizetése előre, banki átutalással történik.'
    ELSE 'Az átutaláshoz szükséges kedvezményezett, bankszámlaszám, összeg és közlemény a fizetési oldalon és a rendelésről küldött e-mailben található.' END;
  ELSIF page_slug='privacy' THEN
   replacement='A weboldalon jelenleg banki átutalással lehet fizetni. A weboldal bankkártyaadatokat nem kér és nem tárol. A sütikről és külső szolgáltatásokról a Sütik oldalon található tájékoztatás.';
  END IF;
  IF replacement IS NOT NULL THEN RETURN jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',replacement))); END IF;
 END IF;
 IF node ? 'content' THEN node=jsonb_set(node,'{content}',pg_temp.transfer_legal_node(node->'content',page_slug)); END IF;
 IF node ? 'document' THEN node=jsonb_set(node,'{document}',pg_temp.transfer_legal_node(node->'document',page_slug)); END IF;
 RETURN node;
END;
$$;

DO $$
DECLARE page record; document jsonb; updated text;
BEGIN
 FOR page IN SELECT slug,body FROM content_pages WHERE slug IN('terms','privacy','cookies') AND body ILIKE '%barion%' LOOP
  document=NULL;
  BEGIN document=page.body::jsonb; EXCEPTION WHEN invalid_text_representation THEN document=NULL; END;
  IF document->>'format'='chocoleaf-document' THEN
   updated=pg_temp.transfer_legal_node(document,page.slug)::text;
  ELSE
   updated=replace(page.body,
    'Fizetés előre Barionon keresztül vagy helyszínen készpénzzel / azonnali átutalással.',
    'A weboldalon leadott workshopfoglalások és ajándékutalvány-rendelések fizetése előre, banki átutalással történik.');
   updated=replace(updated,
    'A Barion rendszer biztonságos, bankkártya-adatokat a Szolgáltató nem kezeli.',
    'Az átutaláshoz szükséges kedvezményezett, bankszámlaszám, összeg és közlemény a fizetési oldalon és a rendelésről küldött e-mailben található.');
   updated=replace(updated,
    'Ezen kívül az oldal a [Cookie-tájékoztatóban](/legal/cookies) részletezett harmadik felek (pl. Barion, Cal.com) technikailag szükséges sütijeit alkalmazza, amelyek bizonyos esetekben adatátvitellel járhatnak.',
    'A weboldalon jelenleg banki átutalással lehet fizetni. A weboldal bankkártyaadatokat nem kér és nem tárol. A sütikről és külső szolgáltatásokról a [Cookie-tájékoztatóban](/legal/cookies) található tájékoztatás.');
   updated=regexp_replace(updated,$pattern$^\|[^\r\n]*Barion[^\r\n]*\|\r?\n?$pattern$,'','gim');
  END IF;
  UPDATE content_pages SET body=updated WHERE slug=page.slug;
 END LOOP;
END;
$$;
DROP FUNCTION pg_temp.transfer_legal_node(jsonb,text);
