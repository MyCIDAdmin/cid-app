/**
 * "Mein Profil" (/mon-profil) — Container mit zwei Tabs (Wunsch vom 2026-10-07: "Einstellungen"
 * zieht aus dem Benutzermenü nach "Mein Profil" um): "Profil" (bisheriges Formular,
 * MembreFormPage im Profil-Modus) und "Einstellungen" (EinstellungenTab). Der Tab steht in
 * `?onglet=` (Standard "profil"), damit das Benutzermenü direkt auf die Einstellungen verlinken
 * kann.
 */
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import EinstellungenTab from "../../components/profil/EinstellungenTab";
import MembreFormPage from "./MembreFormPage";

const ONGLETS = ["profil", "einstellungen"] as const;
type Onglet = (typeof ONGLETS)[number];

export default function MonProfilPage() {
  const { t } = useTranslation("common");
  const [params, setParams] = useSearchParams();
  const roh = params.get("onglet");
  const onglet: Onglet = roh === "einstellungen" ? "einstellungen" : "profil";

  function waehlen(neu: Onglet) {
    setParams(neu === "profil" ? {} : { onglet: neu }, { replace: true });
  }

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-1 border-b border-text-tertiary/20">
        {ONGLETS.map((o) => (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={onglet === o}
            onClick={() => waehlen(o)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              onglet === o
                ? "border-ca text-ca"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(`mon_profil.onglet_${o}`)}
          </button>
        ))}
      </div>
      {onglet === "profil" ? <MembreFormPage /> : <EinstellungenTab />}
    </div>
  );
}
