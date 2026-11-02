import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useKandidaturen } from "../../hooks/useWahlen";
import type { Kandidatur, Wahl } from "../../types/wahlen";
import EinspruchFormular from "./EinspruchFormular";

function EinspruchKnopf({ wahl, k }: { wahl: Wahl; k: Kandidatur }) {
  const { t } = useTranslation("wahlen");
  const [offen, setOffen] = useState(false);
  const imFenster = k.einspruch_bis && new Date(k.einspruch_bis).getTime() > Date.now();
  if (!imFenster || wahl.ist_ausschuss || wahl.meine_kandidatur === k.id) return null;
  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} className="text-xs text-ca underline">
        {t("einspruch.einlegen_waehlbarkeit")}
      </button>
    );
  }
  return (
    <EinspruchFormular wahl={wahl.id} art="waehlbarkeit" kandidatur={k.id} bis={k.einspruch_bis} />
  );
}

/** Zugelassene Kandidaturen, sichtbar ab der Kampagne (öffentliche Sicht des Servers). */
export default function KandidatenTab({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const kandidaturen = useKandidaturen(wahl.id, wahl.phase >= 3);
  const zugelassen = (kandidaturen.data ?? []).filter((k) => k.status === "zugelassen");

  if (wahl.phase < 3) {
    return <p className="text-sm text-text-secondary">{t("kandidaten.noch_nicht")}</p>;
  }
  if (zugelassen.length === 0 && !kandidaturen.isLoading) {
    return <p className="text-sm text-text-secondary">{t("kandidaten.leer")}</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="kandidaten">
      {zugelassen.map((k) => (
        <li key={k.id} className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h3 className="font-semibold text-text-primary">
            {k.name || k.personen.map((p) => p.name).join(", ")}
          </h3>
          {k.leitsatz && <p className="text-sm italic text-text-secondary">„{k.leitsatz}“</p>}
          <ul className="flex flex-wrap gap-3">
            {k.personen.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                {p.foto && (
                  <img src={p.foto} alt="" className="h-10 w-10 rounded-full object-cover" />
                )}
                <span>
                  {p.name}
                  <br />
                  <span className="text-text-tertiary">{t(`amt.${p.amt}`)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-text-secondary">{k.vorstellung}</p>
          {k.programm.filter((z) => z.trim()).length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {k.programm
                .filter((z) => z.trim())
                .map((z, i) => (
                  <li key={i}>{z}</li>
                ))}
            </ul>
          )}
          <EinspruchKnopf wahl={wahl} k={k} />
        </li>
      ))}
    </ul>
  );
}
