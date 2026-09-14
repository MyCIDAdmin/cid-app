/**
 * Page "Covoiturage" (mockup #pg-covoiturage, FDD §3.4/F-007). Liste communautaire des trajets
 * proposés (lecture ouverte à tout authentifié, voir CovoiturageWritePermission côté backend) +
 * proposer un trajet (éventuellement rattaché à un événement à venir) + rejoindre un trajet
 * existant (mockup #m-rejoindre). Les places restantes sont toujours recalculées côté serveur
 * (CLAUDE.md §8, verrouillage SELECT FOR UPDATE), même principe que l'inscription aux
 * événements — voir EvenementsPage.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCovoiturages,
  useCreerCovoiturage,
  useEvenements,
  useRejoindreTrajet,
} from "../../hooks/useEvenements";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Covoiturage } from "../../types/evenements";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "long" });
}

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function ModaleRejoindre({ trajet, onClose }: { trajet: Covoiturage; onClose: () => void }) {
  const { t } = useTranslation("evenements");
  const rejoindre = useRejoindreTrajet();
  const [places, setPlaces] = useState(1);
  const [pointPriseEnCharge, setPointPriseEnCharge] = useState("");
  const [erreur, setErreur] = useState("");

  const maxPlaces = Math.min(4, Math.max(trajet.places_restantes, 1));

  function confirmer() {
    rejoindre.mutate(
      {
        id: trajet.id,
        payload: { places_reservees: places, point_prise_en_charge: pointPriseEnCharge },
      },
      {
        onSuccess: onClose,
        onError: (err) => setErreur(extractApiErrorMessage(err, t("covoiturage.erreur_rejoindre"))),
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
          <h2 className="text-base font-bold text-text-primary">
            {t("covoiturage.modal_rejoindre_titre")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        </div>

        <div className="mb-3 rounded-cid bg-bg-secondary p-2.5">
          <div className="text-sm font-bold text-text-primary">
            {trajet.conducteur_detail
              ? `${trajet.conducteur_detail.prenom} ${trajet.conducteur_detail.nom}`
              : "—"}
          </div>
          <div className="text-xs text-text-tertiary">
            {trajet.depart} → {trajet.destination} · {formatDate(trajet.date_trajet)} ·{" "}
            {trajet.heure_trajet}
          </div>
          <div className="mt-1 text-sm font-bold text-ca">
            {trajet.prix_par_place
              ? t("covoiturage.prix_par_pers", { prix: formatMontant(trajet.prix_par_place) })
              : t("covoiturage.gratuit")}
          </div>
        </div>

        <div className="mb-2">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("covoiturage.modal_places")}
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

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("covoiturage.modal_point_prise_en_charge")}
          </label>
          <input
            type="text"
            value={pointPriseEnCharge}
            onChange={(e) => setPointPriseEnCharge(e.target.value)}
            placeholder={t("covoiturage.modal_point_prise_en_charge_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
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
            disabled={rejoindre.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("covoiturage.modal_confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CovoituragePage() {
  const { t } = useTranslation("evenements");
  const trajetsQuery = useCovoiturages();
  // Trajets liés à un événement à venir uniquement (mockup : le formulaire "Proposer un trajet"
  // permet de rattacher le trajet à un événement, voir Covoiturage.evenement côté backend).
  const evenementsQuery = useEvenements({
    statut: "publie",
    date_apres: new Date().toISOString().slice(0, 10),
  });
  const creerTrajet = useCreerCovoiturage();

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [depart, setDepart] = useState("");
  const [destination, setDestination] = useState("");
  const [dateTrajet, setDateTrajet] = useState("");
  const [heureTrajet, setHeureTrajet] = useState("");
  const [placesDisponibles, setPlacesDisponibles] = useState(3);
  const [prixParPlace, setPrixParPlace] = useState("");
  const [vehicule, setVehicule] = useState("");
  const [evenementLie, setEvenementLie] = useState("");
  const [erreurCreation, setErreurCreation] = useState("");
  const [trajetARejoindre, setTrajetARejoindre] = useState<Covoiturage | null>(null);

  function proposerTrajet(e: React.FormEvent) {
    e.preventDefault();
    if (!depart.trim() || !destination.trim() || !dateTrajet || !heureTrajet) return;
    creerTrajet.mutate(
      {
        depart,
        destination,
        date_trajet: dateTrajet,
        heure_trajet: heureTrajet,
        places_disponibles: placesDisponibles,
        prix_par_place: prixParPlace || null,
        vehicule,
        evenement: evenementLie || null,
      },
      {
        onSuccess: () => {
          setDepart("");
          setDestination("");
          setDateTrajet("");
          setHeureTrajet("");
          setPlacesDisponibles(3);
          setPrixParPlace("");
          setVehicule("");
          setEvenementLie("");
          setAfficherFormulaire(false);
        },
        onError: (err) =>
          setErreurCreation(extractApiErrorMessage(err, t("covoiturage.erreur_creation"))),
      },
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("covoiturage.titre")}</h1>
        <button
          type="button"
          onClick={() => setAfficherFormulaire((v) => !v)}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
        >
          {t("covoiturage.proposer_trajet")}
        </button>
      </div>

      {afficherFormulaire && (
        <form
          onSubmit={proposerTrajet}
          className="mb-4 space-y-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={depart}
              onChange={(e) => setDepart(e.target.value)}
              placeholder={t("covoiturage.depart_placeholder")}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={t("covoiturage.destination_placeholder")}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              aria-label={t("covoiturage.champ_date_label")}
              value={dateTrajet}
              onChange={(e) => setDateTrajet(e.target.value)}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
            <input
              type="time"
              aria-label={t("covoiturage.champ_heure_label")}
              value={heureTrajet}
              onChange={(e) => setHeureTrajet(e.target.value)}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              min={1}
              value={placesDisponibles}
              onChange={(e) => setPlacesDisponibles(Number(e.target.value))}
              placeholder={t("covoiturage.places_placeholder")}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={prixParPlace}
              onChange={(e) => setPrixParPlace(e.target.value)}
              placeholder={t("covoiturage.prix_placeholder")}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={vehicule}
              onChange={(e) => setVehicule(e.target.value)}
              placeholder={t("covoiturage.vehicule_placeholder")}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <select
            value={evenementLie}
            onChange={(e) => setEvenementLie(e.target.value)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("covoiturage.aucun_evenement_lie")}</option>
            {evenementsQuery.data?.results.map((evenement) => (
              <option key={evenement.id} value={evenement.id}>
                {evenement.titre}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creerTrajet.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("covoiturage.publier_trajet")}
          </button>
          {erreurCreation && <p className="text-xs text-status-dangerText">{erreurCreation}</p>}
        </form>
      )}

      {trajetsQuery.isLoading && <p className="text-sm text-text-tertiary">{t("chargement")}</p>}
      {trajetsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>
      )}
      {trajetsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("covoiturage.aucun_trajet")}</p>
      )}

      <div className="space-y-2">
        {trajetsQuery.data?.results.map((trajet) => {
          // Pas de vérification "est-ce mon propre trajet ?" côté client : CidUser (compte)
          // n'expose pas l'id Membre (relation 1-to-1 distincte, voir apps.accounts.models.User),
          // donc rien de fiable à comparer à trajet.conducteur ici. Le backend refuse déjà cette
          // action pour son propre trajet (403, voir CovoiturageViewSet.rejoindre) — l'erreur
          // remonte simplement dans la modale via extractApiErrorMessage.
          const complet = trajet.places_restantes <= 0;
          return (
            <div key={trajet.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-text-primary">
                    {trajet.conducteur_detail
                      ? `${trajet.conducteur_detail.prenom} ${trajet.conducteur_detail.nom}`
                      : "—"}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {trajet.depart} → {trajet.destination} · {formatDate(trajet.date_trajet)} ·{" "}
                    {trajet.heure_trajet}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-cal px-1.5 py-0.5 text-[10px] font-medium text-cad">
                    {t("covoiturage.places_count", { count: trajet.places_restantes })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTrajetARejoindre(trajet)}
                    disabled={complet}
                    className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
                  >
                    {complet ? t("complet") : t("covoiturage.rejoindre")}
                  </button>
                </div>
              </div>
              <div className="mt-1.5 flex gap-3 text-[10px] text-text-tertiary">
                {trajet.vehicule && <span>{trajet.vehicule}</span>}
                <span>
                  {trajet.prix_par_place
                    ? t("covoiturage.prix_par_pers", { prix: formatMontant(trajet.prix_par_place) })
                    : t("covoiturage.gratuit")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {trajetARejoindre && (
        <ModaleRejoindre trajet={trajetARejoindre} onClose={() => setTrajetARejoindre(null)} />
      )}
    </div>
  );
}
