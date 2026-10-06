import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useTeam,
  useTeamEntfernen,
  useTeamHinzufuegen,
  useTeamRolleAendern,
} from "../../../hooks/useProjets";
import type { MembreListItem } from "../../../types/membre";
import type { RolleProjet } from "../../../types/projets";
import { extractApiErrorMessage } from "../../../utils/apiError";
import MembreSearchPicker from "../../membres/MembreSearchPicker";

const ROLLEN: RolleProjet[] = ["leitung", "mitarbeit", "beobachter"];

/** Équipe interne du projet (2026-10-06) — gestion réservée à la Direction/gestionnaires ;
 * le serveur refuse de toute façon retirer ou rétrograder la dernière Direction. */
export default function TeamTab({ projetId, verwalten }: { projetId: string; verwalten: boolean }) {
  const { t } = useTranslation("projets");
  const team = useTeam(projetId);
  const hinzufuegen = useTeamHinzufuegen();
  const rolleAendern = useTeamRolleAendern();
  const entfernen = useTeamEntfernen();
  const [auswahl, setAuswahl] = useState<MembreListItem | null>(null);
  const [rolle, setRolle] = useState<RolleProjet>("mitarbeit");
  const [erreur, setErreur] = useState("");

  async function aktion(fn: () => Promise<unknown>) {
    setErreur("");
    try {
      await fn();
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("arbeitsbereich.fehler")));
    }
  }

  return (
    <div className="space-y-3">
      {!verwalten && (
        <p className="text-xs text-text-tertiary">{t("arbeitsbereich.team.nur_lesen")}</p>
      )}
      {team.data?.map((m) => (
        <div
          key={m.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-cid bg-bg-primary p-2 shadow-sm"
        >
          <span className="text-sm text-text-primary">
            {m.membre_detail ? `${m.membre_detail.prenom} ${m.membre_detail.nom}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <select
              aria-label={t("arbeitsbereich.team.rolle_von", {
                name: m.membre_detail ? `${m.membre_detail.prenom} ${m.membre_detail.nom}` : "",
              })}
              value={m.rolle}
              disabled={!verwalten}
              onChange={(e) =>
                aktion(() =>
                  rolleAendern.mutateAsync({ id: m.id, rolle: e.target.value as RolleProjet }),
                )
              }
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
            >
              {ROLLEN.map((r) => (
                <option key={r} value={r}>
                  {t(`arbeitsbereich.rolle.${r}`)}
                </option>
              ))}
            </select>
            {verwalten && (
              <button
                type="button"
                onClick={() => aktion(() => entfernen.mutateAsync(m.id))}
                className="text-sm text-status-dangerText"
              >
                {t("arbeitsbereich.team.entfernen")}
              </button>
            )}
          </div>
        </div>
      ))}
      {verwalten && (
        <div className="space-y-2 rounded-cid-lg border border-text-tertiary/20 p-3">
          <h3 className="text-xs font-semibold uppercase text-text-secondary">
            {t("arbeitsbereich.team.hinzufuegen")}
          </h3>
          <MembreSearchPicker
            selection={auswahl}
            onSelect={setAuswahl}
            placeholder={t("arbeitsbereich.team.mitglied_suchen")}
          />
          <div className="flex items-center gap-2">
            <select
              aria-label={t("arbeitsbereich.team.rolle")}
              value={rolle}
              onChange={(e) => setRolle(e.target.value as RolleProjet)}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
            >
              {ROLLEN.map((r) => (
                <option key={r} value={r}>
                  {t(`arbeitsbereich.rolle.${r}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!auswahl || hinzufuegen.isPending}
              onClick={() =>
                auswahl &&
                aktion(async () => {
                  await hinzufuegen.mutateAsync({ projet: projetId, membre: auswahl.id, rolle });
                  setAuswahl(null);
                })
              }
              className="rounded-cid bg-ca px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("arbeitsbereich.team.hinzufuegen")}
            </button>
          </div>
        </div>
      )}
      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
    </div>
  );
}
