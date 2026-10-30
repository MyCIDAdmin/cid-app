/**
 * Monatsraster und Liste des Kalenders (Release 15). Die Woche beginnt am Montag ; mehrtägige
 * Einträge erscheinen an jedem Tag. Texte in der gewählten Sprache (DeepL, `uebersetzt`).
 */
import { useTranslation } from "react-i18next";

import type { KalenderEintrag } from "../../types/kalender";
import {
  KATEGORIE_STIL,
  formatZeit,
  gruppiereNachTag,
  monatsRaster,
  tagSchluessel,
} from "../../utils/kalender";
import { uebersetzt } from "../../utils/uebersetzung";
import TerminIcon from "./TerminIcon";

interface Props {
  eintraege: KalenderEintrag[];
  monat: Date;
  modus: "monat" | "liste";
  onWaehle: (eintrag: KalenderEintrag) => void;
}

function Chip({ eintrag, onWaehle }: { eintrag: KalenderEintrag; onWaehle: Props["onWaehle"] }) {
  const { t } = useTranslation("kalender");
  const vorschlag = eintrag.status === "vorgeschlagen";
  return (
    <button
      type="button"
      onClick={() => onWaehle(eintrag)}
      title={`${t(`kategorie.${eintrag.kategorie}`)} · ${uebersetzt(eintrag, "titel")}`}
      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-start text-[11px] font-medium ${
        KATEGORIE_STIL[eintrag.kategorie] ?? KATEGORIE_STIL.sonstiges
      } ${vorschlag ? "border border-dashed border-text-tertiary" : ""} ${
        eintrag.ausgeblendet ? "line-through opacity-50" : ""
      }`}
    >
      <TerminIcon eintrag={eintrag} size={12} />
      <span className="min-w-0 flex-1 truncate">
        {eintrag.wichtig && "★ "}
        {eintrag.ausgeblendet && `${t("ausgeblendet_kurz")} · `}
        {vorschlag && `${t("status.vorgeschlagen_kurz")} · `}
        {uebersetzt(eintrag, "titel")}
      </span>
    </button>
  );
}

export default function KalenderAnsicht({ eintraege, monat, modus, onWaehle }: Props) {
  const { t, i18n } = useTranslation("kalender");
  const proTag = gruppiereNachTag(eintraege);
  const { tage } = monatsRaster(monat);
  const heute = tagSchluessel(new Date());

  if (modus === "liste") {
    const sichtbareTage = tage.filter(
      (tag) => tag.getMonth() === monat.getMonth() && proTag.has(tagSchluessel(tag)),
    );
    if (sichtbareTage.length === 0) {
      return <p className="text-sm text-text-tertiary">{t("leer")}</p>;
    }
    return (
      <div className="space-y-3" data-testid="kalender-liste">
        {sichtbareTage.map((tag) => (
          <section key={tagSchluessel(tag)}>
            <h3 className="mb-1 text-xs font-bold uppercase text-text-tertiary">
              {tag.toLocaleDateString(i18n.language, {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </h3>
            <ul className="space-y-1">
              {(proTag.get(tagSchluessel(tag)) ?? []).map((e) => (
                <li key={`${e.id}-${tagSchluessel(tag)}`}>
                  <button
                    type="button"
                    onClick={() => onWaehle(e)}
                    className={`flex w-full items-center gap-3 rounded-cid-lg bg-bg-primary p-2 text-start shadow-sm hover:bg-bg-secondary ${
                      e.ausgeblendet ? "opacity-50" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        KATEGORIE_STIL[e.kategorie] ?? KATEGORIE_STIL.sonstiges
                      }`}
                    >
                      <TerminIcon eintrag={e} size={13} />
                      {t(`kategorie.${e.kategorie}`)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text-primary">
                        {e.wichtig && "★ "}
                        {e.ausgeblendet && `${t("ausgeblendet_kurz")} · `}
                        {uebersetzt(e, "titel")}
                      </span>
                      <span className="block truncate text-xs text-text-secondary">
                        {formatZeit(e, i18n.language)}
                        {e.ort ? ` · ${uebersetzt(e, "ort") || e.ort}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  const wochentage = tage.slice(0, 7);
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7 gap-px rounded-cid-lg bg-bg-tertiary p-px">
        {wochentage.map((tag) => (
          <div
            key={tag.getDay()}
            className="bg-bg-secondary p-1 text-center text-[11px] font-bold text-text-tertiary"
          >
            {tag.toLocaleDateString(i18n.language, { weekday: "short" })}
          </div>
        ))}
        {tage.map((tag) => {
          const schluessel = tagSchluessel(tag);
          const liste = proTag.get(schluessel) ?? [];
          const ausserhalb = tag.getMonth() !== monat.getMonth();
          return (
            <div
              key={schluessel}
              className={`min-h-[84px] bg-bg-primary p-1 ${ausserhalb ? "opacity-50" : ""}`}
            >
              <div
                className={`mb-0.5 text-[11px] ${
                  schluessel === heute
                    ? "inline-block rounded-full bg-ca px-1.5 font-bold text-white"
                    : "text-text-tertiary"
                }`}
              >
                {tag.getDate()}
              </div>
              <div className="space-y-0.5">
                {liste.slice(0, 3).map((e) => (
                  <Chip key={`${e.id}-${schluessel}`} eintrag={e} onWaehle={onWaehle} />
                ))}
                {liste.length > 3 && (
                  <div className="text-[10px] text-text-tertiary">
                    {t("weitere", { count: liste.length - 3 })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
