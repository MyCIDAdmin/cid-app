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
 *
 * Release 2026.11 (Variante B „Karte im Mittelpunkt“, Entwurf vom 31.10.2026) : die Seite führt
 * statt nur Zustände zu zeigen. Oben ein „Nächster Schritt“ (NaechsterSchritt.tsx), bei bezahlter
 * Mitgliedschaft die große drehbare Karte mit Kennzahlen (MitgliedsKarteAbschnitt.tsx), darunter
 * Vorteile, Familienpaket, Beitrag & Zahlungen und Verlauf als einklappbare Bereiche. Alle
 * bisherigen Inhalte und Abläufe bleiben erhalten ; nur ihre Anordnung ändert sich.
 *
 * Release 2026.11, Angebote A (Konzept_Angebote_Beitritt.md) : der Angebotsbereich ist die
 * Komponente AngebotsAuswahl (Für wen?, Rabatt-Chips, Kacheln mit Kartenvorschau und sichtbaren
 * Rabatten, feste Beitrittsleiste, Vergleich). Diese Seite behält Auswahl, Rabatt, Familie und
 * den Beitritt (handleSouscrire, Profil ergänzen) ; die Kacheln sind Radio-Auswahl statt
 * Aufklappen. Eine stornierte oder abgelaufene Mitgliedschaft erscheint als neutrale Karte
 * „Deine letzte Mitgliedschaft“, der Beitragsbereich bleibt für Nicht-Mitglieder eingeklappt.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import Akkordeon from "../../components/adhesions/Akkordeon";
import FamilienBereich from "../../components/adhesions/FamilienBereich";
import AngebotsAuswahl from "../../components/adhesions/AngebotsAuswahl";
import { LEERE_FAMILIE, type FamilienEingabe } from "../../components/adhesions/familienpreis";
import MitgliedsKarteAbschnitt from "../../components/adhesions/MitgliedsKarteAbschnitt";
import NaechsterSchritt from "../../components/adhesions/NaechsterSchritt";
import { schrittArt, type SchrittZiel } from "../../components/adhesions/naechsterSchritt";
import PaiementStepper from "../../components/adhesions/PaiementStepper";
import VorteileKacheln from "../../components/adhesions/VorteileKacheln";
import { vorteileMitDarstellung } from "../../components/adhesions/vorteile";
import ZahlungsInfoDialog from "../../components/adhesions/ZahlungsInfoDialog";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
  useAnnulerSouscription,
  useCampagneActive,
  useCampagnes,
  useMesSouscriptions,
  useMeineEinladungen,
  useSouscrire,
  useUploaderJustificatif,
} from "../../hooks/useAdhesions";
import { useMonHistoriqueStatut } from "../../hooks/useMembres";
import type {
  Beziehung,
  CampagneAdhesion,
  OffreAdhesion,
  Souscription,
  StatutSouscription,
} from "../../types/adhesion";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";
import { uebersetzt } from "../../utils/uebersetzung";
import { lokaleSprache } from "../../utils/datum";

const STATUTS_RETIRABLES: StatutSouscription[] = [
  "brouillon",
  "en_attente_justificatif",
  "en_attente_paiement",
  "rabais_refuse",
];

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

/** Ganze Tage von heute bis einschließlich `isoDatum` (nie negativ). */
function tageBis(isoDatum: string): number | null {
  const ende = new Date(`${isoDatum}T23:59:59`);
  if (Number.isNaN(ende.getTime())) return null;
  return Math.max(0, Math.ceil((ende.getTime() - Date.now()) / 86_400_000));
}

function springeZu(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduziert =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduziert ? "auto" : "smooth", block: "start" });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lokaleSprache());
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
  // Familienpaket (R35): alle Personen für das gerade aufgeklappte Angebot.
  const [familie, setFamilie] = useState<FamilienEingabe>(LEERE_FAMILIE);
  const meineEinladungen = useMeineEinladungen();
  const fichierInputRef = useRef<HTMLInputElement>(null);

  const campagne = campagneActive.data;
  const user = useAuthStore((st) => st.user);
  const kartenName = [user?.prenom, user?.nom].filter(Boolean).join(" ");

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
  // Storniert oder abgelaufen : keine laufende Mitgliedschaft, also neutrale Karte statt Statuskachel.
  const beendet =
    souscriptionActuelle?.statut === "annulee" || souscriptionActuelle?.statut === "expiree";

  // Tage bis zum letzten Tag der Kampagne (inklusive) ; null ohne Kampagne.
  const tage = campagne ? tageBis(campagne.date_fin) : null;
  const art = schrittArt({ hatKampagne: !!campagne, souscription: souscriptionActuelle, tage });

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

  const vorteile = souscriptionActuelle
    ? vorteileMitDarstellung(souscriptionActuelle.snapshot_avantages, offreActuelle?.avantages)
    : [];

  // Auswahl einer Kachel (Radio-Verhalten) ; `null` hebt sie auf. Ein Rabatt aus den Chips über den
  // Kacheln (Studierende, Senioren) wird gleich mit übernommen.
  function choisirOffre(offreId: string | null, rabaisId: string | null = null) {
    setOffreSelectionneeId(offreId);
    setRabaisSelectionneId(offreId ? rabaisId : null);
    // Bei erneuter Wahl desselben Angebots die bisher eingetragenen Personen vorbelegen (die
    // Einwilligung muss neu bestätigt werden).
    const gleich = souscriptionActuelle?.offre === offreId;
    setFamilie(
      gleich && souscriptionActuelle
        ? {
            erwachsene: souscriptionActuelle.erwachsene.map((e) => ({
              vorname: e.vorname,
              nachname: e.nachname,
              email: e.email,
              beziehung: e.beziehung,
            })),
            kinder: souscriptionActuelle.kinder.map((k) => ({
              vorname: k.vorname,
              nachname: k.nachname,
              geburtsjahr: String(k.geburtsjahr),
              beziehung: k.beziehung,
            })),
            einwilligung: false,
          }
        : LEERE_FAMILIE,
    );
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

  const [zahlungsInfoOffen, setZahlungsInfoOffen] = useState(false);

  function schrittAktion(ziel: SchrittZiel) {
    if (ziel === "zahlung") setZahlungsInfoOffen(true);
    else springeZu(ziel === "nachweis" ? "mitgliedschaft-nachweis" : "mitgliedschaft-angebote");
  }

  function handleSouscrire() {
    if (!offreSelectionnee) return;
    souscrireMutation.mutate(
      {
        offre: offreSelectionnee.id,
        rabais: rabaisSelectionne?.id,
        ...(offreSelectionnee.ist_familienpaket
          ? {
              erwachsene: familie.erwachsene.map((e) => ({
                vorname: e.vorname.trim(),
                nachname: e.nachname.trim(),
                email: e.email.trim(),
                beziehung: e.beziehung as Beziehung,
              })),
              kinder: familie.kinder.map((k) => ({
                vorname: k.vorname.trim(),
                nachname: k.nachname.trim(),
                geburtsjahr: Number(k.geburtsjahr),
                beziehung: k.beziehung,
                einwilligung: familie.einwilligung,
              })),
            }
          : {}),
      },
      {
        onSuccess: (souscription) => {
          setOffreSelectionneeId(null);
          setRabaisSelectionneId(null);
          // Wie beim Shop : direkt nach der Anmeldung die Zahlungsinfos zeigen.
          if (souscription.statut !== "payee") setZahlungsInfoOffen(true);
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

      {(meineEinladungen.data ?? []).length > 0 && (
        <div className="mb-5 rounded-cid-lg border border-status-warningText/30 bg-status-warningBg p-4 text-sm">
          <h2 className="mb-1 text-sm font-bold text-text-primary">
            {t("einladung.banner_titel")}
          </h2>
          <ul className="space-y-1">
            {(meineEinladungen.data ?? []).map((e) => (
              <li key={e.token} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-text-secondary">
                  {t("einladung.banner_zeile", {
                    hauptperson: e.hauptperson,
                    kampagne: e.kampagne,
                  })}
                </span>
                <Link
                  to={`/einladung/${e.token}`}
                  className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad"
                >
                  {t("einladung.ansehen")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {souscriptionActuelle?.familien_info?.rolle === "mitglied" && (
        <div className="mb-5 rounded-cid-lg bg-bg-primary p-4 text-sm shadow-sm">
          <h2 className="mb-1 text-xs font-bold text-text-primary">
            {t("familie.mitglied_titel")}
          </h2>
          <p className="text-text-secondary">
            {t("familie.mitglied_text", {
              hauptperson: souscriptionActuelle.familien_info.hauptperson,
              liste: formatMontant(souscriptionActuelle.familien_info.listenpreis),
              anteil: formatMontant(souscriptionActuelle.familien_info.anteil),
            })}
          </p>
        </div>
      )}

      {art && (
        <NaechsterSchritt
          art={art}
          tage={tage}
          betrag={souscriptionActuelle ? formatMontant(souscriptionActuelle.prix_paye) : undefined}
          onZiel={schrittAktion}
        />
      )}

      {/* Bezahlte Mitgliedschaft → große drehbare Karte mit Kennzahlen ; sonst (Antrag offen,
          Nachweis fehlt …) bleibt die bisherige Statuskachel. */}
      {souscriptionActuelle && dejaPayee && (
        <MitgliedsKarteAbschnitt
          stil={
            souscriptionActuelle.familien_info?.rolle === "hauptperson"
              ? souscriptionActuelle.familien_info.kartenstil
              : offreActuelle?.kartenstil
          }
          angebot={
            souscriptionActuelle.familien_info?.rolle === "hauptperson"
              ? souscriptionActuelle.familien_info.angebot
              : offreActuelle
                ? uebersetzt(offreActuelle, "nom")
                : "—"
          }
          kampagne={campagne?.nom}
          gueltigBis={campagne ? formatDate(campagne.date_fin) : undefined}
          vorteile={vorteile}
          tage={tage}
        />
      )}

      {souscriptionActuelle && beendet && (
        <div className="mb-5 rounded-cid-lg border border-text-tertiary/15 bg-bg-primary p-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t("angebote.letzte_mitgliedschaft")}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-base font-bold text-text-primary">
              {offreActuelle ? uebersetzt(offreActuelle, "nom") : "—"}
            </span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[souscriptionActuelle.statut]}`}
            >
              {t(`statut.${souscriptionActuelle.statut}`)}
            </span>
          </div>
          {campagne && (
            <p className="mt-1 text-sm text-text-secondary">
              {t("hero.campagne", { nom: campagne.nom })} ·{" "}
              {formatMontant(souscriptionActuelle.prix_paye)}
            </p>
          )}
        </div>
      )}

      {souscriptionActuelle && !dejaPayee && !beendet && (
        <div className="mb-5 rounded-cid-lg bg-ca p-5 text-white shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/80">
            {t("hero.titre")}
          </h2>
          <div className="mt-1 text-lg font-bold">
            {offreActuelle ? uebersetzt(offreActuelle, "nom") : "—"}
          </div>
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
          {(souscriptionActuelle.statut === "en_attente_paiement" ||
            souscriptionActuelle.statut === "en_attente_justificatif") && (
            <button
              type="button"
              onClick={() => setZahlungsInfoOffen(true)}
              className="mt-3 mr-2 rounded-cid bg-white px-3 py-1.5 text-xs font-semibold text-ca hover:bg-white/90"
            >
              {t("zahlung.anzeigen")}
            </button>
          )}
          {peutRetirer && (
            <div className="mt-3 inline-block">
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

      {zahlungsInfoOffen && souscriptionActuelle && (
        <ZahlungsInfoDialog
          angebot={offreActuelle ? uebersetzt(offreActuelle, "nom") : "—"}
          kampagne={campagne?.nom}
          betrag={souscriptionActuelle.prix_paye}
          nachweisOffen={souscriptionActuelle.statut === "en_attente_justificatif"}
          onClose={() => setZahlungsInfoOffen(false)}
        />
      )}

      {souscriptionActuelle?.statut === "en_attente_justificatif" && (
        <div
          id="mitgliedschaft-nachweis"
          className="mb-5 scroll-mt-4 rounded-cid-lg border border-status-warningText/30 bg-status-warningBg p-4"
        >
          <h2 className="mb-1 text-sm font-bold text-text-primary">{t("justificatif.titre")}</h2>
          {rabaisActuel && (
            <p className="mb-3 text-xs text-text-secondary">
              {uebersetzt(rabaisActuel, "instructions_fr")}
            </p>
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

      {dejaPayee && vorteile.length > 0 && (
        <Akkordeon
          titel={t("bereich.vorteile")}
          hinweis={t("bereich.vorteile_anzahl", { count: vorteile.length })}
        >
          <VorteileKacheln vorteile={vorteile} />
        </Akkordeon>
      )}

      {souscriptionActuelle &&
        offreActuelle?.ist_familienpaket &&
        souscriptionActuelle.statut !== "annulee" &&
        souscriptionActuelle.statut !== "expiree" && (
          <Akkordeon
            titel={t("familie.titel")}
            offen={
              !dejaPayee ||
              (souscriptionActuelle.erwachsene ?? []).some((e) => e.status !== "angenommen")
            }
          >
            <FamilienBereich
              souscription={souscriptionActuelle}
              kampagne={campagne?.nom}
              gueltigBis={campagne ? formatDate(campagne.date_fin) : undefined}
              eingebettet
            />
          </Akkordeon>
        )}

      {!dejaPayee && (
        <div
          id="mitgliedschaft-angebote"
          className="scroll-mt-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
        >
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
          {campagne && offresVisibles.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("offres.aucune_campagne")}</p>
          )}

          {campagne && offresVisibles.length > 0 && (
            <AngebotsAuswahl
              campagne={campagne}
              angebote={offresVisibles}
              populaerExplizit={uneOffrePopulaireExplicite}
              name={kartenName}
              auswahlId={offreSelectionneeId}
              rabaisId={rabaisSelectionneId}
              familie={familie}
              hatAnmeldung={!!souscriptionActuelle}
              wirdGesendet={souscrireMutation.isPending}
              fehler={souscrireMutation.isError ? souscrireMutation.error : null}
              onWaehlen={choisirOffre}
              onRabais={setRabaisSelectionneId}
              onFamilie={setFamilie}
              onAbsenden={handleSouscrire}
            />
          )}
        </div>
      )}

      <Akkordeon
        titel={t("bereich.beitrag")}
        offen={!!souscriptionActuelle && !dejaPayee && !beendet}
      >
        <PaiementStepper />
      </Akkordeon>

      <Akkordeon titel={t("bereich.verlauf")}>
        <div>
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
                    const offreDaten = camp?.offres.find((o) => o.id === s.offre);
                    const offreNom = offreDaten ? uebersetzt(offreDaten, "nom") : undefined;
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

        <div className="mt-5">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {t("historique_statut.titre")}
          </h2>
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
      </Akkordeon>

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
