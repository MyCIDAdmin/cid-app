/** Ländersteckbrief : Einreise, Währung, Zeitverschiebung, Steckdose, amtliche Hinweise (mit Stand). */
import { useTranslation } from "react-i18next";

import FormatierterText from "../regionen/FormatierterText";
import { datumKurz } from "../../utils/reisen";
import type { Laenderprofil } from "../../types/reisen";
import { KARTE } from "./ui";

export default function Steckbrief({ profil }: { profil: Laenderprofil }) {
  const { t, i18n } = useTranslation("reisen");
  const zeilen: [string, string][] = [
    [t("steckbrief.waehrung"), profil.waehrung],
    [t("steckbrief.zeitverschiebung"), profil.zeitverschiebung],
    [t("steckbrief.steckdose"), profil.steckdose],
  ];
  return (
    <section
      className={`${KARTE} space-y-2`}
      aria-label={t("steckbrief.titel", { land: profil.land })}
    >
      <h2 className="text-sm font-semibold">{t("steckbrief.titel", { land: profil.land })}</h2>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {zeilen
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-text-tertiary">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {profil.einreise && (
        <div>
          <h3 className="text-xs font-semibold">{t("steckbrief.einreise")}</h3>
          <FormatierterText text={profil.einreise} />
        </div>
      )}
      {profil.amtliche_hinweise && (
        <p className="text-xs">
          <b>{t("steckbrief.amtlich")}:</b> {profil.amtliche_hinweise}
        </p>
      )}
      {profil.weitere_infos && <FormatierterText text={profil.weitere_infos} />}
      <p className="text-[11px] text-text-tertiary">
        {t("steckbrief.stand", { datum: datumKurz(profil.stand, i18n.language) })} ·{" "}
        {t("steckbrief.haftung")}
      </p>
    </section>
  );
}
