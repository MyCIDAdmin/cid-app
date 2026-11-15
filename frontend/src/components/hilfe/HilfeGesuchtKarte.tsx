/**
 * Karte eines Gesuchs auf der Seite „Hilfe gesucht“: Stellen von Projekten und freie Gesuche
 * stehen gemeinsam in der Liste. Mitglieder melden sich mit einer kurzen Nachricht ; bei freien
 * Gesuchen sieht die Ersteller·in (und wer genehmigen darf) zusätzlich die Meldungen, die
 * passenden Mitglieder aus der Fähigkeiten-Datenbank und die Schaltflächen zum Schließen.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  usePassendeMitglieder,
  useStelleAendern,
  useStelleBewerben,
  useStelleLoeschen,
  useStelleZurueckziehen,
} from "../../hooks/useProjets";
import { useAuthStore } from "../../store/authStore";
import type { ProjetStelle } from "../../types/projets";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokaleSprache } from "../../utils/datum";
import { useFaehigkeitLabel } from "../../utils/faehigkeitLabel";
import MeldungenPanel from "./MeldungenPanel";

function datum(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(lokaleSprache(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function Passende({ stelle }: { stelle: ProjetStelle }) {
  const { t } = useTranslation("projets");
  const [offen, setOffen] = useState(false);
  const passende = usePassendeMitglieder(stelle.id, offen);
  if (!stelle.faehigkeit) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="text-xs font-medium text-ca hover:underline"
      >
        💡 {t("stellen.passende")}
      </button>
      {offen && (
        <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
          {(passende.data ?? []).length === 0 && !passende.isLoading && (
            <li>{t("stellen.keine_passenden")}</li>
          )}
          {(passende.data ?? []).map((m) => (
            <li key={m.id}>
              <span className="font-medium text-text-primary">{m.nom_complet}</span>
              {m.kommentar && ` – ${m.kommentar}`}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-0.5 text-[11px] text-text-tertiary">{t("hilfe.passende_hinweis")}</p>
    </div>
  );
}

export default function HilfeGesuchtKarte({
  stelle,
  darfGenehmigen,
}: {
  stelle: ProjetStelle;
  darfGenehmigen: boolean;
}) {
  const { t } = useTranslation("projets");
  const faehigkeitLabel = useFaehigkeitLabel();
  const angemeldet = useAuthStore((s) => s.isAuthenticated);
  const bewerben = useStelleBewerben();
  const zurueckziehen = useStelleZurueckziehen();
  const aendern = useStelleAendern();
  const loeschen = useStelleLoeschen();
  const [formOffen, setFormOffen] = useState(false);
  const [meldungenOffen, setMeldungenOffen] = useState(false);
  const [nachricht, setNachricht] = useState("");
  const [fehler, setFehler] = useState("");
  const meine = stelle.meine_bewerbung;
  const geschlossen = stelle.status !== "offen";
  const pflegen = stelle.frei && stelle.kann_pflegen;
  const zuGenehmigen = pflegen && darfGenehmigen && (stelle.bewerbungen_empfohlen ?? 0) > 0;

  function senden() {
    setFehler("");
    bewerben.mutate(
      { id: stelle.id, nachricht },
      {
        onSuccess: () => {
          setFormOffen(false);
          setNachricht("");
        },
        onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))),
      },
    );
  }

  function statusSetzen(status: "offen" | "geschlossen") {
    setFehler("");
    aendern.mutate(
      { id: stelle.id, payload: { status } },
      { onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))) },
    );
  }

  function entfernen() {
    if (window.confirm(t("stellen.loeschen_bestaetigen", { titel: stelle.titel }))) {
      loeschen.mutate(stelle.id);
    }
  }

  return (
    <li
      className="space-y-2 rounded-cid border border-text-tertiary/20 bg-bg-primary p-3"
      data-testid="hilfe-karte"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{stelle.titel}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-medium">
            <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-text-secondary">
              {stelle.art === "einmalig" && stelle.termin
                ? t("hilfe.art_mit_datum", { datum: datum(stelle.termin) })
                : t(`hilfe.art.${stelle.art}`)}
            </span>
            {stelle.ort && (
              <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-text-secondary">
                📍 {stelle.ort}
              </span>
            )}
            {stelle.region_name && (
              <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-text-secondary">
                {stelle.region_name}
              </span>
            )}
            {stelle.faehigkeit_name && (
              <span className="rounded-full bg-ca/10 px-2 py-0.5 text-ca">
                {faehigkeitLabel(stelle.faehigkeit_name)}
              </span>
            )}
            {stelle.projet && (
              <Link
                to={`/projets/${stelle.projet}`}
                className="rounded-full bg-ca/10 px-2 py-0.5 text-ca hover:underline"
              >
                {t("hilfe.projekt", { titel: stelle.projet_titre ?? "" })}
              </Link>
            )}
            {stelle.frei && stelle.sichtbarkeit === "mitglieder" && (
              <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-text-tertiary">
                🔒 {t("hilfe.sichtbarkeit.mitglieder")}
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-text-tertiary">
          {geschlossen ? (
            <span className="font-medium">{t(`stellen.status_stelle.${stelle.status}`)}</span>
          ) : (
            <span>{t("stellen.freie_plaetze", { count: stelle.freie_plaetze })}</span>
          )}
          {stelle.frist && !geschlossen && (
            <div>{t("hilfe.frist_bis", { datum: datum(stelle.frist) })}</div>
          )}
        </div>
      </div>

      {stelle.beschreibung && (
        <p className="whitespace-pre-line text-sm text-text-secondary">{stelle.beschreibung}</p>
      )}

      {zuGenehmigen && (
        <p className="rounded-cid bg-status-warningBg px-2 py-1 text-xs font-medium text-status-warningText">
          {t("hilfe.zu_genehmigen", { count: stelle.bewerbungen_empfohlen ?? 0 })}
        </p>
      )}

      {meine === "offen" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-status-successText">
            ✓ {stelle.frei ? t("hilfe.gemeldet") : t("stellen.gemeldet")}
          </span>
          <button
            type="button"
            onClick={() => zurueckziehen.mutate(stelle.id)}
            disabled={zurueckziehen.isPending}
            className="text-xs text-text-tertiary underline"
          >
            {t("stellen.zurueckziehen")}
          </button>
        </div>
      )}
      {meine === "empfohlen" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-status-successText">
            ✓ {t("hilfe.empfohlen_status")}
          </span>
          <button
            type="button"
            onClick={() => zurueckziehen.mutate(stelle.id)}
            disabled={zurueckziehen.isPending}
            className="text-xs text-text-tertiary underline"
          >
            {t("stellen.zurueckziehen")}
          </button>
        </div>
      )}
      {meine === "angenommen" && (
        <p className="text-xs font-medium text-status-successText">
          🎉 {stelle.frei ? t("hilfe.angenommen") : t("stellen.angenommen")}
        </p>
      )}
      {meine === "abgelehnt" && (
        <p className="text-xs text-text-tertiary">{t("stellen.abgelehnt")}</p>
      )}

      {!geschlossen &&
        !stelle.ist_meine &&
        (meine === null || meine === "zurueckgezogen") &&
        (angemeldet ? (
          formOffen ? (
            <div className="space-y-2">
              <textarea
                value={nachricht}
                onChange={(e) => setNachricht(e.target.value)}
                maxLength={500}
                rows={3}
                aria-label={t("hilfe.nachricht_label")}
                placeholder={t("stellen.nachricht_platzhalter")}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={senden}
                  disabled={bewerben.isPending}
                  className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
                >
                  {t("stellen.senden")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormOffen(false)}
                  className="rounded-cid px-3 py-1.5 text-sm text-text-secondary"
                >
                  {t("stellen.abbrechen")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFormOffen(true)}
              className="rounded-cid border border-ca px-3 py-1.5 text-sm font-medium text-ca hover:bg-ca/10"
            >
              🙋 {t("stellen.helfen")}
            </button>
          )
        ) : (
          <Link to="/login" className="text-sm font-medium text-ca underline">
            {t("stellen.login")}
          </Link>
        ))}

      {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}

      {pflegen && (
        <div className="space-y-2 border-t border-text-tertiary/15 pt-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setMeldungenOffen((o) => !o)}
              aria-expanded={meldungenOffen}
              className="font-medium text-ca hover:underline"
            >
              {t("hilfe.meldungen", {
                count: (stelle.bewerbungen_offen ?? 0) + (stelle.bewerbungen_empfohlen ?? 0),
              })}
            </button>
            {stelle.status === "offen" ? (
              <button
                type="button"
                disabled={aendern.isPending}
                onClick={() => statusSetzen("geschlossen")}
                className="text-text-secondary underline"
              >
                {t("stellen.schliessen")}
              </button>
            ) : (
              <button
                type="button"
                disabled={aendern.isPending}
                onClick={() => statusSetzen("offen")}
                className="text-text-secondary underline"
              >
                {t("stellen.wieder_oeffnen")}
              </button>
            )}
            <button
              type="button"
              onClick={entfernen}
              disabled={loeschen.isPending}
              className="text-status-dangerText underline"
            >
              {t("stellen.loeschen")}
            </button>
          </div>
          {meldungenOffen && <MeldungenPanel stelle={stelle} darfGenehmigen={darfGenehmigen} />}
          <Passende stelle={stelle} />
        </div>
      )}
    </li>
  );
}
