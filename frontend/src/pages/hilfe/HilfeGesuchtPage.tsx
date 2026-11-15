/**
 * Seite „Hilfe gesucht“ (Nov. 2026): offene Stellen von Projekten und freie Gesuche ohne
 * Projektbezug in einer Liste, mit Filter nach Art (einmalig/dauerhaft) und Herkunft. Wer das Recht
 * „Hilfegesuche veröffentlichen“ hat, kann neue Gesuche anlegen. Die Seite gibt es auch ohne
 * Anmeldung (/hilfe-oeffentlich) : dort sieht man nur die als öffentlich markierten Gesuche.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import GesuchForm from "../../components/hilfe/GesuchForm";
import HilfeGesuchtKarte from "../../components/hilfe/HilfeGesuchtKarte";
import { useOffeneStellen, useFreieStellen } from "../../hooks/useProjets";
import { usePageAccess } from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import type { ProjetStelle } from "../../types/projets";

type ArtFilter = "alle" | "einmalig" | "dauerhaft";
type HerkunftFilter = "alle" | "frei" | "projekt";

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

export default function HilfeGesuchtPage({ oeffentlich = false }: { oeffentlich?: boolean }) {
  const { t } = useTranslation("projets");
  const angemeldet = useAuthStore((s) => s.isAuthenticated);
  const veroeffentlichen = usePageAccess("page_hilfe_veroeffentlichen");
  const genehmigen = usePageAccess("page_hilfe_genehmigen");
  const offene = useOffeneStellen();
  const freie = useFreieStellen();
  const [art, setArt] = useState<ArtFilter>("alle");
  const [herkunft, setHerkunft] = useState<HerkunftFilter>("alle");
  const [formOffen, setFormOffen] = useState(false);

  const darfAnlegen = angemeldet && (veroeffentlichen.modifiable || genehmigen.modifiable);
  const darfGenehmigen = angemeldet && genehmigen.modifiable;

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
      (herkunft === "alle" || (herkunft === "frei" ? s.frei : !s.frei)),
  );
  const laedt = offene.isLoading || freie.isLoading;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" data-testid="hilfe-gesucht-seite">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-text-primary">{t("hilfe.seite_titel")}</h1>
        <p className="text-sm text-text-secondary">{t("hilfe.seite_einleitung")}</p>
        {oeffentlich && !angemeldet && (
          <p className="text-sm text-text-secondary">
            <Link to="/login" className="font-medium text-ca underline">
              {t("hilfe.oeffentlich_login")}
            </Link>
          </p>
        )}
      </header>

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
    </div>
  );
}
