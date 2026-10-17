import { useState } from "react";
import { api } from "../api/courses";
import PageHeader from "../components/PageHeader";
import { Field, SaveForm, Notice } from "../components/admin/UI";

import "../styles/AdminWorkspace.css";
export default function InquiryPage({ quote = false }) {
  const [d, setD] = useState({
      name: "",
      email: "",
      phone: "",
      subject: quote ? "Egyedi ajánlatkérés" : "Kapcsolatfelvétel",
      message: "",
    }),
    [sent, setSent] = useState("");
  return (
    <section className="page-section">
      <PageHeader
        title={quote ? "Ajánlatkérés" : "Kapcsolat"}
        description={
          quote
            ? "Egyedi csokoládék, torták és műhelyprogramok"
            : "Beszéljük meg, miben segíthetünk."
        }
      />
      <div className="container page-content" style={{ maxWidth: 800 }}>
        <p>
          <a href="mailto:info@chocoleaf.hu">info@chocoleaf.hu</a> ·{" "}
          <a href="tel:+36203734023">+36 20 373 4023</a>
        </p>
        <p>1039 Budapest, Huba utca 3.</p>
        {quote && (
          <p>
            Édességrendelést minimum egyhetes elkészítési határidővel tudunk
            vállalni. Írd meg az elképzelésed, a mennyiséget és a kívánt
            átvételi dátumot.
          </p>
        )}
        <Notice message={sent} />
        <SaveForm
          label="Üzenet elküldése"
          onSave={async () => {
            const r = await api("/inquiries", { method: "POST", body: d });
            setSent(r.message);
            setD({ ...d, message: "" });
          }}
        >
          {[
            ["name", "Név", "text"],
            ["email", "Email", "email"],
            ["phone", "Telefon", "tel"],
            ["subject", "Tárgy", "text"],
          ].map(([k, l, t]) => (
            <Field
              key={k}
              label={l}
              type={t}
              required={k !== "phone"}
              value={d[k]}
              onChange={(e) => setD({ ...d, [k]: e.target.value })}
            />
          ))}
          <Field label="Üzenet">
            <textarea
              rows="6"
              required
              maxLength={6000}
              value={d.message}
              onChange={(e) => setD({ ...d, message: e.target.value })}
            />
          </Field>
          <p>
            Az adatkezelés részleteit az{" "}
            <a href="/legal/privacy">adatkezelési tájékoztatóban</a> találod.
          </p>
        </SaveForm>
      </div>
    </section>
  );
}
