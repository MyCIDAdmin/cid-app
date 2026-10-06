/**
 * Modale d'inscription à un événement (mockup #m-inscription) — extraite de EvenementsPage.tsx
 * le 2026-09-26 (Phase D, page d'accueil publique) pour être réutilisable aussi depuis
 * PublicEvenementsTab.tsx (onglet "Veranstaltungen" public) SANS dupliquer la logique de
 * vérification de capacité/accompagnants/régime alimentaire — le comportement est EXACTEMENT
 * le même dans les deux contextes (un utilisateur authentifié, actif ou non, peut s'inscrire ;
 * voir EvenementPermission côté backend, `inscrire` n'est jamais réservé aux membres actifs).
 *
 * Le prix affiché n'est qu'indicatif — comme boutique/adhésions/cotisations, le montant réel
 * (et la capacité) est toujours recalculé et vérifié côté serveur, jamais fait confiance au
 * frontend (CLAUDE.md §8, voir InscrirePayload/EvenementViewSet.inscrire).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useInscrire } from "../../hooks/useEvenements";
import { extractApiErrorMessage } from "../../utils/apiError";
import MapsApercu from "../ui/MapsApercu";
import type { Evenement, RegimeAlimentaire } from "../../types/evenements";

// Fonctions utilitaires co-localisées avec le composant (réutilisées par EvenementsPage et
// PublicEvenementsTab) plutôt que déplacées dans un fichier séparé — react-refresh/only-export-
// components ne dégrade que le Fast Refresh en dev, pas le comportement runtime (même choix que
// CataloguePage.tsx/Sidebar.tsx).
/** "18:00 – 22:00" / "18:00" / "" — plage horaire d'un événement (fin optionnelle, 2026-10-06). */
// eslint-disable-next-line react-refresh/only-export-components
export function formatPlageHoraire(heure: string | null, heureFin: string | null): string {
  if (!heure) return "";
  return heureFin ? `${heure.slice(0, 5)} – ${heureFin.slice(0, 5)}` : heure.slice(0, 5);
}

/** Date de l'événement, avec la date de fin si elle diffère : "12.10.2026 – 14.10.2026". */
// eslint-disable-next-line react-refresh/only-export-components
export function formatPeriode(debut: string, fin: string | null): string {
  return fin && fin !== debut ? `${formatDate(debut)} – ${formatDate(fin)}` : formatDate(debut);
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "long" });
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function ModaleInscription({
  evenement,
  onClose,
  onPayer,
}: {
  evenement: Evenement;
  onClose: () => void;
  onPayer: (cotisationId: string) => void;
}) {
  const { t } = useTranslation("evenements");
  const inscrire = useInscrire();
  const [places, setPlaces] = useState(1);
  const [accompagnantsAdultes, setAccompagnantsAdultes] = useState(0);
  const [accompagnantsEnfants, setAccompagnantsEnfants] = useState(0);
  const [regime, setRegime] = useState<RegimeAlimentaire>("aucun");
  const [remarques, setRemarques] = useState("");
  const [erreur, setErreur] = useState("");

  const maxPlaces =
    evenement.places_restantes !== null ? Math.min(4, Math.max(evenement.places_restantes, 1)) : 4;
  const maxAccompagnants =
    evenement.places_restantes !== null ? Math.max(evenement.places_restantes - places, 0) : 8;

  // Estimation affichée à titre purement indicatif — le montant réel est toujours recalculé et
  // vérifié côté serveur, jamais fait confiance au frontend (CLAUDE.md §8).
  const montantEstime =
    Number(evenement.gratuit ? 0 : evenement.cout_applicable) * places +
    (evenement.accompagnants_payants
      ? Number(evenement.prix_accompagnant_adulte) * accompagnantsAdultes +
        Number(evenement.prix_accompagnant_enfant) * accompagnantsEnfants
      : 0);

  function confirmer() {
    inscrire.mutate(
      {
        evenement: evenement.id,
        places,
        nombre_accompagnants_adultes: accompagnantsAdultes,
        nombre_accompagnants_enfants: accompagnantsEnfants,
        regime_alimentaire: regime,
        remarques,
      },
      {
        onSuccess: (inscription) => {
          onClose();
          // Ajouté le 2026-09-20 (retour utilisateur : "Wenn ich auf 'Confirmer et payer'
          // clicke, ich soll direkt zur Zahlung springen") — une inscription gratuite ou déjà
          // confirmée n'a pas de Cotisation liée (voir apps.evenements.services.
          // synchroniser_cotisation, statut EN_ATTENTE_PAIEMENT uniquement) : dans ce cas on se
          // contente de fermer la modale, comme avant.
          if (inscription.cotisation) {
            onPayer(inscription.cotisation);
          }
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("erreur_inscription"))),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">{t("modal_inscription_titre")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        </div>

        <div className="mb-3 flex items-center gap-3 rounded-cid bg-bg-secondary p-2.5">
          <div className="flex-1">
            <div className="text-sm font-bold text-text-primary">{evenement.titre}</div>
            <div className="text-xs text-text-tertiary">
              {formatDate(evenement.date_evenement)} · {evenement.lieu}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-ca">
              {montantEstime > 0 ? formatMontant(montantEstime) : t("gratuit")}
            </div>
            <div className="text-[10px] text-text-tertiary">{t("modal_montant_estime")}</div>
          </div>
        </div>

        {/* Aperçu Maps (demande utilisateur du 2026-09-27, point 11.2 "Maps-Link für den Ort +
            Vorschau + Adresse anzeigen") — ne rend rien si `lieu` est vide, voir MapsApercu. */}
        <MapsApercu adresse={evenement.lieu} mapsUrl={evenement.lieu_maps_url} className="mb-3" />

        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {t("modal_places")}
            </label>
            <select
              value={places}
              onChange={(e) => setPlaces(Number(e.target.value))}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              {Array.from({ length: maxPlaces }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              {t("modal_regime")}
            </label>
            <select
              value={regime}
              onChange={(e) => setRegime(e.target.value as RegimeAlimentaire)}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              <option value="aucun">{t("regime_aucun")}</option>
              <option value="halal">{t("regime_halal")}</option>
              <option value="vegetarien">{t("regime_vegetarien")}</option>
            </select>
          </div>
        </div>

        {/* Begleitpersonen (module "Veranstaltungsverwaltung", 2026-09-25) — décomptes par
            palier adulte/enfant, jamais l'âge exact de chaque accompagnant (la limite d'âge
            n'est ici qu'une indication pour aider le membre à choisir le bon palier). */}
        <div className="mb-2 rounded-cid bg-bg-secondary p-2.5">
          <div className="mb-1.5 text-xs font-medium text-text-secondary">
            {t("modal_accompagnants_titre")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="modal-inscription-accompagnants-adultes"
                className="mb-1 block text-[11px] text-text-tertiary"
              >
                {t("modal_accompagnants_adultes")}
                {evenement.accompagnants_payants &&
                  ` (${formatMontant(evenement.prix_accompagnant_adulte)})`}
              </label>
              <input
                id="modal-inscription-accompagnants-adultes"
                type="number"
                min={0}
                max={maxAccompagnants}
                value={accompagnantsAdultes}
                onChange={(e) =>
                  setAccompagnantsAdultes(
                    Math.max(0, Math.min(maxAccompagnants, Number(e.target.value) || 0)),
                  )
                }
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="modal-inscription-accompagnants-enfants"
                className="mb-1 block text-[11px] text-text-tertiary"
              >
                {t("modal_accompagnants_enfants", {
                  age: evenement.age_limite_accompagnant_enfant,
                })}
                {evenement.accompagnants_payants &&
                  ` (${formatMontant(evenement.prix_accompagnant_enfant)})`}
              </label>
              <input
                id="modal-inscription-accompagnants-enfants"
                type="number"
                min={0}
                max={maxAccompagnants}
                value={accompagnantsEnfants}
                onChange={(e) =>
                  setAccompagnantsEnfants(
                    Math.max(0, Math.min(maxAccompagnants, Number(e.target.value) || 0)),
                  )
                }
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          {!evenement.accompagnants_payants && (
            <p className="mt-1 text-[10px] text-text-tertiary">
              {t("modal_accompagnants_gratuits")}
            </p>
          )}
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("modal_remarques")}
          </label>
          <textarea
            value={remarques}
            onChange={(e) => setRemarques(e.target.value)}
            placeholder={t("modal_remarques_placeholder")}
            rows={2}
            className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
          />
        </div>

        {erreur && <p className="mb-2 text-xs text-status-dangerText">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
          >
            {t("annuler")}
          </button>
          <button
            type="button"
            onClick={confirmer}
            disabled={inscrire.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {montantEstime > 0 ? t("modal_confirmer_payer") : t("modal_confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}
