import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";

export default function NotFoundPage() {
  return (
    <section className="page-section">
      <PageHeader
        title="Az oldal nem található"
        description="Lehet, hogy a hivatkozás megváltozott. Válassz az alábbi lehetőségek közül."
      />
      <div className="container page-content not-found-actions">
        <Link className="button-link" to="/">
          Vissza a főoldalra
        </Link>
        <Link className="button-link button-link--secondary" to="/courses">
          Képzések megnyitása
        </Link>
      </div>
    </section>
  );
}
