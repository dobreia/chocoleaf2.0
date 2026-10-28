import { api } from "../api/courses";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import "../styles/TransferPage.css";

function formatMoney(amount, currency = "HUF") {
  if (amount == null || amount === "") return "-";
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return String(amount);

  try {
    return new Intl.NumberFormat("hu-HU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(numericAmount);
  } catch {
    return `${numericAmount} ${currency}`;
  }
}

function getKindLabel(kind) {
  if (kind === "booking") return "Típus: Foglalás";
  if (kind === "giftcard") return "Típus: Ajándékutalvány";
  return "Típus: Fizetés";
}

export default function TransferPage() {
  const [searchParams] = useSearchParams();
  const id = useMemo(
    () => (searchParams.get("id") || "").trim(),
    [searchParams],
  );
  const [transferInfo, setTransferInfo] = useState(null);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTransferInfo() {
      if (!id) {
        setIsLoading(false);
        setStatus({
          type: "bad",
          message:
            "Hiányzó azonosító (id). Kérlek a fizetés indítását az oldalról kezdd újra.",
        });
        return;
      }

      try {
        const data = await api(`/transfer-info?id=${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setTransferInfo(data);
          if (data.paid) setStatus({type:'ok',message:'A fizetés beérkezését már rögzítettük. Kérjük, ne utald el újra az összeget.'});
          if (!String(data.notice || "").trim()) {
            setStatus({
              type: "bad",
              message:
                "Nem érkezett közlemény a szervertől. Ne utalj, amíg nem javítottuk.",
            });
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setStatus({
            type: "bad",
            message:
              "Nem sikerült lekérni az utalási adatokat. Ellenőrizd a linket, vagy próbáld meg később.",
          });
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadTransferInfo();

    return () => controller.abort();
  }, [id]);

  async function copyValue(value) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus({ type: "ok", message: "Kimásolva a vágólapra." });
      window.setTimeout(() => setStatus({ type: "", message: "" }), 1300);
    } catch {
      setStatus({
        type: "bad",
        message: "Nem sikerült a másolás. Másold ki kézzel.",
      });
    }
  }

  const amountText = transferInfo
    ? formatMoney(transferInfo.amount, transferInfo.currency)
    : "-";
  const rows = transferInfo
    ? [
        ["Kedvezményezett", transferInfo.beneficiary, transferInfo.beneficiary],
        transferInfo.bankName && [
          "Bank",
          transferInfo.bankName,
          transferInfo.bankName,
        ],
        transferInfo.account && [
          "Számlaszám",
          transferInfo.account,
          transferInfo.account,
        ],
        transferInfo.iban && ["IBAN", transferInfo.iban, transferInfo.iban],
        transferInfo.swift && ["SWIFT", transferInfo.swift, transferInfo.swift],
        ["Összeg", amountText, amountText],
        [
          "Pénznem",
          transferInfo.currency || "HUF",
          transferInfo.currency || "HUF",
        ],
        [
          "Közlemény",
          String(transferInfo.notice || "").trim() || "-",
          String(transferInfo.notice || "").trim(),
        ],
      ].filter(Boolean)
    : [];

  return (
    <section className="transfer-page">
      <div className="transfer-top">
        <h1>Átutalásos fizetés</h1>
        <h2>
          Az alábbi adatokkal tudsz utalni. A <b>közleményt</b> kérlek másold
          pontosan, hogy gyorsan be tudjuk azonosítani.
        </h2>
      </div>
      <div className="transfer-divider"></div>

      <div className="transfer-container">
        <div className="transfer-card">
          <div className="transfer-grid">
            <div>
              <h3 className="transfer-section-title">Utalási adatok</h3>
              <p className="transfer-hint">
                Ha mobilbankot használsz, a "Másolás" gombbal könnyen
                beillesztheted a számlaszámot és a közleményt.
              </p>

              <div className="transfer-rows">
                {isLoading && (
                  <p className="transfer-loading">Adatok betöltése...</p>
                )}

                {rows.map(([label, value, rowCopyValue]) => (
                  <div className="transfer-row" key={label}>
                    <div className="transfer-key">{label}</div>
                    <div className="transfer-value">{value || "-"}</div>
                    {rowCopyValue ? (
                      <button
                        className="button-secondary"
                        type="button"
                        onClick={() => copyValue(rowCopyValue)}
                      >
                        Másolás
                      </button>
                    ) : (
                      <div></div>
                    )}
                  </div>
                ))}
              </div>

              {status.message && (
                <div
                  className={`transfer-status ${status.type}`}
                  role="status"
                  aria-live="polite"
                >
                  {status.message}
                </div>
              )}

              <div className="transfer-footerline">
                <div>
                  Azonosító: <span className="transfer-mono">{id || "-"}</span>
                </div>
                <div>
                  {transferInfo ? getKindLabel(transferInfo.kind) : "-"}
                </div>
              </div>

              <Link className="transfer-back" to={transferInfo?.kind==='booking'?'/courses':'/giftcards'}>
                {transferInfo?.kind==='booking'?'Vissza a képzésekhez':'Vissza az ajándékutalványhoz'}
              </Link>
            </div>

            <aside className="transfer-right">
              <h3>Összeg</h3>
              <div className="transfer-amount">{amountText}</div>
              <p className="transfer-small">
                A fizetendő összeg az aktuális foglaláshoz / utalványhoz.
              </p>

              <div className="transfer-steps">
                <div className="transfer-step">
                  <b>1) Utalás indítása</b>
                  <p>Írd be a kedvezményezettet és a számlaszámot / IBAN-t.</p>
                </div>
                <div className="transfer-step">
                  <b>2) Közlemény pontosan</b>
                  <p>
                    A közlemény alapján tudjuk a fizetést a foglalásodhoz kötni.
                  </p>
                </div>
                <div className="transfer-step">
                  <b>3) Feldolgozás</b>
                  <p>
                    Amint beérkezik az utalás, feldolgozzuk / visszajelzünk.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
