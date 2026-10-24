/**
 * Orientierung auf der Seite „Aufgabenkarten“ : Einstieg je Rolle, Jahresrhythmus („Was ist wann
 * zu tun?“) und Glossar der Vereinssprache. Die Texte stehen in help.json unter `orientierung`
 * (Konzept_Aufgabenkarten.md). Verweise auf Karten laufen über deren Kennung ; ein Klick filtert
 * die Kartenliste auf diese Karte.
 */
import { useTranslation } from "react-i18next";

import {
  liste,
  passtZumGlossar,
  type Glossarbegriff,
  type RhythmusZeitraum,
  type RollenEinstieg,
} from "../../components/layout/hilfeKarten";

interface Props {
  rolle: string;
  suche: string;
  /** Kennung → Titel aller Karten ; unbekannte Kennungen werden nicht angezeigt. */
  titel: Record<string, string>;
  onZeigeKarte: (id: string) => void;
}

function KartenLinks({
  ids,
  titel,
  onZeigeKarte,
}: {
  ids: string[];
  titel: Record<string, string>;
  onZeigeKarte: (id: string) => void;
}) {
  return (
    <span className="flex flex-wrap gap-1">
      {ids
        .filter((id) => titel[id])
        .map((id) => (
          <button
            key={id}
            type="button"
            title={titel[id]}
            onClick={() => onZeigeKarte(id)}
            className="rounded-full border border-text-tertiary/30 px-2 py-0.5 text-xs font-semibold text-ca hover:bg-bg-tertiary"
          >
            {id}
          </button>
        ))}
    </span>
  );
}

export default function OrientierungBereich({ rolle, suche, titel, onZeigeKarte }: Props) {
  const { t } = useTranslation("help");
  const einstieg = rolle
    ? (t(`orientierung.einstieg.rollen.${rolle}`, {
        returnObjects: true,
        defaultValue: "",
      }) as unknown as RollenEinstieg | "")
    : "";
  const zeitraeume = liste<RhythmusZeitraum>(
    t("orientierung.rhythmus.zeitraeume", { returnObjects: true }),
  );
  const begriffe = liste<Glossarbegriff>(
    t("orientierung.glossar.begriffe", { returnObjects: true }),
  ).filter((b) => passtZumGlossar(b, suche));

  return (
    <div className="no-print space-y-3">
      {einstieg && typeof einstieg === "object" && (
        <section
          aria-label={t("orientierung.einstieg.titre")}
          className="space-y-2 rounded-lg border border-ca/40 bg-bg-secondary p-3 text-sm"
        >
          <h2 className="text-sm font-bold text-text-primary">
            {t("orientierung.einstieg.titre")} · {t(`rollen.${rolle}`)}
          </h2>
          <p className="text-text-secondary">{einstieg.text}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">
              {t("orientierung.einstieg.karten_label")}:
            </span>
            <KartenLinks ids={einstieg.start} titel={titel} onZeigeKarte={onZeigeKarte} />
          </p>
        </section>
      )}

      <details className="rounded-lg border border-text-tertiary/20 bg-bg-secondary p-3 text-sm">
        <summary className="cursor-pointer font-bold text-text-primary">
          {t("orientierung.rhythmus.titre")}
        </summary>
        <p className="mt-2 text-xs text-text-secondary">{t("orientierung.rhythmus.intro")}</p>
        <div className="mt-2 space-y-3">
          {zeitraeume.map((z) => (
            <section key={z.wann}>
              <h3 className="text-xs font-bold uppercase text-text-tertiary">{z.wann}</h3>
              <ul className="mt-1 space-y-1.5">
                {z.aufgaben.map((a) => (
                  <li
                    key={a.text}
                    className="flex flex-wrap items-center gap-2 text-text-secondary"
                  >
                    <span>{a.text}</span>
                    <KartenLinks ids={a.karten} titel={titel} onZeigeKarte={onZeigeKarte} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>

      <details
        className="rounded-lg border border-text-tertiary/20 bg-bg-secondary p-3 text-sm"
        open={suche.trim() !== "" && begriffe.length > 0 ? true : undefined}
      >
        <summary className="cursor-pointer font-bold text-text-primary">
          {t("orientierung.glossar.titre")}
        </summary>
        <p className="mt-2 text-xs text-text-secondary">{t("orientierung.glossar.intro")}</p>
        <dl className="mt-2 space-y-2">
          {begriffe.map((b) => (
            <div key={b.begriff}>
              <dt className="font-semibold text-text-primary">{b.begriff}</dt>
              <dd className="text-text-secondary">{b.text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
