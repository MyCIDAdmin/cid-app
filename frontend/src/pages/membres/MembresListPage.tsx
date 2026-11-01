/**
 * Répertoire des membres (mockup #pg-admin-membres). Backend scope déjà le
 * queryset selon le rôle (apps.membres.views.MembreViewSet.get_queryset) :
 * un rôle < RH ne voit ici que sa propre fiche, sans qu'on ait besoin de
 * dupliquer cette logique côté frontend.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ExportChampsDialog from "../../components/membres/ExportChampsDialog";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import FilterUmschalter from "../../components/ui/FilterUmschalter";
import { filterBlockKlasse } from "../../utils/filter";
import StatutBadge from "../../components/ui/StatutBadge";
import { exporterMembres } from "../../api/membres";
import type { MembresOrdering, SammelLoeschErgebnis } from "../../api/membres";
import { useDeleteMembre, useMembresList, useSupprimerMembresLot } from "../../hooks/useMembres";
import { usePageAccess } from "../../hooks/useRbac";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { BUNDESLANDER, CHAMPS_EXPORT, PAYS_ALLEMAGNE, PAYS_MEMBRE } from "../../types/membre";
import type { ChampExport, StatutMembre } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";

// Muss zur Obergrenze im Backend passen (apps.membres.views.MAX_SAMMELLOESCHUNG).
const MAX_SAMMELLOESCHUNG = 200;

const TOUS_LES_CHAMPS_EXPORT: ChampExport[] = CHAMPS_EXPORT.map((c) => c.value);

function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

export default function MembresListPage() {
  const { t } = useTranslation("membres");
  const user = useAuthStore((s) => s.user);
  const peutGerer = hasRoleAtLeast(user, ROLE_LEVELS.rh);
  // Import und Zuordnung hängen seit 2026-10-12 an der Matrix der Rollenverwaltung.
  const importZugriff = usePageAccess("page_membres_import").accessible;
  const zuordnungZugriff = usePageAccess("page_membres_zuordnung").accessible;
  const peutSupprimer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const [statut, setStatut] = useState<StatutMembre | "">("");
  const [ville, setVille] = useState("");
  const [q, setQ] = useState("");
  // Ajoutés le 2026-09-19 (demande utilisateur : "füge mehr Filtermöglichten hinzu z.B.
  // Bundesland") — le backend (apps.membres.filters.MembreFilter) les supportait déjà, seule
  // l'UI manquait.
  const [land, setLand] = useState("");
  const [pays, setPays] = useState("");
  const [dateAdhesionApres, setDateAdhesionApres] = useState("");
  const [dateAdhesionAvant, setDateAdhesionAvant] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  // Handy : Filterblock eingeklappt (ab md immer sichtbar, siehe FilterUmschalter).
  const [filterOffen, setFilterOffen] = useState(false);
  const aktiveFilter = [statut, ville, q, land, pays, dateAdhesionApres, dateAdhesionAvant].filter(
    (w) => w !== "",
  ).length;
  const [aSupprimer, setASupprimer] = useState<{ id: string; nom: string } | null>(null);
  // Mehrfachauswahl (nur Bureau Admin+, wie das Einzel-Löschen) : id -> Anzeigename. Die Auswahl
  // bleibt über Seiten hinweg erhalten, wird aber bei jeder Änderung von Filter oder Sortierung
  // geleert, damit nichts Unsichtbares gelöscht wird.
  const [auswahl, setAuswahl] = useState<Map<string, string>>(new Map());
  const [sammelDialogOffen, setSammelDialogOffen] = useState(false);
  const [sammelErgebnis, setSammelErgebnis] = useState<SammelLoeschErgebnis | null>(null);
  const [sammelFehler, setSammelFehler] = useState<string | null>(null);
  // Tri du tableau ET de l'export Excel (même sélecteur) — le backend (MembreOrderingFilter)
  // applique `ordering` à la pagination par curseur avec un départage (nom, prénom, id) stable ;
  // le fichier exporté n'est pas paginé (voir apps.membres.exports).
  const [ordering, setOrdering] = useState<MembresOrdering>("nom");
  const [exportEnCours, setExportEnCours] = useState(false);
  const [erreurExport, setErreurExport] = useState<string | null>(null);
  const [exportDialogOuvert, setExportDialogOuvert] = useState(false);
  // Toutes les colonnes cochées par défaut à l'ouverture de la boîte de dialogue — l'utilisateur
  // décoche celles qu'il ne veut pas plutôt que de partir d'une sélection vide.
  const [champsExport, setChampsExport] = useState<ChampExport[]>(TOUS_LES_CHAMPS_EXPORT);

  const filters = {
    statut,
    ville,
    q,
    land,
    pays,
    date_adhesion_apres: dateAdhesionApres,
    date_adhesion_avant: dateAdhesionAvant,
  };
  const { data, isLoading, isError } = useMembresList({ ...filters, ordering }, pageUrl);
  const deleteMutation = useDeleteMembre();
  const sammelMutation = useSupprimerMembresLot();

  async function exporter() {
    // La boîte de dialogue ne sert qu'à choisir les colonnes — une fois confirmée, elle se
    // ferme immédiatement ; le téléchargement lui-même (succès ou erreur) suit le même
    // affichage qu'avant (bouton "en cours", erreur sous le formulaire de filtres).
    setExportDialogOuvert(false);
    setErreurExport(null);
    setExportEnCours(true);
    try {
      const { blob, nomFichier } = await exporterMembres({
        ...filters,
        ordering,
        champs: champsExport,
      });
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nomFichier;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErreurExport(extractApiErrorMessage(error, t("liste.export_erreur")));
    } finally {
      setExportEnCours(false);
    }
  }

  function toggleChampExport(champ: ChampExport) {
    setChampsExport((prev) =>
      prev.includes(champ) ? prev.filter((c) => c !== champ) : [...prev, champ],
    );
  }

  function appliquerFiltres(e: React.FormEvent) {
    e.preventDefault();
    setPageUrl(null); // toute modification de filtre repart de la première page
    setAuswahl(new Map());
    setFilterOffen(false);
  }

  function reinitialiserFiltres() {
    setStatut("");
    setVille("");
    setQ("");
    setLand("");
    setPays("");
    setDateAdhesionApres("");
    setDateAdhesionAvant("");
    setPageUrl(null);
    setAuswahl(new Map());
  }

  const seitenMitglieder = data?.results ?? [];
  const alleAufSeite =
    seitenMitglieder.length > 0 && seitenMitglieder.every((m) => auswahl.has(m.id));
  const teilweiseAufSeite = !alleAufSeite && seitenMitglieder.some((m) => auswahl.has(m.id));

  function auswahlUmschalten(id: string, nom: string) {
    setAuswahl((prev) => {
      const neu = new Map(prev);
      if (neu.has(id)) neu.delete(id);
      else neu.set(id, nom);
      return neu;
    });
  }

  function seiteUmschalten() {
    setAuswahl((prev) => {
      const neu = new Map(prev);
      if (alleAufSeite) seitenMitglieder.forEach((m) => neu.delete(m.id));
      else seitenMitglieder.forEach((m) => neu.set(m.id, `${m.prenom} ${m.nom}`));
      return neu;
    });
  }

  function sammelLoeschenStarten() {
    setSammelErgebnis(null);
    if (auswahl.size > MAX_SAMMELLOESCHUNG) {
      setSammelFehler(t("liste.sammel_max", { max: MAX_SAMMELLOESCHUNG }));
      return;
    }
    setSammelFehler(null);
    setSammelDialogOffen(true);
  }

  function sammelLoeschenBestaetigen() {
    sammelMutation.mutate([...auswahl.keys()], {
      onSuccess: (ergebnis) => {
        setSammelDialogOffen(false);
        setSammelErgebnis(ergebnis);
        setAuswahl(new Map());
      },
      onError: (error) => {
        setSammelDialogOffen(false);
        setSammelFehler(extractApiErrorMessage(error, t("liste.sammel_erreur")));
      },
    });
  }

  function confirmerSuppression() {
    if (!aSupprimer) return;
    deleteMutation.mutate(aSupprimer.id, { onSuccess: () => setASupprimer(null) });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-text-primary">{t("liste.titre")}</h1>
        {(peutGerer || importZugriff || zuordnungZugriff) && (
          <div className="flex flex-wrap gap-2">
            {importZugriff && (
              <Link
                to="/membres/import"
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("liste.importer")}
              </Link>
            )}
            {zuordnungZugriff && (
              <Link
                to="/membres/zuordnung"
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("liste.zuordnung")}
              </Link>
            )}
            {peutGerer && (
              <Link
                to="/membres/nouveau"
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
              >
                + {t("liste.ajouter")}
              </Link>
            )}
          </div>
        )}
      </div>

      <FilterUmschalter
        offen={filterOffen}
        onUmschalten={() => setFilterOffen((v) => !v)}
        aktiv={aktiveFilter}
        controls="membres-filter"
      />
      <form
        id="membres-filter"
        onSubmit={appliquerFiltres}
        className={`mb-4 ${filterBlockKlasse(filterOffen)} flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm max-md:[&_input]:w-full max-md:[&_select]:w-full max-md:[&>div]:w-full`}
      >
        <div>
          <label
            htmlFor="membres-filtre-statut"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_statut")}
          </label>
          <select
            id="membres-filtre-statut"
            value={statut}
            onChange={(e) => setStatut(e.target.value as StatutMembre | "")}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("liste.tous_statuts")}</option>
            <option value="actif">{t("statut.actif")}</option>
            <option value="en_attente">{t("statut.en_attente")}</option>
            <option value="inactif">{t("statut.inactif")}</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="membres-filtre-ville"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_ville")}
          </label>
          <input
            id="membres-filtre-ville"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            placeholder={t("liste.filtre_ville_placeholder") ?? ""}
          />
        </div>
        <div>
          <label
            htmlFor="membres-filtre-land"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_land")}
          </label>
          <select
            id="membres-filtre-land"
            value={land}
            onChange={(e) => setLand(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("liste.tous_lander")}</option>
            {BUNDESLANDER.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="membres-filtre-pays"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_pays")}
          </label>
          <select
            id="membres-filtre-pays"
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("liste.tous_pays")}</option>
            {PAYS_MEMBRE.map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="membres-filtre-adhesion-apres"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_adhesion_apres")}
          </label>
          <input
            id="membres-filtre-adhesion-apres"
            type="date"
            value={dateAdhesionApres}
            onChange={(e) => setDateAdhesionApres(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="membres-filtre-adhesion-avant"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_adhesion_avant")}
          </label>
          <input
            id="membres-filtre-adhesion-avant"
            type="date"
            value={dateAdhesionAvant}
            onChange={(e) => setDateAdhesionAvant(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label
            htmlFor="membres-recherche"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.recherche")}
          </label>
          <input
            id="membres-recherche"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            placeholder={t("liste.recherche_placeholder") ?? ""}
          />
        </div>
        <button
          type="submit"
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
        >
          {t("liste.filtrer")}
        </button>
        <button
          type="button"
          onClick={reinitialiserFiltres}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
        >
          {t("liste.reinitialiser")}
        </button>

        {peutGerer && (
          <>
            {/* Tri : s'applique au tableau et à l'export Excel (voir commentaire sur `ordering`). */}
            <div className="ml-auto">
              <label
                htmlFor="membres-tri"
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("liste.trier_par")}
              </label>
              <select
                id="membres-tri"
                value={ordering}
                onChange={(e) => {
                  setOrdering(e.target.value as MembresOrdering);
                  setPageUrl(null); // un autre tri repart de la première page
                  setAuswahl(new Map());
                }}
                className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              >
                <option value="nom">{t("liste.tri_nom_asc")}</option>
                <option value="-nom">{t("liste.tri_nom_desc")}</option>
                <option value="-date_adhesion">{t("liste.tri_date_adhesion_desc")}</option>
                <option value="date_adhesion">{t("liste.tri_date_adhesion_asc")}</option>
                <option value="statut">{t("liste.tri_statut")}</option>
                <option value="ville_de">{t("liste.tri_ville")}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setExportDialogOuvert(true)}
              disabled={exportEnCours}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
            >
              {exportEnCours ? t("liste.export_en_cours") : t("liste.exporter")}
            </button>
          </>
        )}
      </form>

      {erreurExport && <p className="mb-4 -mt-2 text-sm text-status-dangerText">{erreurExport}</p>}

      {sammelFehler && (
        <p role="alert" className="mb-3 text-sm text-status-dangerText">
          {sammelFehler}
        </p>
      )}
      {sammelErgebnis && (
        <div
          role="status"
          className="mb-3 rounded-cid-lg border border-text-tertiary/20 bg-bg-primary p-3 text-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-text-primary">
              {t("liste.sammel_erfolg", { count: sammelErgebnis.geloescht })}
            </p>
            <button
              type="button"
              onClick={() => setSammelErgebnis(null)}
              className="rounded-cid px-2 text-text-tertiary hover:bg-bg-tertiary"
              aria-label={t("liste.meldung_schliessen")}
            >
              ×
            </button>
          </div>
          {sammelErgebnis.uebersprungen.length > 0 && (
            <div className="mt-2">
              <p className="text-text-secondary">
                {t("liste.sammel_uebersprungen", { count: sammelErgebnis.uebersprungen.length })}
              </p>
              <ul className="mt-1 list-disc pl-5 text-text-secondary">
                {sammelErgebnis.uebersprungen.map((z) => (
                  <li key={z.id}>
                    {z.name ? <span className="font-medium">{z.name}</span> : null}
                    {z.name ? " — " : ""}
                    {t(`liste.sammel_grund_${z.grund}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {peutSupprimer && seitenMitglieder.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-text-secondary">
            <input
              type="checkbox"
              checked={alleAufSeite}
              ref={(el) => {
                if (el) el.indeterminate = teilweiseAufSeite;
              }}
              onChange={seiteUmschalten}
            />
            {t("liste.auswahl_alle_seite")}
          </label>
          {auswahl.size > 0 && (
            <>
              <span className="font-medium text-text-primary">
                {t("liste.auswahl_anzahl", { count: auswahl.size })}
              </span>
              <button
                type="button"
                onClick={() => setAuswahl(new Map())}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
              >
                {t("liste.auswahl_aufheben")}
              </button>
              <button
                type="button"
                onClick={sammelLoeschenStarten}
                className="rounded-cid bg-status-dangerText px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                {t("liste.auswahl_loeschen")}
              </button>
            </>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="cid-karten w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("liste.col_membre")}</th>
              <th className="px-4 py-2">{t("liste.col_ville")}</th>
              <th className="px-4 py-2">{t("liste.col_cin")}</th>
              <th className="px-4 py-2">{t("liste.col_email")}</th>
              <th className="px-4 py-2">{t("liste.col_statut")}</th>
              <th className="px-4 py-2">{t("liste.col_offre")}</th>
              <th className="px-4 py-2">{t("liste.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.chargement")}
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-status-dangerText">
                  {t("liste.erreur")}
                </td>
              </tr>
            )}
            {!isLoading && !isError && data?.results.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.aucun_resultat")}
                </td>
              </tr>
            )}
            {data?.results.map((membre) => (
              <tr key={membre.id} className="border-b border-text-tertiary/10 last:border-0">
                <td className="px-4 py-2" data-kopf>
                  <div className="flex items-center gap-2">
                    {peutSupprimer && (
                      <input
                        type="checkbox"
                        checked={auswahl.has(membre.id)}
                        onChange={() =>
                          auswahlUmschalten(membre.id, `${membre.prenom} ${membre.nom}`)
                        }
                        aria-label={t("liste.auswahl_zeile", {
                          nom: `${membre.prenom} ${membre.nom}`,
                        })}
                      />
                    )}
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cal text-[10px] font-semibold text-ca">
                      {initiales(membre.prenom, membre.nom)}
                    </div>
                    <div>
                      <div className="font-medium text-text-primary">
                        {membre.prenom} {membre.nom}
                      </div>
                      <div className="text-xs text-text-tertiary">{membre.numero_membre}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2" data-label={t("liste.col_ville")}>
                  {membre.pays === PAYS_ALLEMAGNE ? membre.ville_de : t(`pays.${membre.pays}`)}
                </td>
                <td className="px-4 py-2" data-label={t("liste.col_cin")}>
                  {membre.cin_masque}
                </td>
                <td className="px-4 py-2" data-label={t("liste.col_email")}>
                  {membre.email}
                </td>
                <td className="px-4 py-2" data-label={t("liste.col_statut")}>
                  <StatutBadge statut={membre.statut} />
                </td>
                <td className="px-4 py-2 text-text-secondary" data-label={t("liste.col_offre")}>
                  {membre.offre_actuelle
                    ? `${membre.offre_actuelle.nom} (${membre.offre_actuelle.annee})`
                    : "—"}
                </td>
                <td className="px-4 py-2" data-aktionen>
                  <div className="flex gap-1">
                    <Link
                      to={`/membres/${membre.id}`}
                      className="rounded-cid px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                      aria-label={t("liste.voir")}
                    >
                      {t("liste.voir")}
                    </Link>
                    {/* RH+ modifie n'importe quelle fiche ; pour un rôle
                        inférieur, la seule fiche que cette liste peut
                        contenir est de toute façon la sienne (le backend
                        scope déjà le queryset — voir get_queryset), donc ce
                        lien pointe toujours vers sa propre fiche (AHM-51). */}
                    <Link
                      to={`/membres/${membre.id}/modifier`}
                      className="rounded-cid px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                    >
                      {t("liste.modifier")}
                    </Link>
                    {peutSupprimer && (
                      <button
                        type="button"
                        onClick={() =>
                          setASupprimer({ id: membre.id, nom: `${membre.prenom} ${membre.nom}` })
                        }
                        className="rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                      >
                        {t("liste.supprimer")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={!data?.previous}
          onClick={() => setPageUrl(data?.previous ?? null)}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
        >
          {t("liste.precedent")}
        </button>
        <button
          type="button"
          disabled={!data?.next}
          onClick={() => setPageUrl(data?.next ?? null)}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
        >
          {t("liste.suivant")}
        </button>
      </div>

      <ConfirmDialog
        open={aSupprimer !== null}
        title={t("liste.confirmer_suppression_titre")}
        message={t("liste.confirmer_suppression_message", { nom: aSupprimer?.nom })}
        danger
        onConfirm={confirmerSuppression}
        onCancel={() => setASupprimer(null)}
      />

      <ConfirmDialog
        open={sammelDialogOffen}
        title={t("liste.sammel_titel", { count: auswahl.size })}
        message={t("liste.sammel_message")}
        danger
        onConfirm={sammelLoeschenBestaetigen}
        onCancel={() => setSammelDialogOffen(false)}
      />

      <ExportChampsDialog
        open={exportDialogOuvert}
        selection={champsExport}
        onToggle={toggleChampExport}
        onToutSelectionner={() => setChampsExport(TOUS_LES_CHAMPS_EXPORT)}
        onToutDeselectionner={() => setChampsExport([])}
        onConfirm={exporter}
        onCancel={() => setExportDialogOuvert(false)}
      />
    </div>
  );
}
