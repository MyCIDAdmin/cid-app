/**
 * Page "Covoiturage" (mockup #pg-covoiturage, FDD §3.4/F-007). Liste communautaire des trajets
 * proposés (lecture ouverte à tout authentifié, voir CovoiturageWritePermission côté backend) +
 * proposer un trajet (éventuellement rattaché à un événement à venir) + rejoindre un trajet
 * existant (mockup #m-rejoindre). Les places restantes sont toujours recalculées côté serveur
 * (CLAUDE.md §8, verrouillage SELECT FOR UPDATE), même principe que l'inscription aux
 * événements — voir EvenementsPage.
 *
 * Partage social + remarque libre (demande utilisateur 2026-09-25, "Es soll möglich sein
 * Fahrgemeinschaften in Social Media zu Teilen" / "eine Beschreibung / Anmerkung zu erfassen") :
 * ShareButton (déjà utilisé sur Événements/Boutique/Fil/Vote) posé sur chaque tuile de trajet ;
 * `remarques`, un champ texte libre distinct de `lieu_rendez_vous` (point de RDV structuré),
 * saisi à la création et affiché tel quel sur la tuile.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import MapsApercu from "../../components/ui/MapsApercu";
import ShareButton from "../../components/ui/ShareButton";
import {
  useCovoiturages,
  useCreerCovoiturage,
  useEvenements,
  useRejoindreTrajet,
  useReservationsCovoiturage,
} from "../../hooks/useEvenements";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Covoiturage } from "../../types/evenements";

/** Qui a réservé sur ce trajet — tuile Fahrgemeinschaft (signalé par un utilisateur,
 * 2026-09-25). Le backend filtre déjà par IDOR (ReservationCovoiturageViewSet.get_queryset) :
 * seuls le conducteur du trajet, ses passagers et le personnel de gestion voient les
 * réservations, tout autre membre reçoit une liste vide — donc rien à vérifier ici côté
 * client (même remarque que pour "est-ce mon propre trajet ?" plus bas). */
function ParticipantsCovoiturage({ trajetId }: { trajetId: string }) {
  const { t } = useTranslation("evenements");
  const reservationsQuery = useReservationsCovoiturage({ trajet: trajetId });
  const reservations = (reservationsQuery.data?.results ?? []).filter(
    (reservation) => reservation.statut === "confirmee",
  );

  if (reservationsQuery.isLoading) return null;

  if (reservations.length === 0) {
    return <p className="mt-1.5 text-[10px] text-text-tertiary">{t("covoiturage.aucune_reservation")}</p>;
  }

  return (
    <p className="mt-1.5 text-[10px] text-text-tertiary">
      <span className="font-medium text-text-secondary">{t("covoiturage.participants_label")}</span>{" "}
      {reservations
        .map((reservation) =>
          reservation.membre_detail
            ? `${reservation.membre_detail.prenom} ${reservation.membre_detail.nom}`
            : "—",
        )
        .join(", ")}
    </p>
  );
}

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
          {trajet.lieu_rendez_vous && (
            <div className="mt-1 text-xs text-text-tertiary">
              <span className="font-medium text-text-secondary">
                {t("covoiturage.treffpunkt_label")}
              </span>{" "}
              {trajet.lieu_rendez_vous}
            </div>
          )}
        </div>

        {/* Aperçu Maps du point de rendez-vous (demande utilisateur du 2026-09-27, point 12.1) —
            ne rend rien si lieu_rendez_vous est vide, voir MapsApercu. */}
        <MapsApercu
          adresse={trajet.lieu_rendez_vous}
          mapsUrl={trajet.lieu_rendez_vous_maps_url}
          className="mb-3"
        />

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
  const [lieuRendezVous, setLieuRendezVous] = useState("");
  const [lieuRendezVousMapsUrl, setLieuRendezVousMapsUrl] = useState("");
  const [remarques, setRemarques] = useState("");
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
        lieu_rendez_vous: lieuRendezVous,
        lieu_rendez_vous_maps_url: lieuRendezVousMapsUrl,
        remarques,
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
          setLieuRendezVous("");
          setLieuRendezVousMapsUrl("");
          setRemarques("");
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
          <input
            type="text"
            value={lieuRendezVous}
            onChange={(e) => setLieuRendezVous(e.target.value)}
            placeholder={t("covoiturage.treffpunkt_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          {/* Lien Google Maps du point de rendez-vous (demande utilisateur du 2026-09-27, point
              12.1) — utilisé uniquement comme cible du lien cliquable, voir MapsApercu.tsx. */}
          <input
            type="url"
            value={lieuRendezVousMapsUrl}
            onChange={(e) => setLieuRendezVousMapsUrl(e.target.value)}
            placeholder={t("covoiturage.treffpunkt_maps_url_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          <textarea
            value={remarques}
            onChange={(e) => setRemarques(e.target.value)}
            placeholder={t("covoiturage.remarques_placeholder")}
            rows={2}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
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
                  <ShareButton
                    path={`/covoiturage?trajet=${trajet.id}`}
                    titre={t("covoiturage.partage_titre", {
                      depart: trajet.depart,
                      destination: trajet.destination,
                    })}
                    texte={t("covoiturage.partage_texte", {
                      depart: trajet.depart,
                      destination: trajet.destination,
                      date: formatDate(trajet.date_trajet),
                    })}
                  />
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
              {trajet.lieu_rendez_vous && (
                <p className="mt-1.5 text-[10px] text-text-tertiary">
                  <span className="font-medium text-text-secondary">
                    {t("covoiturage.treffpunkt_label")}
                  </span>{" "}
                  {trajet.lieu_rendez_vous}
                </p>
              )}
              {trajet.lieu_rendez_vous_maps_url && (
                <MapsApercu
                  adresse={trajet.lieu_rendez_vous}
                  mapsUrl={trajet.lieu_rendez_vous_maps_url}
                  className="mt-1.5"
                />
              )}
              {trajet.remarques && (
                <p className="mt-1.5 text-[10px] text-text-tertiary">
                  <span className="font-medium text-text-secondary">
                    {t("covoiturage.remarques_label")}
                  </span>{" "}
                  {trajet.remarques}
                </p>
              )}
              <ParticipantsCovoiturage trajetId={trajet.id} />
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
