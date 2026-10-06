/**
 * Page membre "Mon adhésion" (mockup #pg-mon-adhesion, FDD §4.1-4.3, AHM-21).
 *
 * Portée actée avec l'utilisateur : campagne active + offres, souscription
 * (avec rabais optionnel), historique des souscriptions passées — sans le
 * reçu PDF téléchargeable du mockup (pas d'endpoint backend, différé).
 *
 * Flux justificatif (AHM-20, ajouté après coup) : quand la souscription est
 * en_attente_justificatif, un formulaire d'upload apparaît (FDD §4.2 étape
 * 3). Le fichier ne transite jamais en clair — seule la file de validation
 * RH+ (AdminJustificatifsPage) télécharge le document, via une URL MinIO
 * pré-signée à courte durée de vie. Si le rabais est refusé, le motif du RH
 * est affiché : le membre garde la main pour payer plein tarif ou changer
 * d'offre via la liste ci-dessous (déjà ouverte puisque dejaPayee est faux).
 *
 * Le prix affiché en aperçu (offre.prix_plein / rabais) n'est qu'indicatif :
 * comme pour le stepper de cotisations, le prix réellement enregistré est
 * toujours recalculé par le serveur (CLAUDE.md §8, voir
 * SouscriptionViewSet.souscrire côté backend).
 *
 * Retrait ("zurückziehen", demande utilisateur du 2026-09-16) : le membre peut retirer sa
 * propre souscription tant qu'elle n'est pas payée (brouillon/en_attente_justificatif/
 * en_attente_paiement/rabais_refuse — voir STATUTS_SOUSCRIPTION_ANNULABLES côté backend, qui
 * reste seul juge du statut autorisé).
 *
 * Différenciation par couleur + détails/avantages (demande utilisateur 2026-09-25,
 * "Mitgliedschaftspakete Färblich differenzieren" / "Details und Vorteile zur Mitgliedschaft
 * auflisten") : chaque carte d'offre visible reçoit un liseré coloré fixe selon sa position
 * (ACCENTS_OFFRE, palette catégorielle validée — voir index.css) — la couleur ne porte jamais
 * seule l'information (le nom de l'offre reste le premier repère), elle aide juste à repérer
 * une même offre d'un coup d'œil entre la liste et l'historique. Au-delà de 3 offres visibles,
 * repli sur un style neutre plutôt que d'inventer une 4ᵉ couleur non validée. Les avantages
 * (offre.avantages) et la tranche d'âge éligible sont désormais affichés directement sur
 * chaque carte, plutôt qu'uniquement après souscription (snapshot_avantages du hero).
 *
 * Cartes façon mycid.org/membership (retour utilisateur du 2026-09-27, points 3-4 : "Wenn ich
 * auf dem Button 'Mitglieder werden' klicke, erscheint eine Seite mit den Angeboten [...] Der
 * Design der Seite mycid.org/membership soll übernommen werden" + "Button [...] auf 'Jetzt
 * beitreten' umbenennen") — cette page (déjà la destination du CTA hero "Mitglied werden", voir
 * AccueilTab.tsx) reprend désormais elle-même le langage visuel de cartes tarifaires utilisé par
 * MembershipOffersPublic.tsx (bordure haute colorée, prix en grand, badge "Beliebt" sur l'offre
 * du milieu à partir de 3 offres) au lieu de l'ancienne liste compacte — MembershipSection.tsx
 * n'est elle-même plus montrée sur la Startseite (voir AccueilTab.tsx), donc ce style de carte ne
 * vit désormais plus qu'ici, en un seul clic depuis le hero. Le bouton "Jetzt beitreten"
 * (offres.rejoindre) déplie la carte (rabais + confirmation) exactement comme cliquer sur la
 * ligne le faisait avant — seul l'habillage visuel change, pas le flux d'inscription en 2 temps
 * (choix du rabais avant confirmation définitive, prix toujours recalculé côté serveur).
 *
 * Phase F (2026-09-26, fusion "Mitgliedsbeitrag" -> "Meine Mitgliedschaft", exigence
 * utilisateur non negociable, voir plan section F) : cette page integre desormais aussi
 * l'integralite de l'ancien module "Mitgliedsbeitrag" (PaiementStepper, ex-
 * CotisationStepperPage.tsx) comme section supplementaire, juste apres la grille
 * offre/historique ci-dessous - plus aucun contenu ne vit sous une page/route separee, et
 * l'entree de sidebar "Mitgliedsbeitrag" a ete retiree (voir Sidebar.tsx).
 *
 * Historique - decision de conception : le plan evoquait "une historique commune
 * (souscriptions d'adhesion et autres paiements dans un seul tableau)". En pratique les deux
 * historiques portent sur des donnees de forme differente (une Souscription a une
 * campagne/offre/prix/statut de souscription ; une Cotisation a un libelle/montant/statut de
 * paiement/recu PDF telechargeable) et utilisent deux namespaces i18n distincts
 * (adhesions/cotisations) avec des statuts non superposables (ex. rabais_refuse vs echouee).
 * Les fusionner dans un unique tableau forcerait soit a perdre des colonnes significatives (le
 * recu PDF, la campagne/offre) soit a afficher des cellules vides selon la ligne. Les deux
 * tableaux restent donc distincts mais colocalises sur la meme page - ce qui satisfait
 * l'exigence reelle de l'utilisateur ("tout ce qui apparaissait sous Mitgliedsbeitrag
 * apparait desormais sous Meine Mitgliedschaft") sans degrader ni l'un ni l'autre historique.
 *
 * Historique de statut annuel (ajouté le 2026-09-29, diagnostic import Historique Excel) : un
 * troisième tableau distinct, alimenté par GET /membres/mon-historique/ (voir
 * hooks/useMembres.useMonHistoriqueStatut et history_views.py côté backend). Même raisonnement
 * que ci-dessus contre la fusion : ces lignes (une par année, statut actif/inactif) n'ont ni
 * campagne/offre ni prix/reçu, donc un tableau à part plutôt que des colonnes vides dans l'un
 * des deux tableaux existants.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import MitgliedsKarteAbschnitt from "../../components/adhesions/MitgliedsKarteAbschnitt";
import PaiementStepper from "../../components/adhesions/PaiementStepper";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
  useAnnulerSouscription,
  useCampagneActive,
  useCampagnes,
  useMesSouscriptions,
  useSouscrire,
  useUploaderJustificatif,
} from "../../hooks/useAdhesions";
import { useMonHistoriqueStatut } from "../../hooks/useMembres";
import type {
  CampagneAdhesion,
  OffreAdhesion,
  Souscription,
  StatutSouscription,
} from "../../types/adhesion";
import CompleterProfilIdentite, {
  estErreurProfilIncomplet,
} from "../../components/adhesions/CompleterProfilIdentite";
import { extractApiErrorMessage } from "../../utils/apiError";

const STATUTS_RETIRABLES: StatutSouscription[] = [
  "brouillon",
  "en_attente_justificatif",
  "en_attente_paiement",
  "rabais_refuse",
];

// Palette catégorielle fixe (jamais recyclée arbitrairement) — voir le docstring de tête pour
// le choix des 3 slots. `puce` colore le repère "✓" devant chaque avantage listé ; `liseret_haut`
// est la même palette en bordure haute (façon mycid.org/membership, voir docstring de tête).
const ACCENTS_OFFRE = [
  { liseret: "border-l-cat-1", liseret_haut: "border-t-cat-1", puce: "text-cat-1" },
  { liseret: "border-l-cat-2", liseret_haut: "border-t-cat-2", puce: "text-cat-2" },
  { liseret: "border-l-cat-3", liseret_haut: "border-t-cat-3", puce: "text-cat-3" },
] as const;
const ACCENT_NEUTRE = {
  liseret: "border-l-text-tertiary/30",
  liseret_haut: "border-t-text-tertiary/30",
  puce: "text-ca",
} as const;

// Retour utilisateur du 2026-09-29 ("Verwaltung der Mitgliedschaftskampagnen" : "2. Färblich
// highlighten") — reprend les mêmes 3 emplacements que ACCENTS_OFFRE (voir CouleurOffre côté
// backend/types/adhesion.ts) : un choix explicite de l'admin (offre.couleur) l'emporte sur
// l'attribution automatique par index, qui reste le repli historique quand `couleur` est vide.
const COULEUR_OFFRE_INDEX: Record<string, number> = { cat_1: 0, cat_2: 1, cat_3: 2 };

function accentOffre(
  offre: Pick<OffreAdhesion, "couleur">,
  index: number,
): (typeof ACCENTS_OFFRE)[number] | typeof ACCENT_NEUTRE {
  if (offre.couleur && offre.couleur in COULEUR_OFFRE_INDEX) {
    return ACCENTS_OFFRE[COULEUR_OFFRE_INDEX[offre.couleur]];
  }
  return ACCENTS_OFFRE[index] ?? ACCENT_NEUTRE;
}

const STATUT_STYLES: Record<StatutSouscription, string> = {
  brouillon: "bg-bg-tertiary text-text-secondary",
  en_attente_justificatif: "bg-status-warningBg text-status-warningText",
  en_attente_paiement: "bg-status-warningBg text-status-warningText",
  payee: "bg-status-successBg text-status-successText",
  rabais_refuse: "bg-status-dangerBg text-status-dangerText",
  annulee: "bg-bg-tertiary text-text-secondary",
  expiree: "bg-bg-tertiary text-text-secondary",
};

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function MonAdhesionPage() {
  const { t } = useTranslation("adhesions");

  const campagneActive = useCampagneActive();
  // Catalogue complet (tous statuts, lecture ouverte — CataloguePermission) :
  // sert uniquement à résoudre les noms de campagne/offre de l'historique,
  // qui peut couvrir des campagnes déjà clôturées et donc absentes de
  // "active". Limite connue : ne couvre que la première page du cursor
  // (comme le stepper de cotisations) — acceptable pour ce périmètre.
  const campagnesQuery = useCampagnes();
  const mesSouscriptions = useMesSouscriptions();
  const souscrireMutation = useSouscrire();
  const uploaderJustificatifMutation = useUploaderJustificatif();
  const annulerMutation = useAnnulerSouscription();
  const monHistoriqueStatut = useMonHistoriqueStatut();

  const [offreSelectionneeId, setOffreSelectionneeId] = useState<string | null>(null);
  const [rabaisSelectionneId, setRabaisSelectionneId] = useState<string | null>(null);
  const [fichierJustificatif, setFichierJustificatif] = useState<File | null>(null);
  const [retraitOuvert, setRetraitOuvert] = useState(false);
  const fichierInputRef = useRef<HTMLInputElement>(null);

  const campagne = campagneActive.data;

  const campagnesById = useMemo(() => {
    const map = new Map<string, CampagneAdhesion>();
    campagnesQuery.data?.results.forEach((c) => map.set(c.id, c));
    if (campagne) map.set(campagne.id, campagne);
    return map;
  }, [campagnesQuery.data, campagne]);

  const souscriptionActuelle: Souscription | undefined = mesSouscriptions.data?.results.find(
    (s) => campagne && s.campagne === campagne.id,
  );
  const dejaPayee = souscriptionActuelle?.statut === "payee";

  const offresVisibles: OffreAdhesion[] = (campagne?.offres ?? []).filter((o) => o.visible);
  // Retour utilisateur du 2026-09-29 ("Verwaltung der Mitgliedschaftskampagnen" : "3. Tags
  // hinzufügen wie... der Tag 'Popular'") — dès qu'une offre visible porte le tag "Populaire"
  // explicite (OffreAdhesion.populaire, défini côté admin), il remplace entièrement le repère
  // par position ci-dessous (voir le calcul de `populaire` dans le rendu des cartes) : jamais
  // les deux mélangés, pour éviter deux badges "Beliebt" sur la même grille.
  const uneOffrePopulaireExplicite = offresVisibles.some((o) => o.populaire);
  const offreSelectionnee = offresVisibles.find((o) => o.id === offreSelectionneeId) ?? null;
  const rabaisOptions = offreSelectionnee?.rabais ?? [];
  const rabaisSelectionne = rabaisOptions.find((r) => r.id === rabaisSelectionneId) ?? null;

  const offreActuelle = souscriptionActuelle
    ? campagnesById
        .get(souscriptionActuelle.campagne)
        ?.offres.find((o) => o.id === souscriptionActuelle.offre)
    : undefined;

  // Rabais choisi pour la souscription en cours — sert à afficher les instructions membre
  // (RabaisOffre.instructions_fr) au-dessus du formulaire d'upload.
  const rabaisActuel = offreActuelle?.rabais.find((r) => r.id === souscriptionActuelle?.rabais);
  const justificatifActuel = souscriptionActuelle?.justificatif ?? null;

  function choisirOffre(offreId: string) {
    setOffreSelectionneeId((cur) => (cur === offreId ? null : offreId));
    setRabaisSelectionneId(null);
  }

  function envoyerJustificatif() {
    if (!souscriptionActuelle || !fichierJustificatif) return;
    uploaderJustificatifMutation.mutate(
      { souscriptionId: souscriptionActuelle.id, fichier: fichierJustificatif },
      {
        onSuccess: () => {
          setFichierJustificatif(null);
          if (fichierInputRef.current) fichierInputRef.current.value = "";
        },
      },
    );
  }

  function handleSouscrire() {
    if (!offreSelectionnee) return;
    souscrireMutation.mutate(
      { offre: offreSelectionnee.id, rabais: rabaisSelectionne?.id },
      {
        onSuccess: () => {
          setOffreSelectionneeId(null);
          setRabaisSelectionneId(null);
        },
      },
    );
  }

  const peutRetirer =
    !!souscriptionActuelle && STATUTS_RETIRABLES.includes(souscriptionActuelle.statut);

  function confirmerRetrait() {
    if (!souscriptionActuelle) return;
    annulerMutation.mutate(souscriptionActuelle.id, { onSuccess: () => setRetraitOuvert(false) });
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("page.titre")}</h1>

      {/* Bezahlte Mitgliedschaft → digitale Mitgliedskarte im Stil des Angebots ; sonst (Antrag
          offen, Nachweis fehlt …) bleibt die bisherige Statuskachel. */}
      {souscriptionActuelle && dejaPayee && (
        <MitgliedsKarteAbschnitt
          stil={offreActuelle?.kartenstil}
          angebot={offreActuelle?.nom ?? "—"}
          kampagne={campagne?.nom}
          gueltigBis={campagne ? formatDate(campagne.date_fin) : undefined}
          vorteile={souscriptionActuelle.snapshot_avantages
            .slice()
            .sort((a, b) => a.ordre - b.ordre)
            .map((av) => av.texte_fr)}
        />
      )}

      {souscriptionActuelle && !dejaPayee && (
        <div className="mb-5 rounded-cid-lg bg-ca p-5 text-white shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/80">
            {t("hero.titre")}
          </h2>
          <div className="mt-1 text-lg font-bold">{offreActuelle?.nom ?? "—"}</div>
          {campagne && (
            <div className="text-sm text-white/80">
              {t("hero.campagne", { nom: campagne.nom })} ·{" "}
              {t("hero.expire_le", { date: formatDate(campagne.date_fin) })}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div>
              <div className="text-xs uppercase text-white/70">{t("hero.prix_paye")}</div>
              <div className="text-lg font-bold">
                {formatMontant(souscriptionActuelle.prix_paye)}
              </div>
            </div>
            <div className="text-xs uppercase text-white/70">
              {t("hero.souscrit_le", { date: formatDate(souscriptionActuelle.date_souscription) })}
            </div>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[souscriptionActuelle.statut]}`}
            >
              {t(`statut.${souscriptionActuelle.statut}`)}
            </span>
          </div>
          {souscriptionActuelle.snapshot_avantages.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs uppercase text-white/70">
                {t("hero.avantages_titre")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {souscriptionActuelle.snapshot_avantages
                  .slice()
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((av) => (
                    <span key={av.ordre} className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                      ✓ {av.texte_fr}
                    </span>
                  ))}
              </div>
            </div>
          )}
          {peutRetirer && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setRetraitOuvert(true)}
                className="rounded-cid border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                {t("hero.retirer")}
              </button>
              {annulerMutation.isError && (
                <p className="mt-1 text-xs text-white/90">
                  {extractApiErrorMessage(annulerMutation.error, t("hero.erreur_retrait"))}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {souscriptionActuelle?.statut === "en_attente_justificatif" && (
        <div className="mb-5 rounded-cid-lg border border-status-warningText/30 bg-status-warningBg p-4">
          <h2 className="mb-1 text-sm font-bold text-text-primary">{t("justificatif.titre")}</h2>
          {rabaisActuel && (
            <p className="mb-3 text-xs text-text-secondary">{rabaisActuel.instructions_fr}</p>
          )}

          {justificatifActuel && justificatifActuel.statut === "en_attente" ? (
            <p className="mb-3 text-sm text-status-warningText">
              {t("justificatif.en_attente_validation")}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fichierInputRef}
              type="file"
              aria-label={t("justificatif.fichier_label")}
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFichierJustificatif(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            <button
              type="button"
              onClick={envoyerJustificatif}
              disabled={!fichierJustificatif || uploaderJustificatifMutation.isPending}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {justificatifActuel ? t("justificatif.remplacer") : t("justificatif.envoyer")}
            </button>
          </div>
          {uploaderJustificatifMutation.isError && (
            <p className="mt-2 text-xs text-status-dangerText">
              {extractApiErrorMessage(uploaderJustificatifMutation.error, t("justificatif.erreur"))}
            </p>
          )}
        </div>
      )}

      {souscriptionActuelle?.statut === "rabais_refuse" && justificatifActuel?.motif_rejet && (
        <div className="mb-5 rounded-cid-lg border border-status-dangerText/30 bg-status-dangerBg p-4 text-sm text-status-dangerText">
          <span className="font-semibold">{t("justificatif.rejete_titre")}</span>{" "}
          {justificatifActuel.motif_rejet}
        </div>
      )}

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-1 text-xs font-bold text-text-primary">
          {campagne
            ? t("offres.titre", { annee: campagne.annee })
            : t("offres.titre_sans_campagne")}
        </h2>

        {campagneActive.isLoading && (
          <p className="text-sm text-text-tertiary">{t("offres.chargement")}</p>
        )}
        {campagneActive.isError && (
          <p className="text-sm text-text-tertiary">{t("offres.aucune_campagne")}</p>
        )}
        {campagne && dejaPayee && (
          <p className="text-sm text-text-tertiary">{t("offres.deja_payee")}</p>
        )}
        {campagne && !dejaPayee && offresVisibles.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("offres.aucune_campagne")}</p>
        )}

        {campagne && !dejaPayee && offresVisibles.length > 0 && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offresVisibles.map((offre, index) => {
              const accent = accentOffre(offre, index);
              const avantagesOffre = offre.avantages.slice().sort((a, b) => a.ordre - b.ordre);
              const texteConditionAge =
                offre.condition_age_min != null && offre.condition_age_max != null
                  ? t("offres.condition_age_min_max", {
                      min: offre.condition_age_min,
                      max: offre.condition_age_max,
                    })
                  : offre.condition_age_min != null
                    ? t("offres.condition_age_min", { min: offre.condition_age_min })
                    : offre.condition_age_max != null
                      ? t("offres.condition_age_max", { max: offre.condition_age_max })
                      : null;
              const selectionnee = offreSelectionneeId === offre.id;
              // Repère "Beliebt" façon mycid.org/membership — depuis le 2026-09-29, un tag
              // explicite côté admin (offre.populaire) l'emporte dès qu'au moins une offre de la
              // campagne le porte ; sinon repli sur l'ancien heuristique purement décoratif
              // (offre du milieu à partir de 3 offres visibles, voir MembershipOffersPublic.tsx
              // pour la même convention côté page publique).
              const populaire = uneOffrePopulaireExplicite
                ? offre.populaire
                : offresVisibles.length >= 3 && index === Math.floor(offresVisibles.length / 2);

              return (
                <div
                  key={offre.id}
                  className={`relative flex flex-col rounded-cid-lg border-t-4 bg-bg-primary p-5 shadow-sm ${
                    accent.liseret_haut
                  } ${selectionnee ? "ring-2 ring-ca" : ""}`}
                >
                  {populaire && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ca px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                      {t("offres.badge_populaire")}
                    </span>
                  )}

                  {offre.icone && (
                    <img
                      src={offre.icone}
                      alt=""
                      aria-hidden="true"
                      className="mx-auto mb-2 h-10 w-10 rounded-cid object-cover"
                    />
                  )}
                  <div className="text-center text-sm font-semibold uppercase tracking-wide text-text-tertiary">
                    {offre.nom}
                  </div>
                  <div className="mt-2 text-center font-display text-3xl font-bold text-text-primary">
                    {formatMontant(offre.prix_plein)}
                  </div>
                  {offre.description && (
                    <p className="mt-2 text-center text-sm text-text-secondary">
                      {offre.description}
                    </p>
                  )}
                  {texteConditionAge && (
                    <p className="mt-1 text-center text-[11px] text-text-tertiary">
                      {texteConditionAge}
                    </p>
                  )}

                  {avantagesOffre.length > 0 && (
                    <ul className="mt-4 flex-1 space-y-1.5">
                      {avantagesOffre.map((av) => (
                        <li
                          key={av.ordre}
                          className="flex items-start gap-1.5 text-sm text-text-secondary"
                        >
                          <span className={`shrink-0 font-bold ${accent.puce}`} aria-hidden="true">
                            ✓
                          </span>
                          {av.texte_fr}
                        </li>
                      ))}
                    </ul>
                  )}

                  {!selectionnee && (
                    <button
                      type="button"
                      onClick={() => choisirOffre(offre.id)}
                      className="mt-5 rounded-cid bg-ca px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-cad"
                    >
                      {t("offres.rejoindre")}
                    </button>
                  )}

                  {selectionnee && (
                    <div className="mt-5 border-t border-text-tertiary/10 pt-4">
                      {offre.rabais.length > 0 && (
                        <div className="mb-2">
                          <label
                            htmlFor={`rabais-${offre.id}`}
                            className="mb-1 block text-xs font-medium text-text-secondary"
                          >
                            {t("offres.rabais_label")}
                          </label>
                          <select
                            id={`rabais-${offre.id}`}
                            value={rabaisSelectionneId ?? ""}
                            onChange={(e) => setRabaisSelectionneId(e.target.value || null)}
                            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                          >
                            <option value="">{t("offres.rabais_aucun")}</option>
                            {offre.rabais.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label_fr}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {souscrireMutation.isError &&
                        (estErreurProfilIncomplet(souscrireMutation.error) ? (
                          <CompleterProfilIdentite onComplete={handleSouscrire} />
                        ) : (
                          <p className="mb-2 text-xs text-status-dangerText">
                            {extractApiErrorMessage(souscrireMutation.error, t("offres.erreur"))}
                          </p>
                        ))}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSouscrire}
                          disabled={souscrireMutation.isPending}
                          className="flex-1 rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
                        >
                          {souscriptionActuelle ? t("offres.changer") : t("offres.souscrire")}
                        </button>
                        <button
                          type="button"
                          onClick={() => choisirOffre(offre.id)}
                          className="rounded-cid border border-text-tertiary/20 px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary"
                        >
                          {t("offres.annuler_selection")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">{t("historique.titre")}</h2>
        {mesSouscriptions.isLoading && (
          <p className="text-sm text-text-tertiary">{t("historique.chargement")}</p>
        )}
        {mesSouscriptions.isError && (
          <p className="text-sm text-status-dangerText">{t("historique.erreur")}</p>
        )}
        {mesSouscriptions.data && mesSouscriptions.data.results.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("historique.aucun")}</p>
        )}
        {mesSouscriptions.data && mesSouscriptions.data.results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                  <th className="py-1">{t("historique.col_campagne")}</th>
                  <th className="py-1">{t("historique.col_offre")}</th>
                  <th className="py-1">{t("historique.col_prix")}</th>
                  <th className="py-1">{t("historique.col_statut")}</th>
                  <th className="py-1">{t("historique.col_date")}</th>
                </tr>
              </thead>
              <tbody>
                {mesSouscriptions.data.results.map((s) => {
                  const camp = campagnesById.get(s.campagne);
                  const offreNom = camp?.offres.find((o) => o.id === s.offre)?.nom;
                  return (
                    <tr key={s.id} className="border-b border-text-tertiary/10 last:border-0">
                      <td className="py-1">{camp?.nom ?? "—"}</td>
                      <td className="py-1">{offreNom ?? "—"}</td>
                      <td className="py-1">{formatMontant(s.prix_paye)}</td>
                      <td className="py-1">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[s.statut]}`}
                        >
                          {t(`statut.${s.statut}`)}
                        </span>
                      </td>
                      <td className="py-1">{formatDate(s.date_souscription)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">{t("historique_statut.titre")}</h2>
        {monHistoriqueStatut.isLoading && (
          <p className="text-sm text-text-tertiary">{t("historique_statut.chargement")}</p>
        )}
        {monHistoriqueStatut.isError && (
          <p className="text-sm text-status-dangerText">{t("historique_statut.erreur")}</p>
        )}
        {monHistoriqueStatut.data && monHistoriqueStatut.data.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("historique_statut.aucun")}</p>
        )}
        {monHistoriqueStatut.data && monHistoriqueStatut.data.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                <th className="py-1">{t("historique_statut.col_annee")}</th>
                <th className="py-1">{t("historique_statut.col_statut")}</th>
                <th className="py-1">{t("historique_statut.col_date")}</th>
              </tr>
            </thead>
            <tbody>
              {monHistoriqueStatut.data.map((entree) => (
                <tr key={entree.annee} className="border-b border-text-tertiary/10 last:border-0">
                  <td className="py-1">{entree.annee}</td>
                  <td className="py-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        entree.statut === "actif"
                          ? "bg-status-successBg text-status-successText"
                          : "bg-bg-tertiary text-text-secondary"
                      }`}
                    >
                      {t(`historique_statut.statut.${entree.statut}`)}
                    </span>
                  </td>
                  <td className="py-1">{formatDate(entree.date_effet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaiementStepper />

      <ConfirmDialog
        open={retraitOuvert}
        title={t("hero.confirmer_retrait_titre")}
        message={t("hero.confirmer_retrait_message")}
        danger
        onConfirm={confirmerRetrait}
        onCancel={() => setRetraitOuvert(false)}
      />
    </div>
  );
}
