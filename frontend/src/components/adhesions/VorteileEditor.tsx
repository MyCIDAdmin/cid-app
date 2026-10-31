/**
 * Editor für die Vorteile eines Angebots in der Kampagnenverwaltung (Release 2026.11). Jeder
 * Vorteil hat einen Text, ein Symbol und optional ein Ziel (Seite der App, zu der die Kachel auf
 * „Meine Mitgliedschaft“ führt). Die Reihenfolge lässt sich verschieben ; darunter steht eine
 * Vorschau der Kacheln, so wie das Mitglied sie sieht. Speichern übernimmt der Aufrufer.
 */
import { useTranslation } from "react-i18next";

import type { AvantageOffre } from "../../types/adhesion";
import VorteileKacheln from "./VorteileKacheln";
import VorteilSymbol from "./VorteilSymbol";
import { VORTEIL_SYMBOLE, VORTEIL_ZIELE, vorteileFuerSpeichern } from "./vorteile";

const FELD = "rounded-cid border border-text-tertiary/30 px-1.5 py-1 text-xs disabled:opacity-40";
const MINI =
  "rounded-cid border border-text-tertiary/30 px-1.5 py-0.5 text-xs text-text-secondary hover:bg-bg-tertiary disabled:opacity-30";

export default function VorteileEditor({
  werte,
  onChange,
  disabled = false,
}: {
  werte: AvantageOffre[];
  onChange: (neu: AvantageOffre[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("adhesions");

  const nummerieren = (liste: AvantageOffre[]) => liste.map((v, i) => ({ ...v, ordre: i + 1 }));
  const aendern = (i: number, teil: Partial<AvantageOffre>) =>
    onChange(werte.map((v, j) => (j === i ? { ...v, ...teil } : v)));
  const verschieben = (i: number, richtung: -1 | 1) => {
    const ziel = i + richtung;
    if (ziel < 0 || ziel >= werte.length) return;
    const kopie = werte.slice();
    [kopie[i], kopie[ziel]] = [kopie[ziel], kopie[i]];
    onChange(nummerieren(kopie));
  };
  const entfernen = (i: number) => onChange(nummerieren(werte.filter((_, j) => j !== i)));
  const hinzufuegen = () =>
    onChange([...werte, { ordre: werte.length + 1, texte_fr: "", icone: "", ziel: "" }]);

  const vorschau = vorteileFuerSpeichern(werte);

  return (
    <div className="space-y-2">
      {werte.length === 0 && <p className="text-[11px] text-text-tertiary">{t("vorteile.leer")}</p>}
      <ul className="space-y-1.5">
        {werte.map((v, i) => (
          <li key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cal text-ca">
              <VorteilSymbol name={v.icone} className="h-4 w-4" />
            </span>
            <select
              aria-label={`${t("vorteile.symbol_label")} ${i + 1}`}
              value={v.icone || "check"}
              onChange={(e) => aendern(i, { icone: e.target.value })}
              disabled={disabled}
              className={FELD}
            >
              {VORTEIL_SYMBOLE.map((s) => (
                <option key={s} value={s}>
                  {t(`vorteile.symbol.${s}`)}
                </option>
              ))}
            </select>
            <input
              aria-label={`${t("vorteile.text_label")} ${i + 1}`}
              value={v.texte_fr}
              maxLength={200}
              placeholder={t("admin_offres.avantages_placeholder")}
              onChange={(e) => aendern(i, { texte_fr: e.target.value })}
              disabled={disabled}
              className={`${FELD} min-w-[10rem] flex-1`}
            />
            <select
              aria-label={`${t("vorteile.ziel_label")} ${i + 1}`}
              value={v.ziel ?? ""}
              onChange={(e) => aendern(i, { ziel: e.target.value })}
              disabled={disabled}
              className={FELD}
            >
              <option value="">{t("vorteile.ziel_keines")}</option>
              {(Object.keys(VORTEIL_ZIELE) as (keyof typeof VORTEIL_ZIELE)[]).map((z) => (
                <option key={z} value={z}>
                  {t(`vorteile.ziel.${z}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={MINI}
              disabled={disabled || i === 0}
              aria-label={`${t("vorteile.hoch")} ${i + 1}`}
              onClick={() => verschieben(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={MINI}
              disabled={disabled || i === werte.length - 1}
              aria-label={`${t("vorteile.runter")} ${i + 1}`}
              onClick={() => verschieben(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className={`${MINI} hover:text-status-dangerText`}
              disabled={disabled}
              aria-label={`${t("vorteile.entfernen")} ${i + 1}`}
              onClick={() => entfernen(i)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={MINI} disabled={disabled} onClick={hinzufuegen}>
        {t("vorteile.hinzufuegen")}
      </button>

      {vorschau.length > 0 && (
        <div className="border-t border-text-tertiary/10 pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
            {t("vorteile.vorschau")}
          </div>
          <VorteileKacheln vorteile={vorschau} ohneLinks />
        </div>
      )}
    </div>
  );
}
