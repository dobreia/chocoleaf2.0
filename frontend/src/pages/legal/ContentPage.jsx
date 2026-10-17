import { useEffect, useState } from "react";
import { api } from "../../api/courses";
import PageHeader from "../../components/PageHeader";
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
          <div style={{ whiteSpace: "pre-wrap" }}>{d.body}</div>
        ) : (
          <p>Betöltés…</p>
        )}
      </div>
    </section>
  );
}
