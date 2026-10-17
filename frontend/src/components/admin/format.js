export const labels = {
  pending: "Függőben",
  confirmed: "Visszaigazolt",
  completed: "Teljesítve",
  cancelled: "Lemondva",
  "no-show": "Nem jelent meg",
  paid: "Fizetve",
  refunded: "Visszatérítve",
  failed: "Sikertelen",
};
export const money = (v) => Number(v || 0).toLocaleString("hu-HU") + " Ft";
export const dateTime = (v) =>
  v
    ? new Date(v).toLocaleString("hu-HU", {
        timeZone: "Europe/Budapest",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "–";
export const dayKey = (v) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(
    new Date(v),
  );
export function localInput(v) {
  return v
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Budapest",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(new Date(v))
        .replace(" ", "T")
    : "";
}
export function budapestISO(v) {
  if (!v) return "";
  let d = new Date(v + "Z");
  for (let i = 0; i < 2; i++) {
    const displayed = localInput(d);
    d = new Date(d.getTime() + (new Date(v + "Z") - new Date(displayed + "Z")));
  }
  if (localInput(d) !== v)
    throw Error("Ez a helyi idő az óraátállítás miatt nem létezik.");
  return d.toISOString();
}
