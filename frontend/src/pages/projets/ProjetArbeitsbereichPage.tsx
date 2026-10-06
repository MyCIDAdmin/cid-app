/**
 * Espace de travail interne d'un projet/action (2026-10-06) : aperçu, tâches (Kanban/liste) et
 * équipe. Visible uniquement de l'équipe du projet, des gestionnaires et — en lecture seule — du
 * service financier ; le serveur (apps.projets.permissions) fait foi, cette page ne fait que
 * refléter `projet.meine_rolle` / `darf_arbeitsbereich` / `darf_team_verwalten`. La
 * publication (Brouillon/Publié) se pilote ici pour la Direction et les gestionnaires.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import AufgabeModal from "../../components/projets/arbeitsbereich/AufgabeModal";
import KanbanBoard from "../../components/projets/arbeitsbereich/KanbanBoard";
import KostenTab from "../../components/projets/arbeitsbereich/KostenTab";
import TeamTab from "../../components/projets/arbeitsbereich/TeamTab";
import UebersichtTab from "../../components/projets/arbeitsbereich/UebersichtTab";
import SichtbarkeitBadge from "../../components/projets/SichtbarkeitBadge";
import StatutProjetBadge from "../../components/projets/StatutProjetBadge";
import { useAufgaben, useProjet, useSichtbarkeitAendern, useTeam } from "../../hooks/useProjets";
import type { Aufgabe, StatutAufgabe } from "../../types/projets";
import { extractApiErrorMessage } from "../../utils/apiError";

type Reiter = "uebersicht" | "aufgaben" | "kosten" | "team";

export default function ProjetArbeitsbereichPage() {
  const { t } = useTranslation("projets");
  const { id } = useParams<{ id: string }>();
  const projetQuery = useProjet(id);
  const projet = projetQuery.data;
  const darf = projet?.darf_arbeitsbereich === true;
  const aufgabenQuery = useAufgaben(darf ? id : undefined);
  const teamQuery = useTeam(darf ? id : undefined);
  const sichtbarkeit = useSichtbarkeitAendern();
  const [reiter, setReiter] = useState<Reiter>("aufgaben");
  const [dialog, setDialog] = useState<{ aufgabe: Aufgabe | null; status: StatutAufgabe } | null>(
    null,
  );
  const [erreur, setErreur] = useState("");

  if (projetQuery.isLoading) {
    return <p className="p-4 text-sm text-text-tertiary">{t("arbeitsbereich.laden")}</p>;
  }
  if (projetQuery.isError || !projet) {
    return <p className="p-4 text-sm text-status-dangerText">{t("arbeitsbereich.fehler_laden")}</p>;
  }
  if (!darf) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm text-text-secondary">{t("arbeitsbereich.nur_team")}</p>
        <Link to={`/projets/${projet.id}`} className="text-sm text-ca underline">
          {t("arbeitsbereich.zurueck")}
        </Link>
      </div>
    );
  }

  const bearbeitbar =
    projet.darf_team_verwalten ||
    projet.meine_rolle === "leitung" ||
    projet.meine_rolle === "mitarbeit";
  const veroeffentlicht = projet.sichtbarkeit === "veroeffentlicht";

  async function umschalten() {
    setErreur("");
    try {
      await sichtbarkeit.mutateAsync({
        id: projet!.id,
        sichtbarkeit: veroeffentlicht ? "entwurf" : "veroeffentlicht",
      });
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("arbeitsbereich.fehler")));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <Link to={`/projets/${projet.id}`} className="text-sm text-ca underline">
        {t("arbeitsbereich.zurueck")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-text-primary">{projet.titre}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatutProjetBadge statut={projet.statut} />
            <SichtbarkeitBadge sichtbarkeit={projet.sichtbarkeit} afficherPublie />
            <span className="text-xs text-text-tertiary">{t("arbeitsbereich.titel")}</span>
          </div>
        </div>
        {projet.darf_team_verwalten && (
          <button
            type="button"
            onClick={umschalten}
            disabled={sichtbarkeit.isPending}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
          >
            {veroeffentlicht
              ? t("arbeitsbereich.sichtbarkeit.zurueckziehen")
              : t("arbeitsbereich.sichtbarkeit.veroeffentlichen")}
          </button>
        )}
      </div>
      {!veroeffentlicht && (
        <p className="rounded-cid bg-status-warningBg p-2 text-xs text-status-warningText">
          {t("arbeitsbereich.sichtbarkeit.hinweis_entwurf")}
        </p>
      )}
      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}

      <div role="tablist" className="flex gap-1 border-b border-text-tertiary/20">
        {(["uebersicht", "aufgaben", "kosten", "team"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={reiter === r}
            onClick={() => setReiter(r)}
            className={`px-3 py-2 text-sm ${
              reiter === r
                ? "border-b-2 border-ca font-medium text-ca"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(`arbeitsbereich.tab.${r}`)}
          </button>
        ))}
      </div>

      {reiter === "uebersicht" && (
        <UebersichtTab projetId={projet.id} aufgaben={aufgabenQuery.data ?? []} />
      )}
      {reiter === "aufgaben" && (
        <KanbanBoard
          aufgaben={aufgabenQuery.data ?? []}
          team={teamQuery.data ?? []}
          bearbeitbar={bearbeitbar}
          onOeffnen={(aufgabe) => setDialog({ aufgabe, status: aufgabe.status })}
          onNeu={(status) => setDialog({ aufgabe: null, status })}
        />
      )}
      {reiter === "kosten" && (
        <KostenTab projetId={projet.id} aufgaben={aufgabenQuery.data ?? []} />
      )}
      {reiter === "team" && <TeamTab projetId={projet.id} verwalten={projet.darf_team_verwalten} />}

      {dialog && (
        <AufgabeModal
          key={dialog.aufgabe?.id ?? `neu-${dialog.status}`}
          projetId={projet.id}
          aufgabe={dialog.aufgabe}
          startStatus={dialog.status}
          team={teamQuery.data ?? []}
          bearbeitbar={bearbeitbar}
          kannLoeschen={projet.darf_team_verwalten}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
