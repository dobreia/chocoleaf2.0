import { useEffect, useRef, useState } from "react";
export function Field({ label, children, ...p }) {
  return (
    <label className="cl-field">
      <span>{label}</span>
      {children || <input {...p} />}
    </label>
  );
}
export function Notice({ error, message }) {
  return (
    <>
      {error && (
        <p role="alert" className="cl-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="cl-success">
          {message}
        </p>
      )}
    </>
  );
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog className="cl-dialog" ref={ref} onCancel={onClose}>
      <div className="cl-modal-title">
        <h2>{title}</h2>
        <button type="button" aria-label="Bezárás" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SaveForm({ onSave, children, label = "Mentés", disabled = false }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || disabled) return;
        setBusy(true);
        setError("");
        try {
          await onSave();
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Notice error={error} />
      <fieldset disabled={busy}>
        {children}
        <button className="cl-primary" type="submit" disabled={disabled}>
          {busy ? "Mentés…" : label}
        </button>
      </fieldset>
    </form>
  );
}
