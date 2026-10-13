/**
 * „Wir suchen Unterstützung“ (Release 10) auf der Projektseite: offene Stellen des Projekts.
 * Jedes aktive Mitglied kann sich mit einer kurzen Nachricht melden ; die Projektleitung
 * entscheidet im Arbeitsbereich (Tab „Stellen“). Anonyme Besucher sehen die Stellen und werden
 * zur Anmeldung geleitet.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useStelleBewerben, useStelleZurueckziehen, useStellen } from "../../hooks/useProjets";
import { useAuthStore } from "../../store/authStore";
import type { ProjetStelle } from "../../types/projets";
import { extractApiErrorMessage } from "../../utils/apiError";

function StelleKarte({ stelle }: { stelle: ProjetStelle }) {
  const { t } = useTranslation("projets");
  const angemeldet = useAuthStore((s) => s.isAuthenticated);
  const bewerben = useStelleBewerben();
  const zurueckziehen = useStelleZurueckziehen();
  const [offen, setOffen] = useState(false);
  const [nachricht, setNachricht] = useState("");
  const [fehler, setFehler] = useState("");
  const meine = stelle.meine_bewerbung;

  function senden() {
    setFehler("");
    bewerben.mutate(
      { id: stelle.id, nachricht },
      {
        onSuccess: () => {
          setOffen(false);
          setNachricht("");
        },
        onError: (err) => setFehler(extractApiErrorMessage(err, t("stellen.fehler"))),
      },
    );
  }

  return (
    <li className="space-y-2 rounded-cid border border-text-tertiary/20 bg-bg-primary p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{stelle.titel}</h3>
          {stelle.faehigkeit_name && (
            <span className="mt-1 inline-block rounded-full bg-ca/10 px-2 py-0.5 text-[11px] font-medium text-ca">
              {stelle.faehigkeit_name}
            </span>
          )}
        </div>
        <span className="text-xs text-text-tertiary">
          {t("stellen.freie_plaetze", { count: stelle.freie_plaetze })}
        </span>
      </div>
      {stelle.beschreibung && (
        <p className="whitespace-pre-line text-sm text-text-secondary">{stelle.beschreibung}</p>
      )}

      {meine === "offen" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-status-successText">
            ✓ {t("stellen.gemeldet")}
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
        <p className="text-xs font-medium text-status-successText">🎉 {t("stellen.angenommen")}</p>
      )}
      {meine === "abgelehnt" && (
        <p className="text-xs text-text-tertiary">{t("stellen.abgelehnt")}</p>
      )}

      {(meine === null || meine === "zurueckgezogen") &&
        (angemeldet ? (
          offen ? (
            <div className="space-y-2">
              <textarea
                value={nachricht}
                onChange={(e) => setNachricht(e.target.value)}
                maxLength={500}
                rows={3}
                aria-label={t("stellen.nachricht_label")}
                placeholder={t("stellen.nachricht_platzhalter")}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
              {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
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
                  onClick={() => setOffen(false)}
                  className="rounded-cid px-3 py-1.5 text-sm text-text-secondary"
                >
                  {t("stellen.abbrechen")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOffen(true)}
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
    </li>
  );
}

export default function StellenListe({ projetId }: { projetId: string }) {
  const { t } = useTranslation("projets");
  const stellen = useStellen(projetId);
  const offene = (stellen.data ?? []).filter((s) => s.status === "offen");
  if (offene.length === 0) return null;
  return (
    <section className="mt-6" data-testid="projekt-stellen">
      <h2 className="mb-1 text-base font-bold text-text-primary">{t("stellen.titel")}</h2>
      <p className="mb-3 text-sm text-text-secondary">{t("stellen.einleitung")}</p>
      <ul className="space-y-2">
        {offene.map((s) => (
          <StelleKarte key={s.id} stelle={s} />
        ))}
      </ul>
    </section>
  );
}
