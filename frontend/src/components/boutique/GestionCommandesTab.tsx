/**
 * Onglet "Commandes" de la page Admin — Boutique (mockup #pg-admin-boutique, tab-pane
 * btq-cmd) : liste de toutes les commandes (Bureau Admin+ voit tout, voir
 * CommandeViewSet.get_queryset), filtrable par statut, avec changement de statut et
 * annulation. Ne couvre que la première page du cursor (comme les autres pages de gestion de
 * ce module — voir MonAdhesionPage) : limite connue, acceptable pour ce périmètre.
 *
 * Workflow paiement/expédition/retours (demande utilisateur du 2026-09-15, voir
 * apps/boutique/views.py côté backend) :
 *   - "Zahlungseingang bestätigen" (confirmer_paiement) et "Versenden"/"Nacherfassung"
 *     (expedier) sont réservés à PAIEMENT_EXPEDITION_MIN_LEVEL (Directeur Financier+),
 *     seuil plus strict que la gestion générale des commandes — gaté ici via
 *     `hasRoleAtLeast(user, ROLE_LEVELS.dir_financier)`, en miroir de CommandePermission
 *     côté backend (le backend reste seul juge, ce gating n'est qu'un confort d'UI).
 *   - "Retoure erfassen" (création d'un Retour) reste au seuil Bureau Admin+, comme le
 *     reste de la gestion des commandes.
 *
 * Lecture seule (task #216, 2026-09-24) : `modifiable` (optionnel, défaut `true` pour ne pas
 * casser les tests existants qui rendent ce composant seul) vient de la matrice "page_boutique"
 * via AdminBoutiquePage/usePageAccess — désactive "changer_statut" et la création d'un Retour.
 * "confirmer_paiement"/"expedier" restent EXCLUSIVEMENT sous `peutConfirmerPaiementEtExpedier`
 * ci-dessus (hors périmètre de la matrice, voir docstring ci-dessus) : volontairement PAS gatés
 * par `modifiable`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import AktionsBlatt from "./AktionsBlatt";
import BestellDetails from "./BestellDetails";
import BestellFortschritt from "./BestellFortschritt";
import ConfirmDialog from "../ui/ConfirmDialog";
import { Fachwort, HilfeHinweis } from "../ui/Erklaerung";
import {
  exporterCommandesExcel,
  telechargerConfirmationCommande,
  telechargerFactureCommande,
} from "../../api/boutique";
import {
  useAnnulerCommande,
  useChangerStatutCommande,
  useCommandes,
  useConfirmerPaiementCommande,
  useCreerRetourLot,
  useExpedierCommande,
  useProduits,
  useVerwaltungUeberblick,
} from "../../hooks/useBoutique";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import {
  STAPEL_REIHENFOLGE,
  STAPEL_STATUTS,
  STATUTS_ANNULABLES,
  STATUTS_RETOURNABLES,
  type Commande,
  type ModePaiementCommande,
  type MotifRetour,
  type StapelName,
  type StatutCommande,
} from "../../types/boutique";
import { extractApiErrorMessage } from "../../utils/apiError";
import { hintergrundKlick } from "../../hooks/useEscapeSchliessen";
import { EscapeSchliessen } from "../../components/ui/EscapeSchliessen";
import { lokaleSprache } from "../../utils/datum";

/** Déclenche le téléchargement d'un blob côté navigateur — même pattern que
 * CotisationStepperPage.telechargerRecu/MembresListPage.exporter. */
function declencherTelechargement(blob: Blob, nomFichier: string) {
  const url = window.URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}

const MODES_PAIEMENT: ModePaiementCommande[] = ["en_ligne", "virement", "especes"];
const MOTIFS_RETOUR: MotifRetour[] = [
  "defectueux",
  "mauvaise_taille",
  "ne_convient_pas",
  "erreur_envoi",
  "autre",
];

const STATUT_STYLES: Record<StatutCommande, string> = {
  en_attente: "bg-status-warningBg text-status-warningText",
  confirmee: "bg-status-successBg text-status-successText",
  en_preparation: "bg-status-warningBg text-status-warningText",
  expediee: "bg-bg-tertiary text-text-secondary",
  livree: "bg-status-successBg text-status-successText",
  annulee: "bg-status-dangerBg text-status-dangerText",
  remboursee: "bg-status-dangerBg text-status-dangerText",
};

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(lokaleSprache());
}

interface ExpeditionModalState {
  commande: Commande;
  nacherfassement: boolean;
}

type BlattArt = "zahlung" | "geliefert" | "erstattet" | "vorbereitung";

interface Aktion {
  key: string;
  label: string;
  erlaubt: boolean;
  hinweis?: string;
  gefahr?: boolean;
  run: () => void;
}

export default function GestionCommandesTab({
  modifiable = true,
  startStapel = "",
}: { modifiable?: boolean; startStapel?: StapelName | "" } = {}) {
  const { t } = useTranslation(["boutique", "common"]);
  const user = useAuthStore((s) => s.user);
  const peutConfirmerPaiementEtExpedier = hasRoleAtLeast(user, ROLE_LEVELS.dir_financier);
  const peutGererRetours = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  // „Stapel“ statt sieben technischer Status (Shop-Verwaltung einfacher, 2026-11-02): die Chips
  // fassen die Status zusammen; die Zahlen kommen vollständig vom Überblick-Endpunkt.
  const [stapel, setStapel] = useState<StapelName | "">(startStapel);
  const { data: ueberblick } = useVerwaltungUeberblick();
  const [offen, setOffen] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [blatt, setBlatt] = useState<{ art: BlattArt; commande: Commande } | null>(null);
  const statuts = stapel ? STAPEL_STATUTS[stapel].join(",") : undefined;
  // Filtres destinataire/intervalle de dates (demande utilisateur du 2026-09-25, module
  // "Shop-Verwaltung" : "Filtermöglichkeiten hinzufügen z.B. Datumsintervall, Empfänger") — même
  // convention (état contrôlé directement branché sur la query, sans debounce) que
  // MembresListPage.tsx.
  const [filtreDestinataire, setFiltreDestinataire] = useState("");
  const [filtreDateApres, setFiltreDateApres] = useState("");
  const [filtreDateAvant, setFiltreDateAvant] = useState("");
  // Release 6 : Bestellungen/Export pro Artikel (ein oder mehrere Artikel).
  const [filtreProduits, setFiltreProduits] = useState<string[]>([]);
  const produitsQuery = useProduits();
  const [commandeAAnnuler, setCommandeAAnnuler] = useState<Commande | null>(null);
  const [modePaiementParCommande, setModePaiementParCommande] = useState<
    Record<string, ModePaiementCommande>
  >({});
  // Date de transaction backdatée par commande (demande utilisateur du 2026-09-29 : "Bei
  // Zahlungsbestätigung Im Modul [...] 'Shop Verwaltung' das Transaktionsdatum bei der
  // Bestätigung hinzufügen") — vide par défaut (comportement inchangé : date/heure actuelles
  // côté backend, voir ConfirmerPaiementCommandePayload).
  const [datePaiementParCommande, setDatePaiementParCommande] = useState<Record<string, string>>(
    {},
  );

  // Téléchargement des documents PDF (confirmation/facture, demande utilisateur du 2026-09-25) —
  // `documentEnCours` retient "<commandeId>-<type>" pour ne désactiver que le bouton concerné.
  const [documentEnCours, setDocumentEnCours] = useState<string | null>(null);
  const [erreurDocument, setErreurDocument] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [erreurExport, setErreurExport] = useState<string | null>(null);

  const [expeditionModal, setExpeditionModal] = useState<ExpeditionModalState | null>(null);
  const [numeroSuivi, setNumeroSuivi] = useState("");
  const [transporteurSaisi, setTransporteurSaisi] = useState("");
  const [dateExpeditionSaisie, setDateExpeditionSaisie] = useState("");
  const [modePaiementNacherfassung, setModePaiementNacherfassung] =
    useState<ModePaiementCommande>("especes");

  // Retour multi-variantes (demande utilisateur du 2026-09-29 : "Bei Shop Verwaltung für
  // Retoure soll es möglich sein, Mengen pro Varianten einzugeben") — `quantitesRetour` associe
  // chaque ligne retournable de la commande à la quantité saisie pour CE retour (0 = ligne non
  // incluse dans le lot), plutôt qu'une seule ligne sélectionnée via <select> comme avant. Motif/
  // commentaire restent partagés pour tout le lot (voir RetourLotPayload/RetourViewSet.lot).
  const [retourModal, setRetourModal] = useState<Commande | null>(null);
  const [quantitesRetour, setQuantitesRetour] = useState<Record<string, number>>({});
  const [motifRetour, setMotifRetour] = useState<MotifRetour>("autre");
  const [commentaireRetour, setCommentaireRetour] = useState("");

  const commandesQuery = useCommandes({
    statuts,
    destinataire: filtreDestinataire || undefined,
    date_apres: filtreDateApres || undefined,
    date_avant: filtreDateAvant || undefined,
    produit: filtreProduits.length > 0 ? filtreProduits.join(",") : undefined,
  });
  const changerStatutMutation = useChangerStatutCommande();
  const annulerMutation = useAnnulerCommande();
  const confirmerPaiementMutation = useConfirmerPaiementCommande();
  const expedierMutation = useExpedierCommande();
  const creerRetourMutation = useCreerRetourLot();

  async function telechargerConfirmation(commande: Commande) {
    setErreurDocument(null);
    setDocumentEnCours(`${commande.id}-confirmation`);
    try {
      const blob = await telechargerConfirmationCommande(commande.id);
      declencherTelechargement(blob, `bestellbestaetigung-${commande.numero_commande}.pdf`);
    } catch (error) {
      setErreurDocument(extractApiErrorMessage(error, t("commandes_admin.erreur_document")));
    } finally {
      setDocumentEnCours(null);
    }
  }

  async function telechargerFacture(commande: Commande) {
    setErreurDocument(null);
    setDocumentEnCours(`${commande.id}-facture`);
    try {
      const blob = await telechargerFactureCommande(commande.id);
      declencherTelechargement(blob, `rechnung-${commande.numero_commande}.pdf`);
    } catch (error) {
      setErreurDocument(extractApiErrorMessage(error, t("commandes_admin.erreur_document")));
    } finally {
      setDocumentEnCours(null);
    }
  }

  async function exporterExcel() {
    setErreurExport(null);
    setExportEnCours(true);
    try {
      const { blob, nomFichier } = await exporterCommandesExcel({
        statuts,
        destinataire: filtreDestinataire || undefined,
        date_apres: filtreDateApres || undefined,
        date_avant: filtreDateAvant || undefined,
        produit: filtreProduits.length > 0 ? filtreProduits.join(",") : undefined,
      });
      declencherTelechargement(blob, nomFichier);
    } catch (error) {
      setErreurExport(extractApiErrorMessage(error, t("commandes_admin.export_erreur")));
    } finally {
      setExportEnCours(false);
    }
  }

  function confirmerAnnulation() {
    if (!commandeAAnnuler) return;
    annulerMutation.mutate(commandeAAnnuler.id, { onSuccess: () => setCommandeAAnnuler(null) });
  }

  const blattFehler =
    blatt?.art === "zahlung"
      ? confirmerPaiementMutation.isError
        ? extractApiErrorMessage(confirmerPaiementMutation.error, t("paiement.erreur"))
        : null
      : changerStatutMutation.isError
        ? extractApiErrorMessage(changerStatutMutation.error, t("commandes_admin.erreur_statut"))
        : null;

  function bestaetigeBlatt() {
    if (!blatt) return;
    const schliessen = { onSuccess: () => setBlatt(null) };
    const { art, commande } = blatt;
    if (art === "zahlung") {
      confirmerPaiementMutation.mutate(
        {
          id: commande.id,
          payload: {
            mode_paiement: modePaiementParCommande[commande.id] ?? "virement",
            date_paiement: datePaiementParCommande[commande.id] || undefined,
          },
        },
        schliessen,
      );
      return;
    }
    if (!modifiable) return;
    const ziel: StatutCommande =
      art === "geliefert" ? "livree" : art === "erstattet" ? "remboursee" : "en_preparation";
    changerStatutMutation.mutate({ id: commande.id, payload: { statut: ziel } }, schliessen);
  }

  /** Der eine Hauptknopf einer Bestellung: der nächste Schritt, falls es einen gibt. */
  function hauptAktion(c: Commande): Aktion | null {
    const nurFinanz = t("bestellung.nur_finanz") ?? "";
    switch (c.statut) {
      case "en_attente":
        return {
          key: "zahlung",
          label: t("paiement.confirmer"),
          erlaubt: peutConfirmerPaiementEtExpedier,
          hinweis: nurFinanz,
          run: () => setBlatt({ art: "zahlung", commande: c }),
        };
      case "confirmee":
      case "en_preparation":
        return {
          key: "versand",
          label: t("expedition.expedier"),
          erlaubt: peutConfirmerPaiementEtExpedier,
          hinweis: nurFinanz,
          run: () => ouvrirExpedition(c, false),
        };
      case "expediee":
        return {
          key: "geliefert",
          label: t("bestellung.als_geliefert"),
          erlaubt: modifiable,
          hinweis: t("common:acces.lecture_seule_tooltip") ?? "",
          run: () => setBlatt({ art: "geliefert", commande: c }),
        };
      default:
        return null;
    }
  }

  /** Alles Seltene steckt hinter „Mehr“ — nur, was für diese Bestellung wirklich möglich ist. */
  function mehrEintraege(c: Commande): Aktion[] {
    const lesemodus = t("common:acces.lecture_seule_tooltip") ?? "";
    const liste: Aktion[] = [];
    if (c.statut === "confirmee") {
      liste.push({
        key: "vorbereitung",
        label: t("bestellung.in_vorbereitung"),
        erlaubt: modifiable,
        hinweis: lesemodus,
        run: () => setBlatt({ art: "vorbereitung", commande: c }),
      });
    }
    if (peutConfirmerPaiementEtExpedier && c.statut === "en_attente") {
      liste.push({
        key: "ausserhalb",
        label: t("nacherfassung.bouton"),
        erlaubt: true,
        run: () => ouvrirExpedition(c, true),
      });
    }
    if (
      peutGererRetours &&
      STATUTS_RETOURNABLES.includes(c.statut) &&
      c.lignes.some((l) => l.quantite_retournable > 0)
    ) {
      liste.push({
        key: "ruecksendung",
        label: t("retour.bouton"),
        erlaubt: modifiable,
        hinweis: lesemodus,
        run: () => ouvrirRetour(c),
      });
    }
    if (c.statut === "expediee" || c.statut === "livree") {
      liste.push({
        key: "erstattet",
        label: t("bestellung.erstattet_markieren"),
        erlaubt: modifiable,
        hinweis: lesemodus,
        run: () => setBlatt({ art: "erstattet", commande: c }),
      });
    }
    liste.push({
      key: "pdf_bestaetigung",
      label: t("bestellung.pdf_bestaetigung"),
      erlaubt: documentEnCours !== `${c.id}-confirmation`,
      run: () => void telechargerConfirmation(c),
    });
    if (c.date_paiement_confirme) {
      liste.push({
        key: "pdf_rechnung",
        label: t("bestellung.pdf_rechnung"),
        erlaubt: documentEnCours !== `${c.id}-facture`,
        run: () => void telechargerFacture(c),
      });
    }
    if (STATUTS_ANNULABLES.includes(c.statut)) {
      liste.push({
        key: "abbrechen",
        label: t("commandes_admin.annuler"),
        erlaubt: true,
        gefahr: true,
        run: () => setCommandeAAnnuler(c),
      });
    }
    return liste;
  }

  function ouvrirExpedition(commande: Commande, nacherfassement: boolean) {
    setExpeditionModal({ commande, nacherfassement });
    setNumeroSuivi("");
    setTransporteurSaisi("");
    setDateExpeditionSaisie("");
    setModePaiementNacherfassung("especes");
  }

  function soumettreExpedition() {
    if (!expeditionModal || !numeroSuivi) return;
    expedierMutation.mutate(
      {
        id: expeditionModal.commande.id,
        payload: {
          numero_suivi: numeroSuivi,
          transporteur: transporteurSaisi || undefined,
          nacherfassement: expeditionModal.nacherfassement,
          ...(expeditionModal.nacherfassement && {
            mode_paiement: modePaiementNacherfassung,
            ...(dateExpeditionSaisie && {
              date_expedition: new Date(dateExpeditionSaisie).toISOString(),
            }),
          }),
        },
      },
      { onSuccess: () => setExpeditionModal(null) },
    );
  }

  function ouvrirRetour(commande: Commande) {
    setRetourModal(commande);
    setQuantitesRetour({});
    setMotifRetour("autre");
    setCommentaireRetour("");
  }

  // Lignes retournables de la commande ouverte, dans l'ordre — calculé une fois ici plutôt
  // qu'inline dans le JSX (utilisé à la fois pour le rendu des champs et pour la validation).
  const lignesRetournables = retourModal?.lignes.filter((l) => l.quantite_retournable > 0) ?? [];

  // Lot effectivement soumis : uniquement les lignes où l'admin a saisi une quantité > 0 (voir
  // RetourLotSerializer.validate_lignes côté backend, qui refuse un lot vide).
  const lignesDuLot = lignesRetournables
    .map((l) => ({ ligne_commande: l.id, quantite: quantitesRetour[l.id] ?? 0 }))
    .filter((l) => l.quantite > 0);

  function soumettreRetour() {
    if (!retourModal || lignesDuLot.length === 0) return;
    creerRetourMutation.mutate(
      {
        commande: retourModal.id,
        motif: motifRetour,
        commentaire: commentaireRetour || undefined,
        lignes: lignesDuLot,
      },
      { onSuccess: () => setRetourModal(null) },
    );
  }

  return (
    <div>
      <div
        className="mb-1 flex flex-wrap gap-2"
        role="group"
        aria-label={t("bestellung.stapel_label")}
      >
        <button
          type="button"
          aria-pressed={stapel === ""}
          onClick={() => setStapel("")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            stapel === "" ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
          }`}
        >
          {t("commandes_admin.tous")}
        </button>
        {STAPEL_REIHENFOLGE.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={stapel === s}
            onClick={() => setStapel(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              stapel === s ? "bg-ca text-white" : "bg-bg-primary text-text-secondary"
            }`}
          >
            {t(`bestellung.stapel.${s}`)}
            {ueberblick?.stapel && (
              <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-[10px]">
                {ueberblick.stapel[s]}
              </span>
            )}
          </button>
        ))}
      </div>
      <HilfeHinweis ns="boutique">
        {t("bestellung.stapel_hilfe")} <Fachwort ns="boutique" begriff="stapel" />.
      </HilfeHinweis>

      <div className="mb-3 mt-3 flex flex-wrap items-end gap-2">
        <input
          type="search"
          aria-label={t("bestellung.suche_label")}
          value={filtreDestinataire}
          onChange={(e) => setFiltreDestinataire(e.target.value)}
          placeholder={t("commandes_admin.filtre_destinataire_placeholder") ?? ""}
          className="min-w-[12rem] flex-1 rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm"
        />
        <details className="relative text-xs">
          <summary className="cursor-pointer rounded-cid border border-text-tertiary/30 px-3 py-1.5 font-medium text-text-secondary">
            {t("bestellung.weitere_filter")}
          </summary>
          <div className="absolute z-20 mt-1 flex w-72 flex-col gap-2 rounded-cid border border-text-tertiary/30 bg-bg-primary p-3 shadow-md">
            <label className="flex flex-col text-[10px] font-medium text-text-secondary">
              {t("commandes_admin.filtre_date_apres_label")}
              <input
                type="date"
                value={filtreDateApres}
                onChange={(e) => setFiltreDateApres(e.target.value)}
                className="mt-0.5 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col text-[10px] font-medium text-text-secondary">
              {t("commandes_admin.filtre_date_avant_label")}
              <input
                type="date"
                value={filtreDateAvant}
                onChange={(e) => setFiltreDateAvant(e.target.value)}
                className="mt-0.5 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs"
              />
            </label>
            <p className="text-[10px] font-medium text-text-secondary">
              {t("commandes_admin.filtre_artikel", { count: filtreProduits.length })}
            </p>
            <div className="max-h-40 overflow-y-auto">
              {(produitsQuery.data?.results ?? []).map((p) => (
                <label key={p.id} className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={filtreProduits.includes(p.id)}
                    onChange={(e) =>
                      setFiltreProduits((alt) =>
                        e.target.checked ? [...alt, p.id] : alt.filter((id) => id !== p.id),
                      )
                    }
                  />
                  <span className="truncate">{p.nom}</span>
                </label>
              ))}
            </div>
            {filtreProduits.length > 0 && (
              <button
                type="button"
                onClick={() => setFiltreProduits([])}
                className="text-left text-ca hover:underline"
              >
                {t("commandes_admin.filtre_artikel_zuruecksetzen")}
              </button>
            )}
          </div>
        </details>
        <button
          type="button"
          onClick={exporterExcel}
          disabled={exportEnCours}
          className="ml-auto rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
        >
          {exportEnCours
            ? t("commandes_admin.export_en_cours")
            : t("commandes_admin.exporter_excel")}
        </button>
      </div>

      {erreurExport && <p className="mb-2 text-xs text-status-dangerText">{erreurExport}</p>}
      {erreurDocument && <p className="mb-2 text-xs text-status-dangerText">{erreurDocument}</p>}
      {expedierMutation.isError && !expeditionModal && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(expedierMutation.error, t("expedition.erreur"))}
        </p>
      )}
      {creerRetourMutation.isError && !retourModal && (
        <p className="mb-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(creerRetourMutation.error, t("retour.erreur"))}
        </p>
      )}

      <ul className="space-y-3">
        {commandesQuery.data?.results.map((commande) => {
          const haupt = hauptAktion(commande);
          const eintraege = mehrEintraege(commande);
          const geoeffnet = offen === commande.id;
          return (
            <li
              key={commande.id}
              className="rounded-cid-lg bg-bg-primary p-3 shadow-sm"
              data-commande={commande.numero_commande}
            >
              <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {commande.nom_destinataire}{" "}
                    <span className="font-mono text-[11px] font-normal text-text-tertiary">
                      {commande.numero_commande}
                    </span>
                  </p>
                  <p className="text-xs text-text-secondary">
                    {formatDate(commande.created_at)}
                    {commande.mode_paiement && ` · ${t(`paiement.mode.${commande.mode_paiement}`)}`}
                    {commande.numero_suivi &&
                      ` · ${t("expedition.suivi_label", {
                        numero: commande.numero_suivi,
                        transporteur: commande.transporteur || "—",
                      })}`}
                  </p>
                </div>
                <BestellFortschritt statut={commande.statut} />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <b className="text-base tabular-nums text-ca">
                    {formatMontant(commande.montant_total)}
                  </b>
                  {haupt && (
                    <button
                      type="button"
                      onClick={haupt.run}
                      disabled={!haupt.erlaubt}
                      title={haupt.erlaubt ? "" : (haupt.hinweis ?? "")}
                      className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                    >
                      {haupt.label}
                    </button>
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={menu === commande.id}
                      onClick={() => setMenu(menu === commande.id ? null : commande.id)}
                      className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
                    >
                      {t("bestellung.mehr")}
                    </button>
                    {menu === commande.id && (
                      <>
                        <button
                          type="button"
                          aria-label={t("modal_annuler")}
                          tabIndex={-1}
                          onClick={() => setMenu(null)}
                          className="fixed inset-0 z-10 cursor-default"
                        />
                        <div
                          role="menu"
                          className="absolute right-0 z-20 mt-1 flex w-60 flex-col rounded-cid border border-text-tertiary/30 bg-bg-primary py-1 shadow-md"
                        >
                          {eintraege.map((e) => (
                            <button
                              key={e.key}
                              type="button"
                              role="menuitem"
                              disabled={!e.erlaubt}
                              title={e.erlaubt ? "" : (e.hinweis ?? "")}
                              onClick={() => {
                                setMenu(null);
                                e.run();
                              }}
                              className={`px-3 py-2 text-left text-xs hover:bg-bg-tertiary disabled:opacity-40 ${
                                e.gefahr ? "text-status-dangerText" : "text-text-secondary"
                              }`}
                            >
                              {e.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[commande.statut]}`}
                >
                  {t(`statut_commande.${commande.statut}`)}
                </span>
                {haupt && !haupt.erlaubt && haupt.hinweis && (
                  <span className="text-[11px] text-text-tertiary">{haupt.hinweis}</span>
                )}
                <button
                  type="button"
                  aria-expanded={geoeffnet}
                  onClick={() => setOffen(geoeffnet ? null : commande.id)}
                  className="rounded-cid border border-text-tertiary/30 px-2 py-0.5 text-[11px] text-ca hover:bg-bg-tertiary"
                >
                  {geoeffnet ? t("bestellung.details_aus") : t("bestellung.details")}
                </button>
              </div>
              {geoeffnet && <BestellDetails commande={commande} />}
            </li>
          );
        })}
      </ul>
      {commandesQuery.data && commandesQuery.data.results.length === 0 && (
        <p className="rounded-cid-lg bg-bg-primary p-4 text-center text-sm text-text-tertiary shadow-sm">
          {t("commandes_admin.aucune_commande")}
        </p>
      )}

      {blatt && (
        <AktionsBlatt
          titel={t(`bestellung.blatt.${blatt.art}.titel`)}
          nummer={`${blatt.commande.nom_destinataire} · ${blatt.commande.numero_commande}`}
          folge={t(`bestellung.blatt.${blatt.art}.folge`)}
          knopf={t(`bestellung.blatt.${blatt.art}.knopf`)}
          onBestaetigen={bestaetigeBlatt}
          onClose={() => setBlatt(null)}
          laeuft={confirmerPaiementMutation.isPending || changerStatutMutation.isPending}
          gefahr={blatt.art === "erstattet"}
          fehler={blattFehler}
        >
          {blatt.art === "zahlung" && (
            <>
              <label className="text-xs font-medium text-text-secondary">
                {t("paiement.mode_label")}
                <select
                  aria-label={t("paiement.mode_label")}
                  value={modePaiementParCommande[blatt.commande.id] ?? "virement"}
                  onChange={(e) =>
                    setModePaiementParCommande((prev) => ({
                      ...prev,
                      [blatt.commande.id]: e.target.value as ModePaiementCommande,
                    }))
                  }
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  {MODES_PAIEMENT.map((m) => (
                    <option key={m} value={m}>
                      {t(`paiement.mode.${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-text-secondary">
                {t("paiement.date_paiement_label")}
                <input
                  type="date"
                  aria-label={t("paiement.date_paiement_label")}
                  value={datePaiementParCommande[blatt.commande.id] ?? ""}
                  onChange={(e) =>
                    setDatePaiementParCommande((prev) => ({
                      ...prev,
                      [blatt.commande.id]: e.target.value,
                    }))
                  }
                  max={new Date().toISOString().slice(0, 10)}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </label>
            </>
          )}
        </AktionsBlatt>
      )}

      <ConfirmDialog
        open={!!commandeAAnnuler}
        title={t("commandes_admin.confirmer_annulation_titre")}
        message={t("commandes_admin.confirmer_annulation_message", {
          numero: commandeAAnnuler?.numero_commande,
        })}
        danger
        onConfirm={confirmerAnnulation}
        onCancel={() => setCommandeAAnnuler(null)}
      />

      {expeditionModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="expedition-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          {...hintergrundKlick(() => setExpeditionModal(null))}
        >
          <EscapeSchliessen onClose={() => setExpeditionModal(null)} />
          <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-5 shadow-xl">
            <h2 id="expedition-modal-title" className="text-base font-semibold text-text-primary">
              {expeditionModal.nacherfassement ? t("nacherfassung.titre") : t("expedition.titre")}
            </h2>
            <p className="mt-1 text-xs text-text-tertiary">
              {expeditionModal.commande.numero_commande}
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-xs font-medium text-text-secondary">
                {t("expedition.numero_suivi_label")}
                <input
                  type="text"
                  value={numeroSuivi}
                  onChange={(e) => setNumeroSuivi(e.target.value)}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-text-secondary">
                {t("expedition.transporteur_label")}
                <input
                  type="text"
                  value={transporteurSaisi}
                  onChange={(e) => setTransporteurSaisi(e.target.value)}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </label>

              {expeditionModal.nacherfassement && (
                <>
                  <label className="text-xs font-medium text-text-secondary">
                    {t("paiement.mode_label")}
                    <select
                      value={modePaiementNacherfassung}
                      onChange={(e) =>
                        setModePaiementNacherfassung(e.target.value as ModePaiementCommande)
                      }
                      className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                    >
                      {MODES_PAIEMENT.map((m) => (
                        <option key={m} value={m}>
                          {t(`paiement.mode.${m}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-text-secondary">
                    {t("nacherfassung.date_expedition_label")}
                    <input
                      type="datetime-local"
                      value={dateExpeditionSaisie}
                      onChange={(e) => setDateExpeditionSaisie(e.target.value)}
                      className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                    />
                  </label>
                </>
              )}
            </div>

            {expedierMutation.isError && (
              <p className="mt-2 text-xs text-status-dangerText">
                {extractApiErrorMessage(expedierMutation.error, t("expedition.erreur"))}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpeditionModal(null)}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("modal_annuler")}
              </button>
              <button
                type="button"
                onClick={soumettreExpedition}
                disabled={!numeroSuivi || expedierMutation.isPending}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {expeditionModal.nacherfassement
                  ? t("nacherfassung.confirmer")
                  : t("expedition.confirmer")}
              </button>
            </div>
          </div>
        </div>
      )}

      {retourModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="retour-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          {...hintergrundKlick(() => setRetourModal(null))}
        >
          <EscapeSchliessen onClose={() => setRetourModal(null)} />
          <div className="w-full max-w-sm rounded-cid-lg bg-bg-primary p-5 shadow-xl">
            <h2 id="retour-modal-title" className="text-base font-semibold text-text-primary">
              {t("retour.titre")}
            </h2>
            <p className="mt-1 text-xs text-text-tertiary">{retourModal.numero_commande}</p>

            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-text-secondary">{t("retour.lignes_titre")}</p>
              {/* Une ligne par variante retournable (demande utilisateur du 2026-09-29 : "Mengen
                  pro Varianten einzugeben") — un input à 0 signifie "pas incluse dans ce retour",
                  voir lignesDuLot ci-dessus. */}
              <div className="flex flex-col gap-2 rounded-cid border border-text-tertiary/20 p-2">
                {lignesRetournables.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text-secondary">
                      {t("retour.ligne_option", {
                        artikel: [l.produit_nom, l.variante_label].filter(Boolean).join(", "),
                        quantite: l.quantite,
                        prix: l.prix_unitaire,
                        retournable: l.quantite_retournable,
                      })}
                    </span>
                    <input
                      type="number"
                      aria-label={t("retour.quantite_label")}
                      min={0}
                      max={l.quantite_retournable}
                      value={quantitesRetour[l.id] ?? 0}
                      onChange={(e) => {
                        const valeur = Math.max(
                          0,
                          Math.min(Number(e.target.value), l.quantite_retournable),
                        );
                        setQuantitesRetour((prev) => ({ ...prev, [l.id]: valeur }));
                      }}
                      className="w-20 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                    />
                  </div>
                ))}
              </div>
              <label className="text-xs font-medium text-text-secondary">
                {t("retour.motif_label")}
                <select
                  value={motifRetour}
                  onChange={(e) => setMotifRetour(e.target.value as MotifRetour)}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  {MOTIFS_RETOUR.map((m) => (
                    <option key={m} value={m}>
                      {t(`retour.motif.${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-text-secondary">
                {t("retour.commentaire_label")}
                <textarea
                  value={commentaireRetour}
                  onChange={(e) => setCommentaireRetour(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            {creerRetourMutation.isError && (
              <p className="mt-2 text-xs text-status-dangerText">
                {extractApiErrorMessage(creerRetourMutation.error, t("retour.erreur"))}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRetourModal(null)}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("modal_annuler")}
              </button>
              <button
                type="button"
                onClick={soumettreRetour}
                disabled={lignesDuLot.length === 0 || creerRetourMutation.isPending || !modifiable}
                title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("retour.confirmer")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
