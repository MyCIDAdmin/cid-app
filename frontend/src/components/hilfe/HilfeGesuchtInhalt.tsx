/**
 * Inhalt von „Hilfe gesucht“ (Nov. 2026): offene Stellen von Projekten und freie Gesuche ohne
 * Projektbezug in einer Liste, mit Filter nach Art, Herkunft und Kategorie. Drei Ansichten:
 * „Gesuche“, „Angebote“ (Mitglieder bieten von sich aus Hilfe an, das Büro entscheidet) und
 * „Kategorien“ (Pflege durch das Büro). Wer das Recht „Hilfegesuche veröffentlichen“ hat, legt
 * neue Gesuche an. Eingebettet als Tab der Projektseite ; ohne Anmeldung (/hilfe-oeffentlich)
 * gibt es nur die öffentlichen Gesuche.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import AngeboteListe from "./AngeboteListe";
import GesuchForm from "./GesuchForm";
import HilfeGesuchtKarte from "./HilfeGesuchtKarte";
import KategorienVerwaltung from "./KategorienVerwaltung";
import { useFreieStellen, useHilfeKategorien, useOffeneStellen } from "../../hooks/useProjets";
import { usePageAccess } from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import type { ProjetStelle } from "../../types/projets";
import { kategorieName } from "../../utils/hilfe";

type ArtFilter = "alle" | "einmalig" | "dauerhaft";
type HerkunftFilter = "alle" | "frei" | "projekt";
type Ansicht = "gesuche" | "angebote" | "kategorien";

const CHIP = "rounded-full border px-3 py-1 text-xs font-medium";
const AKTIV = "border-ca bg-ca text-white";
const INAKTIV = "border-text-tertiary/30 text-text-secondary hover:bg-bg-secondary";

function sortiert(liste: ProjetStelle[]): ProjetStelle[] {
  // Offene vor geschlossenen ; innerhalb dessen nach Termin/Frist, dauerhafte zuletzt.
  const schluessel = (s: ProjetStelle) => s.termin ?? s.frist ?? "9999-12-31";
  return [...liste].sort((a, b) => {
    if ((a.status === "offen") !== (b.status === "offen")) return a.status === "offen" ? -1 : 1;
    return schluessel(a).localeCompare(schluessel(b));
  });
}

export default function HilfeGesuchtInhalt({ oeffentlich = false }: { oeffentlich?: boolean }) {
  const { t, i18n } = useTranslation("projets");
  const angemeldet = useAuthStore((s) => s.isAuthenticated);
  const veroeffentlichen = usePageAccess("page_hilfe_veroeffentlichen");
  const genehmigen = usePageAccess("page_hilfe_genehmigen");
  const offene = useOffeneStellen();
  const freie = useFreieStellen();
  const kategorien = useHilfeKategorien();
  const [params, setParams] = useSearchParams();
  const [art, setArt] = useState<ArtFilter>("alle");
  const [herkunft, setHerkunft] = useState<HerkunftFilter>("alle");
  const [kategorie, setKategorie] = useState("");
  const [formOffen, setFormOffen] = useState(false);

  const darfAnlegen = angemeldet && (veroeffentlichen.modifiable || genehmigen.modifiable);
  const darfGenehmigen = angemeldet && genehmigen.modifiable;
  const angefragt = params.get("ansicht");
  const ansicht: Ansicht =
    angemeldet && !oeffentlich
      ? angefragt === "angebote"
        ? "angebote"
        : angefragt === "kategorien" && darfGenehmigen
          ? "kategorien"
          : "gesuche"
      : "gesuche";

  function ansichtWaehlen(neu: Ansicht) {
    const naechste = new URLSearchParams(params);
    if (neu === "gesuche") naechste.delete("ansicht");
    else naechste.set("ansicht", neu);
    setParams(naechste, { replace: true });
  }

  // „offene“ liefert alle offenen Stellen (auch freie) ; „freie“ ergänzt die eigenen geschlossenen
  // Gesuche und die der Verwaltung. Zusammenführen ohne Doppelte.
  const alle = useMemo(() => {
    const nachId = new Map<string, ProjetStelle>();
    for (const s of offene.data ?? []) nachId.set(s.id, s);
    for (const s of freie.data ?? []) nachId.set(s.id, s);
    return sortiert([...nachId.values()]);
  }, [offene.data, freie.data]);

  const sichtbar = alle.filter(
    (s) =>
      (art === "alle" || s.art === art) &&
      (herkunft === "alle" || (herkunft === "frei" ? s.frei : !s.frei)) &&
      (kategorie === "" || s.kategorie === kategorie),
  );
  const laedt = offene.isLoading || freie.isLoading;
  const ansichten: Ansicht[] =
    angemeldet && !oeffentlich
      ? darfGenehmigen
        ? ["gesuche", "angebote", "kategorien"]
        : ["gesuche", "angebote"]
      : ["gesuche"];

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="hilfe-gesucht-seite">
      {ansichten.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("hilfe.ansicht.label")}>
          {ansichten.map((wert) => (
            <button
              key={wert}
              type="button"
              aria-pressed={ansicht === wert}
              onClick={() => ansichtWaehlen(wert)}
              className={`${CHIP} ${ansicht === wert ? AKTIV : INAKTIV}`}
            >
              {wert === "angebote" && !darfGenehmigen
                ? t("hilfe.ansicht.meine_angebote")
                : t(`hilfe.ansicht.${wert}`)}
            </button>
          ))}
        </div>
      )}

      {ansicht === "angebote" && <AngeboteListe darfEntscheiden={darfGenehmigen} />}
      {ansicht === "kategorien" && <KategorienVerwaltung />}

      {ansicht === "gesuche" && (
        <>
          {darfAnlegen &&
            (formOffen ? (
              <GesuchForm onFertig={() => setFormOffen(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setFormOffen(true)}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
              >
                + {t("hilfe.neu")}
              </button>
            ))}

          <div className="flex flex-wrap gap-2" role="group" aria-label={t("hilfe.filter.art")}>
            {(["alle", "einmalig", "dauerhaft"] as const).map((wert) => (
              <button
                key={wert}
                type="button"
                aria-pressed={art === wert}
                onClick={() => setArt(wert)}
                className={`${CHIP} ${art === wert ? AKTIV : INAKTIV}`}
              >
                {wert === "alle" ? t("hilfe.filter.alle") : t(`hilfe.art.${wert}`)}
              </button>
            ))}
            <span className="mx-1 hidden w-px bg-text-tertiary/20 sm:block" aria-hidden />
            {(["alle", "frei", "projekt"] as const).map((wert) => (
              <button
                key={`h-${wert}`}
                type="button"
                aria-pressed={herkunft === wert}
                onClick={() => setHerkunft(wert)}
                className={`${CHIP} ${herkunft === wert ? AKTIV : INAKTIV}`}
              >
                {t(`hilfe.filter.herkunft_${wert}`)}
              </button>
            ))}
            {(kategorien.data ?? []).length > 0 && (
              <select
                value={kategorie}
                onChange={(e) => setKategorie(e.target.value)}
                aria-label={t("hilfe.filter.kategorie")}
                className="rounded-full border border-text-tertiary/30 bg-bg-primary px-3 py-1 text-xs font-medium text-text-secondary"
              >
                <option value="">{t("hilfe.filter.alle_kategorien")}</option>
                {(kategorien.data ?? []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {kategorieName(k, i18n.language)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {laedt ? (
            <p className="text-sm text-text-tertiary">{t("hilfe.laedt")}</p>
          ) : sichtbar.length === 0 ? (
            <p className="rounded-cid bg-bg-secondary p-4 text-sm text-text-secondary">
              {t("hilfe.leer")}
            </p>
          ) : (
            <ul className="space-y-2">
              {sichtbar.map((s) => (
                <HilfeGesuchtKarte key={s.id} stelle={s} darfGenehmigen={darfGenehmigen} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
