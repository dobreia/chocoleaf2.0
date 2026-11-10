import { useEffect, useState } from "react";
import { api } from "../../api/courses";
import PageHeader from "../../components/PageHeader";
import DocumentText from '../../components/DocumentText';
import '../../styles/LegalDocument.css';
export default function ContentPage({ slug, title }) {
  const [d, setD] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/content/" + slug)
      .then(setD)
      .catch((e) => setError(e.message));
  }, [slug]);
  return (
    <section className="page-section">
      <PageHeader title={d?.title || title} />
      <div className="container page-content">
        {error ? (
          <p role="status">{error}</p>
        ) : d ? (
          <DocumentText text={d.body}/>
        ) : (
          <p>Betöltés…</p>
        )}
      </div>
    </section>
  );
}
