import PageHeader from "../components/PageHeader";
export default function AboutPage() {
  return (
    <section className="page-section">
      <PageHeader title="Rólam" description="A ChocoLeaf története" />
      <div className="container page-content">
        {" "}
        <p>
          Gyerekkorom óta a konyhában érzem magam igazán otthon. Már 10 évesen
          tökélyre fejlesztettem a kókuszgolyót, később pedig a nagymamámtól
          megtanultam a család féltve őrzött süteményreceptjeit. A sütés
          szeretete azóta is végigkíséri az életemet.
          <br />
          Az édességek iránti szenvedélyem 2015-ben kapott új lendületet, amikor
          egy bonbonkészítő tanfolyamon rájöttem: a csokoládé nem csak édesség -{" "}
          <strong>alkotás, élmény és művészet.</strong> Azóta folyamatosan
          tanulok, kísérletezek és új ízeket fedezek fel.
          <br />
          Hogy a lehető legmagasabb szinten készíthessek egyedi desszerteket,
          2019-ben elvégeztem a Cukrász OKJ képzést, majd{" "}
          <strong>
            2023-ban a Magyar Agrár- és Élettudományi Egyetem csokoládé-, kávé-
            és teakészítő mester szaktanácsadó képzését is.
          </strong>
          <br />
          Számomra minden desszert egy történet. Egy születésnap, egy esküvő,
          egy meglepetés vagy egy különleges pillanat része.
        </p>
        <a className="button-link" href="/contact">
          Kapcsolatfelvétel
        </a>
      </div>
    </section>
  );
}
