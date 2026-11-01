/**
 * Angebotsauswahl der Mitgliedschaftskampagne (Release 2026.11, Vorschlag A „Kacheln mit fester
 * Beitrittsleiste“, Konzept_Angebote_Beitritt.md).
 *
 * Aufbau : „Für wen?“ (hebt das passende Angebot hervor und wählt es vor) → Rabatt-Chips →
 * Kacheln mit Kartenvorschau, Preis, Rabatten und den wichtigsten Vorteilen → „Deine Auswahl“
 * (Familie, Rabatt, Fehler) → feste Beitrittsleiste mit Live-Preis → Vergleichstabelle.
 *
 * Die Komponente hält nur Anzeige-Zustand (Gruppe, Rabatt-Typ). Auswahl, Rabatt, Familie und das
 * Absenden gehören der Seite, damit der bisherige Ablauf (Anmeldung, Profil ergänzen, Familie
 * erfassen) unverändert bleibt. Alle Preise sind nur eine Vorschau ; der Server rechnet beim
 * Beitritt neu (CLAUDE.md §8).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  CampagneAdhesion,
  OffreAdhesion,
  RabaisOffre,
  TypeRabais,
} from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokaleSprache } from "../../utils/datum";
import { uebersetzt } from "../../utils/uebersetzung";
import {
  besterRabatt,
  eingerechneteRabatte,
  empfohlenesAngebot,
  gruppenMitAngebot,
  monateBis,
  monatspreis,
  passtZu,
  preisNachRabatt,
  rabaisBezeichnung,
  rabaisVomTyp,
  rabattTypen,
  rabattWert,
  vergleichsZeilen,
  wahlRabatte,
  type ZielGruppe,
} from "./angebotsLogik";
import CompleterProfilIdentite, { estErreurProfilIncomplet } from "./CompleterProfilIdentite";
import FamilienErfassung from "./FamilienErfassung";
import {
  berechnePaket,
  familieVollstaendig,
  formatEuro,
  type FamilienEingabe,
} from "./familienpreis";
import MitgliedsKarte from "./MitgliedsKarte";
import VorteilSymbol from "./VorteilSymbol";

// Gleiche feste Palette wie bisher auf der Seite (index.css, validierte Kategorienfarben).
const ACCENTS_OFFRE = ["border-t-cat-1", "border-t-cat-2", "border-t-cat-3"] as const;
const COULEUR_OFFRE_INDEX: Record<string, number> = { cat_1: 0, cat_2: 1, cat_3: 2 };
const ACCENT_NEUTRE = "border-t-text-tertiary/30";
const PUCEN = ["text-cat-1", "text-cat-2", "text-cat-3"] as const;

function akzentIndex(offre: Pick<OffreAdhesion, "couleur">, index: number): number {
  if (offre.couleur && offre.couleur in COULEUR_OFFRE_INDEX)
    return COULEUR_OFFRE_INDEX[offre.couleur];
  return index < ACCENTS_OFFRE.length ? index : -1;
}

/** So viele Vorteile zeigt eine nicht gewählte Kachel ; der Rest steht unter „+ n weitere“. */
const VORTEILE_AUF_KACHEL = 3;
/** Altersspannen, die praktisch „alle“ bedeuten, sind kein sinnvoller Hinweis (z. B. 0 bis 92). */
const ALLE_ALTER_VON = 0;
const ALLE_ALTER_BIS = 90;

export interface AngebotsAuswahlProps {
  campagne: CampagneAdhesion;
  /** Nur sichtbare Angebote, in der Reihenfolge der Kampagne. */
  angebote: OffreAdhesion[];
  /** Ein Angebot trägt das „Beliebt“-Etikett aus der Verwaltung (ersetzt die Positionsregel). */
  populaerExplizit: boolean;
  /** Name auf der Kartenvorschau. */
  name: string;
  auswahlId: string | null;
  rabaisId: string | null;
  familie: FamilienEingabe;
  /** Es gibt schon eine Anmeldung in dieser Kampagne (Knopf heißt dann „Wechseln“). */
  hatAnmeldung: boolean;
  wirdGesendet: boolean;
  fehler: unknown | null;
  onWaehlen: (offreId: string | null, rabaisId?: string | null) => void;
  onRabais: (rabaisId: string | null) => void;
  onFamilie: (f: FamilienEingabe) => void;
  onAbsenden: () => void;
}

function Zaehler({
  label,
  wert,
  max,
  onAendern,
}: {
  label: string;
  wert: number;
  max: number;
  onAendern: (neu: number) => void;
}) {
  const { t } = useTranslation("adhesions");
  const knopf =
    "flex h-8 w-8 items-center justify-center rounded-full border border-text-tertiary/30 text-lg leading-none text-text-primary hover:bg-bg-tertiary disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3 rounded-cid bg-bg-tertiary/40 px-3 py-2">
      <span className="text-sm text-text-primary">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={knopf}
          disabled={wert <= 0}
          aria-label={t("angebote.zaehler_weniger", { label })}
          onClick={() => onAendern(wert - 1)}
        >
          −
        </button>
        <span className="w-5 text-center text-sm font-semibold tabular-nums" aria-live="polite">
          {wert}
        </span>
        <button
          type="button"
          className={knopf}
          disabled={wert >= max}
          aria-label={t("angebote.zaehler_mehr", { label })}
          onClick={() => onAendern(wert + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function AngebotsAuswahl({
  campagne,
  angebote,
  populaerExplizit,
  name,
  auswahlId,
  rabaisId,
  familie,
  hatAnmeldung,
  wirdGesendet,
  fehler,
  onWaehlen,
  onRabais,
  onFamilie,
  onAbsenden,
}: AngebotsAuswahlProps) {
  const { t, i18n } = useTranslation("adhesions");
  const [gruppe, setGruppe] = useState<ZielGruppe | null>(null);
  const [typ, setTyp] = useState<TypeRabais | null>(null);

  const auswahl = angebote.find((o) => o.id === auswahlId) ?? null;
  const gruppen = gruppenMitAngebot(angebote);
  const typen = rabattTypen(angebote);
  const monate = monateBis(campagne.date_fin);
  const gueltigBis = new Date(`${campagne.date_fin}T00:00:00`).toLocaleDateString(lokaleSprache());
  const zeilen = vergleichsZeilen(angebote);
  const vorschauName = name || t("angebote.vorschau_name");

  function waehlen(offre: OffreAdhesion) {
    onWaehlen(offre.id, rabaisVomTyp(offre, typ)?.id ?? null);
  }

  function gruppeWaehlen(g: ZielGruppe) {
    if (gruppe === g) {
      setGruppe(null);
      return;
    }
    setGruppe(g);
    if (auswahl && passtZu(auswahl, g)) return;
    const empfohlen = empfohlenesAngebot(angebote, g);
    if (empfohlen) waehlen(empfohlen);
  }

  function typWaehlen(neu: TypeRabais) {
    const naechster = typ === neu ? null : neu;
    setTyp(naechster);
    if (auswahl) onRabais(rabaisVomTyp(auswahl, naechster)?.id ?? null);
  }

  function rabaisAendern(id: string | null) {
    onRabais(id);
    const r = auswahl?.rabais.find((x) => x.id === id);
    setTyp(r && typen.includes(r.type_rabais) ? r.type_rabais : null);
  }

  function personenAendern(art: "erwachsene" | "kinder", anzahl: number) {
    if (art === "erwachsene") {
      const neu = familie.erwachsene.slice(0, anzahl);
      while (neu.length < anzahl) neu.push({ vorname: "", nachname: "", email: "", beziehung: "" });
      onFamilie({ ...familie, erwachsene: neu });
    } else {
      const neu = familie.kinder.slice(0, anzahl);
      while (neu.length < anzahl) {
        neu.push({ vorname: "", nachname: "", geburtsjahr: "", beziehung: "kind" });
      }
      onFamilie({ ...familie, kinder: neu });
    }
  }

  /** Rabatt, der auf dieser Kachel für die Vorschau gilt : bei der gewählten Kachel die Wahl,
   * sonst der Typ aus den Chips. Familienpakete rechnen der Server und die Paketberechnung. */
  function kachelRabatt(offre: OffreAdhesion): RabaisOffre | null {
    if (offre.ist_familienpaket) return null;
    if (offre.id === auswahlId) return offre.rabais.find((r) => r.id === rabaisId) ?? null;
    return rabaisVomTyp(offre, typ);
  }

  const auswahlRabatt = auswahl ? kachelRabatt(auswahl) : null;
  const paket = auswahl?.ist_familienpaket
    ? berechnePaket(auswahl, campagne.offres, familie.erwachsene.length, familie.kinder.length)
    : null;
  const auswahlListe = auswahl
    ? auswahl.ist_familienpaket
      ? (paket?.gesamt ?? Number(auswahl.prix_plein))
      : Number(auswahl.prix_plein)
    : 0;
  const auswahlPreis = auswahlRabatt ? preisNachRabatt(auswahlListe, auswahlRabatt) : auswahlListe;
  const kannAbsenden =
    !wirdGesendet && (!auswahl?.ist_familienpaket || familieVollstaendig(familie));

  return (
    <div>
      {/* Für wen? */}
      {gruppen.length > 1 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-text-secondary" id="angebote-fuer-wen">
            {t("angebote.fuer_wen")}
          </div>
          <div
            role="radiogroup"
            aria-labelledby="angebote-fuer-wen"
            className="inline-flex max-w-full flex-wrap gap-1 rounded-full bg-bg-tertiary p-1"
          >
            {gruppen.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={gruppe === g}
                onClick={() => gruppeWaehlen(g)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
                  gruppe === g
                    ? "bg-ca text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t(`angebote.gruppe.${g}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rabatt-Chips */}
      {typen.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-text-secondary">
            {t("angebote.rabatt_frage")}
          </div>
          <div className="flex flex-wrap gap-2">
            {typen.map((tp) => (
              <button
                key={tp}
                type="button"
                aria-pressed={typ === tp}
                onClick={() => typWaehlen(tp)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                  typ === tp
                    ? "border-status-successText bg-status-successBg text-status-successText"
                    : "border-text-tertiary/30 text-text-secondary hover:bg-bg-tertiary"
                }`}
              >
                {typ === tp && <span aria-hidden="true">✓ </span>}
                {t(`angebote.rabatt_typ.${tp}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dauer als Argument */}
      <p className="mt-3 text-sm text-text-secondary">
        {t("angebote.gueltig_bis", { datum: gueltigBis })}
        {monate > 0 && <> {t("angebote.dauer", { count: monate })}</>}
      </p>

      {/* Kacheln */}
      <div
        role="radiogroup"
        aria-label={t("angebote.liste_aria")}
        className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 pt-3 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] sm:overflow-visible sm:px-0"
      >
        {angebote.map((offre, index) => {
          const sel = offre.id === auswahlId;
          const akzent = akzentIndex(offre, index);
          const passt = gruppe != null && passtZu(offre, gruppe);
          const gedimmt = gruppe != null && !passt && !sel;
          const populaer = populaerExplizit
            ? offre.populaire
            : angebote.length >= 3 && index === Math.floor(angebote.length / 2);
          const vorteile = offre.avantages.slice().sort((a, b) => a.ordre - b.ordre);
          const sichtbar = sel ? vorteile : vorteile.slice(0, VORTEILE_AUF_KACHEL);
          const rest = vorteile.length - sichtbar.length;
          const rabatt = kachelRabatt(offre);
          const liste = offre.ist_familienpaket
            ? (berechnePaket(offre, campagne.offres, 0, 0)?.gesamt ?? Number(offre.prix_plein))
            : Number(offre.prix_plein);
          const preis = rabatt ? preisNachRabatt(liste, rabatt) : liste;
          const band = besterRabatt(offre);
          const chips = wahlRabatte(offre);
          const eingerechnet = eingerechneteRabatte(offre);
          const zeigeAlter =
            (offre.condition_age_min != null || offre.condition_age_max != null) &&
            !(
              (offre.condition_age_min ?? ALLE_ALTER_VON) <= ALLE_ALTER_VON &&
              (offre.condition_age_max ?? ALLE_ALTER_BIS) >= ALLE_ALTER_BIS
            );
          const alterText =
            offre.condition_age_min != null && offre.condition_age_max != null
              ? t("offres.condition_age_min_max", {
                  min: offre.condition_age_min,
                  max: offre.condition_age_max,
                })
              : offre.condition_age_min != null
                ? t("offres.condition_age_min", { min: offre.condition_age_min })
                : t("offres.condition_age_max", { max: offre.condition_age_max });
          const puce = akzent >= 0 ? PUCEN[akzent] : "text-ca";

          return (
            <label
              key={offre.id}
              data-angebot={offre.id}
              className={`relative flex w-[78%] min-w-[15rem] shrink-0 cursor-pointer snap-start flex-col rounded-cid-lg border-t-4 bg-bg-primary p-4 shadow-sm transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ca sm:w-auto sm:min-w-0 ${
                akzent >= 0 ? ACCENTS_OFFRE[akzent] : ACCENT_NEUTRE
              } ${sel ? "ring-2 ring-ca" : "hover:shadow-md"} ${
                gedimmt ? "opacity-60 hover:opacity-100" : ""
              } ${passt ? "order-first sm:order-none" : ""}`}
            >
              <input
                type="radio"
                name="angebot"
                className="sr-only"
                checked={sel}
                onChange={() => waehlen(offre)}
              />
              {populaer && (
                <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ca px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                  {t("offres.badge_populaire")}
                </span>
              )}

              {/* Kartenvorschau mit Rabattband */}
              <div className="relative">
                {band && (
                  <span className="absolute -top-2 right-3 z-10 rounded-full bg-status-successText px-2.5 py-0.5 text-[11px] font-bold text-bg-primary shadow">
                    {t("angebote.bis_rabatt", { wert: rabattWert(band) })}
                  </span>
                )}
                <MitgliedsKarte
                  stil={offre.kartenstil}
                  angebot={uebersetzt(offre, "nom")}
                  name={vorschauName}
                  gueltigBis={gueltigBis}
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                {offre.icone && (
                  <img
                    src={offre.icone}
                    alt=""
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 rounded-cid object-cover"
                  />
                )}
                <h3 className="text-sm font-semibold uppercase tracking-wide text-text-tertiary">
                  {uebersetzt(offre, "nom")}
                </h3>
                {passt && (
                  <span className="rounded-full bg-ca/10 px-2 py-0.5 text-[11px] font-semibold text-ca">
                    {t("angebote.passt_zu_dir")}
                  </span>
                )}
              </div>

              {/* Preis */}
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                {offre.ist_familienpaket && (
                  <span className="text-sm font-medium text-text-tertiary">{t("familie.ab")}</span>
                )}
                <span
                  className={`font-display text-3xl font-bold ${
                    rabatt ? "text-status-successText" : "text-text-primary"
                  }`}
                >
                  {formatEuro(preis)}
                </span>
                {rabatt && (
                  <span className="text-sm text-text-tertiary line-through">
                    {formatEuro(liste)}
                  </span>
                )}
              </div>
              <div className="text-xs text-text-tertiary">
                {t("angebote.pro_jahr", { monat: formatEuro(monatspreis(preis)) })}
              </div>

              {/* Rabatte sichtbar auf der Kachel */}
              {(chips.length > 0 || eingerechnet.length > 0) && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {chips.map((r) => {
                    const wert = rabattWert(r);
                    return (
                      <li
                        key={r.id}
                        className="rounded-full bg-status-successBg px-2 py-0.5 text-[11px] font-medium text-status-successText"
                      >
                        {rabaisBezeichnung(r, i18n.language)}
                        {wert && ` ${wert}`}
                      </li>
                    );
                  })}
                  {eingerechnet.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-tertiary"
                    >
                      {rabaisBezeichnung(r, i18n.language)} · {t("angebote.eingerechnet")}
                    </li>
                  ))}
                </ul>
              )}
              {offre.ist_familienpaket && (
                <p className="mt-2 text-[11px] text-text-tertiary">
                  {t("familie.kombination", {
                    pct: Number(offre.familie_rabatt_pct),
                    erwachsene: offre.max_erwachsene,
                    kinder: offre.max_kinder,
                  })}
                </p>
              )}

              <div className="flex flex-1 flex-col">
                {offre.description && (
                  <p className="mt-2 text-sm text-text-secondary">
                    {uebersetzt(offre, "description")}
                  </p>
                )}
                {zeigeAlter && <p className="mt-1 text-[11px] text-text-tertiary">{alterText}</p>}
                {sichtbar.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {sichtbar.map((av) => (
                      <li
                        key={av.ordre}
                        className="flex items-start gap-1.5 text-sm text-text-secondary"
                      >
                        <span className={`mt-0.5 shrink-0 ${puce}`}>
                          <VorteilSymbol name={av.icone} className="h-4 w-4" />
                        </span>
                        {av.texte_fr}
                      </li>
                    ))}
                  </ul>
                )}
                {rest > 0 && (
                  <p className="mt-1.5 text-xs font-medium text-text-tertiary">
                    {t("angebote.weitere_vorteile", { count: rest })}
                  </p>
                )}
              </div>

              <span
                className={`mt-4 block rounded-cid border px-3 py-1.5 text-center text-sm font-semibold ${
                  sel ? "border-ca bg-ca text-white" : "border-text-tertiary/30 text-text-secondary"
                }`}
              >
                {sel ? `✓ ${t("angebote.ausgewaehlt")}` : t("angebote.waehlen")}
              </span>
            </label>
          );
        })}
      </div>

      {/* Deine Auswahl */}
      {auswahl && (
        <div className="mt-2 rounded-cid-lg border border-text-tertiary/15 p-4">
          <h3 className="text-sm font-bold text-text-primary">
            {t("angebote.deine_auswahl", { name: uebersetzt(auswahl, "nom") })}
          </h3>

          {auswahl.ist_familienpaket && (
            <div className="mt-3 space-y-2">
              <Zaehler
                label={t("familie.erwachsene_titel")}
                wert={familie.erwachsene.length}
                max={auswahl.max_erwachsene}
                onAendern={(n) => personenAendern("erwachsene", n)}
              />
              <Zaehler
                label={t("familie.kinder_titel_kurz")}
                wert={familie.kinder.length}
                max={auswahl.max_kinder}
                onAendern={(n) => personenAendern("kinder", n)}
              />
              <p className="text-xs text-text-tertiary">
                {t("angebote.familie_naechster_schritt")}
              </p>
              <FamilienErfassung
                offre={auswahl}
                campagne={campagne}
                wert={familie}
                onChange={onFamilie}
              />
            </div>
          )}

          {auswahl.rabais.length > 0 && (
            <div className="mt-3">
              <label
                htmlFor={`rabais-${auswahl.id}`}
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("offres.rabais_label")}
              </label>
              <select
                id={`rabais-${auswahl.id}`}
                value={rabaisId ?? ""}
                onChange={(e) => rabaisAendern(e.target.value || null)}
                className="w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm text-text-primary"
              >
                <option value="">{t("offres.rabais_aucun")}</option>
                {auswahl.rabais.map((r) => (
                  <option key={r.id} value={r.id}>
                    {rabaisBezeichnung(r, i18n.language)}
                  </option>
                ))}
              </select>
              {auswahlRabatt?.justificatif_requis && (
                <p className="mt-1 text-xs text-text-tertiary">{t("angebote.nachweis_hinweis")}</p>
              )}
            </div>
          )}

          {fehler != null &&
            (estErreurProfilIncomplet(fehler) ? (
              <div className="mt-3">
                <CompleterProfilIdentite onComplete={onAbsenden} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-status-dangerText">
                {extractApiErrorMessage(fehler, t("offres.erreur"))}
              </p>
            ))}
        </div>
      )}

      {/* Feste Beitrittsleiste */}
      {auswahl && (
        <div
          className="sticky bottom-0 z-20 -mx-4 mt-3 border-t border-text-tertiary/15 bg-bg-primary/95 px-4 py-3 shadow-[0_-6px_18px_rgba(0,0,0,0.08)] backdrop-blur"

          data-testid="beitrittsleiste"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-primary">
                {uebersetzt(auswahl, "nom")}
              </div>
              {auswahlRabatt && (
                <div className="truncate text-xs text-status-successText">
                  {rabaisBezeichnung(auswahlRabatt, i18n.language)} {rabattWert(auswahlRabatt)}
                </div>
              )}
            </div>
            <div className="text-right">
              {auswahlRabatt && (
                <div className="text-xs text-text-tertiary line-through">
                  {formatEuro(auswahlListe)}
                </div>
              )}
              <div
                className={`font-display text-xl font-bold tabular-nums ${
                  auswahlRabatt ? "text-status-successText" : "text-text-primary"
                }`}
              >
                {formatEuro(auswahlPreis)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onWaehlen(null)}
              className="rounded-cid border border-text-tertiary/20 px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-tertiary"
            >
              {t("offres.annuler_selection")}
            </button>
            <button
              type="button"
              onClick={onAbsenden}
              disabled={!kannAbsenden}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad disabled:opacity-40"
            >
              {auswahl.ist_familienpaket
                ? t("familie.weiter_zur_zahlung")
                : hatAnmeldung
                  ? t("offres.changer")
                  : t("offres.souscrire")}
            </button>
          </div>
        </div>
      )}

      {/* Vergleich */}
      {angebote.length > 1 && zeilen.length > 0 && (
        <details className="group mt-4 rounded-cid-lg border border-text-tertiary/15">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-text-primary marker:hidden [&::-webkit-details-marker]:hidden">
            {t("angebote.vergleichen")}
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="ml-auto h-5 w-5 text-text-tertiary transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-text-tertiary/20 text-left text-xs uppercase text-text-tertiary">
                  <th className="py-2 pr-2 font-medium">{t("offres.avantages_titre")}</th>
                  {angebote.map((o) => (
                    <th key={o.id} className="px-2 py-2 text-center font-semibold">
                      {uebersetzt(o, "nom")}
                      <div className="text-[11px] font-normal normal-case">
                        {formatEuro(o.prix_plein)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr key={z.schluessel} className="border-b border-text-tertiary/10 last:border-0">
                    <td className="py-2 pr-2 text-text-secondary">
                      <span className="flex items-center gap-1.5">
                        <VorteilSymbol name={z.icone} className="h-4 w-4 shrink-0 text-ca" />
                        {z.text}
                      </span>
                    </td>
                    {angebote.map((o) => (
                      <td key={o.id} className="px-2 py-2 text-center">
                        {z.enthalten[o.id] ? (
                          <span
                            className="text-status-successText"
                            role="img"
                            aria-label={t("angebote.enthalten")}
                          >
                            ✓
                          </span>
                        ) : (
                          <span
                            className="text-text-tertiary"
                            aria-label={t("angebote.nicht_enthalten")}
                          >
                            –
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
