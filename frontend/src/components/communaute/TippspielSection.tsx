/**
 * Tippspiel — module Fan-Club, onglet Ticker (2026-09-24, retour utilisateur complet en
 * tête de apps.communaute.models.py côté backend). Placé dans l'onglet "Ticker" comme
 * demandé ("zum Modul Fan-Club hinzufügen im Tab 'Ticker'"), visible dès qu'un Tippspiel
 * est publié ("Anzeigbar nachdem es eingestellt und veröffentlicht wird" — un membre
 * standard ne reçoit d'ailleurs jamais un Tippspiel `brouillon`, voir
 * TippspielViewSet.get_queryset côté backend, ce composant n'a donc pas besoin de le
 * filtrer lui-même). N'affiche que le Tippspiel le plus récent (`useTippspiele()` est
 * trié `-created_at` côté backend) — cas d'usage réel "typiquement un par saison" (voir
 * docstring de tête Tippspiel).
 *
 * La confirmation des paiements en attente (`ZahlungenPanel`) a été RETIRÉE d'ici le
 * 2026-09-24 (retour utilisateur : "Die Ausstehende Zahlung ... soll im Modul
 * 'Ausstehende Zahlungen' auftauchen ... und nicht im Fan-Club Modul") — voir désormais
 * `TippspielZahlungenPanel` dans `pages/cotisations/CotisationsEnAttentePage.tsx`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useModifierTippspiel,
  useTeilnehmenTippspiel,
  useTippspielTeilnahmen,
  useTippspiele,
} from "../../hooks/useCommunaute";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { StatutTippspiel, Tippspiel } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";
import ShareButton from "../ui/ShareButton";
import TippspielAdminForm from "./TippspielAdminForm";
import TippspielTippAbgabe from "./TippspielTippAbgabe";

const BADGE_STATUT: Record<StatutTippspiel, string> = {
  brouillon: "bg-bg-secondary text-text-tertiary",
  publie: "bg-status-successBg text-status-successText",
  cloture: "bg-bg-secondary text-text-tertiary",
};

function PreisLigne({ prix }: { prix: Tippspiel["prix"][number] }) {
  const { t } = useTranslation("communaute");
  let detail = "";
  if (prix.type_prix === "montant_fixe" && prix.montant) {
    detail = t("tippspiel.preis_betrag", { betrag: prix.montant });
  } else if (prix.type_prix === "pourcentage" && prix.pourcentage) {
    detail = t("tippspiel.preis_prozent", { prozent: prix.pourcentage });
  } else if (prix.type_prix === "produit") {
    detail = t("tippspiel.preis_produkt_hinweis");
  }
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="font-medium text-text-primary">
        {t("tippspiel.preis_platz", { platz: prix.platz })}
      </span>
      <span className="text-text-tertiary">{detail}</span>
    </li>
  );
}

function TippspielAffichage({ tippspiel }: { tippspiel: Tippspiel }) {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const peutGerer = hasRoleAtLeast(user, ROLE_LEVELS.super_admin);
  const estPayant = tippspiel.montant_participation !== null;

  const [modifierForm, setModifierForm] = useState(false);

  const meineTeilnahmeQuery = useTippspielTeilnahmen({ tippspiel: tippspiel.id, mine: true });
  const classementQuery = useTippspielTeilnahmen({ tippspiel: tippspiel.id });
  const teilnehmen = useTeilnehmenTippspiel();
  const modifierStatut = useModifierTippspiel();
  const [erreurTeilnahme, setErreurTeilnahme] = useState("");

  const meineTeilnahme = meineTeilnahmeQuery.data?.results[0];
  const classement = classementQuery.data?.results ?? [];

  if (modifierForm) {
    return <TippspielAdminForm tippspiel={tippspiel} onTermine={() => setModifierForm(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-text-primary">{tippspiel.titre}</h2>
            <p className="text-xs text-text-tertiary">
              {t("tippspiel.saison_label", { saison: tippspiel.saison })}
              {" · "}
              {estPayant
                ? t("tippspiel.teilnahmebeitrag_label", {
                    betrag: tippspiel.montant_participation,
                  })
                : t("tippspiel.kostenlos")}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${BADGE_STATUT[tippspiel.statut]}`}
            >
              {t(`tippspiel.badge_${tippspiel.statut}`)}
            </span>
            {/* Social-Media-Teilen (2026-09-24, Bug-Report "Es muss möglich sein, Tippspiel
                in Social Media zu teilen") — `path="/live"` reicht : le Tippspiel vit dans
                l'onglet "Ticker" du module Fan-Club, qui est l'onglet par défaut de
                LiveMatchPage (pas de synchronisation d'onglet via l'URL, voir
                LiveMatchPage.tsx), donc atterrir sur /live suffit à voir le Tippspiel. */}
            <ShareButton path="/live" titre={tippspiel.titre} />
          </div>
        </div>

        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-medium text-text-secondary">
            {t("tippspiel.regeln_titel")}
          </summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-text-tertiary">
            <li>{t("tippspiel.punkte_exakt")}</li>
            <li>{t("tippspiel.punkte_tordifferenz")}</li>
            <li>{t("tippspiel.punkte_tendenz")}</li>
          </ul>
          {tippspiel.regles && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-text-tertiary">
              {tippspiel.regles}
            </p>
          )}
        </details>

        {tippspiel.prix.length > 0 && (
          <div className="mt-2 border-t border-text-tertiary/10 pt-2">
            <h3 className="mb-1 text-xs font-bold uppercase text-text-tertiary">
              {t("tippspiel.preise_titel")}
            </h3>
            <ul className="space-y-1">
              {tippspiel.prix.map((prix) => (
                <PreisLigne key={prix.id} prix={prix} />
              ))}
            </ul>
          </div>
        )}

        {peutGerer && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-text-tertiary/10 pt-2">
            <button
              type="button"
              onClick={() => setModifierForm(true)}
              className="rounded-cid bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-cal"
            >
              {t("tippspiel.admin_bearbeiten")}
            </button>
            {tippspiel.statut === "brouillon" && (
              <button
                type="button"
                onClick={() =>
                  modifierStatut.mutate({ id: tippspiel.id, payload: { statut: "publie" } })
                }
                className="rounded-cid bg-ca px-2.5 py-1 text-xs font-medium text-white hover:bg-cad"
              >
                {t("tippspiel.admin_veroeffentlichen")}
              </button>
            )}
            {tippspiel.statut === "publie" && (
              <button
                type="button"
                onClick={() =>
                  modifierStatut.mutate({ id: tippspiel.id, payload: { statut: "cloture" } })
                }
                className="rounded-cid bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-cal"
              >
                {t("tippspiel.admin_schliessen")}
              </button>
            )}
          </div>
        )}
      </div>

      {tippspiel.statut !== "brouillon" && (
        <>
          <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            {!meineTeilnahme ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-text-tertiary">
                  {t("tippspiel.status_nicht_angemeldet")}
                </p>
                <button
                  type="button"
                  disabled={teilnehmen.isPending || tippspiel.statut === "cloture"}
                  onClick={() => {
                    setErreurTeilnahme("");
                    teilnehmen.mutate(tippspiel.id, {
                      onError: (err) =>
                        setErreurTeilnahme(
                          extractApiErrorMessage(err, t("tippspiel.teilnahme_fehler")),
                        ),
                    });
                  }}
                  className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
                >
                  {t("tippspiel.teilnehmen_button")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-text-primary">
                {meineTeilnahme.statut_paiement === "en_attente"
                  ? t("tippspiel.status_en_attente")
                  : t("tippspiel.status_bestaetigt")}
              </p>
            )}
            {erreurTeilnahme && (
              <p className="mt-1.5 text-xs text-status-dangerText">{erreurTeilnahme}</p>
            )}
          </div>

          {tippspiel.statut === "publie" && meineTeilnahme && (
            <>
              {meineTeilnahme.statut_paiement === "en_attente" ? (
                // Retour utilisateur du 2026-09-24 : "Für Beitragspflichtige Spiele,
                // müssen Tipps verfügbar sein, nachdem die Bezahlung bestätigt wird" —
                // les pronostics restent masqués tant que le paiement n'est pas
                // confirmé (voir aussi TippspielTipSerializer.create côté backend, qui
                // applique la même règle en seconde ligne de défense).
                <p className="rounded-cid-lg bg-bg-primary p-3 text-sm text-text-tertiary shadow-sm">
                  {t("tippspiel.tipps_gesperrt_zahlung")}
                </p>
              ) : (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase text-text-tertiary">
                    {t("tippspiel.tipps_titel")}
                  </h3>
                  <TippspielTippAbgabe tippspielId={tippspiel.id} />
                </div>
              )}
            </>
          )}

          <div className="rounded-cid-lg bg-bg-primary shadow-sm">
            <h3 className="px-3 pt-3 text-xs font-bold uppercase text-text-tertiary">
              {t("tippspiel.klassement_titel")}
            </h3>
            {classement.length === 0 ? (
              <p className="px-3 pb-3 pt-1 text-sm text-text-tertiary">
                {t("tippspiel.klassement_leer")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-text-tertiary">
                    <th className="px-3 py-2">{t("tippspiel.klassement_platz")}</th>
                    <th className="px-3 py-2">{t("tippspiel.klassement_mitglied")}</th>
                    <th className="px-3 py-2 text-right">{t("tippspiel.klassement_punkte")}</th>
                  </tr>
                </thead>
                <tbody>
                  {classement.map((ligne, index) => (
                    <tr key={ligne.id} className="border-t border-text-tertiary/10">
                      <td className="px-3 py-2 tabular-nums">{index + 1}</td>
                      <td className="px-3 py-2">{ligne.membre_nom}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {ligne.total_points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function TippspielSection() {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const peutGerer = hasRoleAtLeast(user, ROLE_LEVELS.super_admin);
  const [creerForm, setCreerForm] = useState(false);

  const tippspieleQuery = useTippspiele();
  const dernier = tippspieleQuery.data?.results[0];

  if (tippspieleQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("tippspiel.chargement")}</p>;
  }
  if (tippspieleQuery.isError) {
    return <p className="text-sm text-status-dangerText">{t("tippspiel.erreur_chargement")}</p>;
  }

  if (creerForm) {
    return <TippspielAdminForm onTermine={() => setCreerForm(false)} />;
  }

  if (!dernier) {
    if (!peutGerer) return null;
    return (
      <div className="rounded-cid-lg bg-bg-primary p-3 text-center shadow-sm">
        <p className="mb-2 text-sm text-text-tertiary">{t("tippspiel.kein_spiel")}</p>
        <button
          type="button"
          onClick={() => setCreerForm(true)}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
        >
          {t("tippspiel.admin_neues_spiel")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <TippspielAffichage tippspiel={dernier} />
      {peutGerer && dernier.statut === "cloture" && (
        <button
          type="button"
          onClick={() => setCreerForm(true)}
          className="mt-3 rounded-cid bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-cal"
        >
          {t("tippspiel.admin_neues_spiel")}
        </button>
      )}
    </div>
  );
}
