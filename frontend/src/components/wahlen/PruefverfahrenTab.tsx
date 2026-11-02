/**
 * Prüfverfahren für den Wahlausschuss : eingegangene Dossiers, Prüfpunkte (automatisch oder von
 * Hand), Entscheidung mit zwei Freigaben. Büro und App-Admin sehen alles, entscheiden aber nur,
 * wenn sie selbst im Ausschuss sind (der Server prüft das).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { nachweisAnsehen } from "../../api/wahlen";
import { useKandidaturAktionen, useKandidaturen } from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import type { EntscheidungArt, Kandidatur, Pruefergebnis, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datum } from "../../utils/wahlen";

function Dossier({ wahl, kandidatur }: { wahl: Wahl; kandidatur: Kandidatur }) {
  const { t } = useTranslation("wahlen");
  const userId = String(useAuthStore((s) => s.user?.id ?? ""));
  const aktionen = useKandidaturAktionen(kandidatur.id);
  const [art, setArt] = useState<EntscheidungArt>("zulassen");
  const [begruendung, setBegruendung] = useState("");
  const [artikel, setArtikel] = useState("");
  const [fehler, setFehler] = useState("");
  const offen = kandidatur.entscheidung_offen;
  const eingereicht = kandidatur.status === "eingereicht";
  const merken = (e: unknown) => setFehler(extractApiErrorMessage(e, t("pruefung.fehler")));

  async function ansehen(nachweis: string) {
    try {
      const { url } = await nachweisAnsehen(kandidatur.id, nachweis);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      merken(e);
    }
  }

  function vorschlagen() {
    setFehler("");
    aktionen.entscheidung.mutate(
      { art, begruendung, artikel },
      { onError: merken, onSuccess: () => setBegruendung("") },
    );
  }

  return (
    <article className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm" data-testid="dossier">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-text-primary">
          {kandidatur.name || kandidatur.personen.map((p) => p.name).join(", ")}
        </h3>
        <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs">
          {t(`kandidatur_status.${kandidatur.status}`)}
        </span>
      </header>
      <p className="text-xs text-text-secondary">
        {t("pruefung.eingereicht_von", {
          name: kandidatur.einreicher,
          datum: datum(kandidatur.eingereicht_am, true),
        })}
      </p>
      <p className="text-sm">{kandidatur.leitsatz}</p>
      <p className="text-sm text-text-secondary">{kandidatur.vorstellung}</p>

      <ul className="space-y-1 text-sm">
        {kandidatur.personen.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{p.name}</span>
            <span className="text-xs text-text-tertiary">{t(`amt.${p.amt}`)}</span>
          </li>
        ))}
      </ul>

      {(kandidatur.nachweise ?? []).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-text-tertiary">
            {t("pruefung.nachweise")}
          </h4>
          <ul className="mt-1 flex flex-wrap gap-2">
            {(kandidatur.nachweise ?? []).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => ansehen(n.id)}
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs hover:bg-bg-secondary"
                >
                  {t(`nachweis.${n.art}`, { defaultValue: n.art })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold uppercase text-text-tertiary">
          {t("pruefung.pruefpunkte")}
        </h4>
        <ul className="mt-1 space-y-1">
          {(kandidatur.pruefpunkte ?? []).map((punkt) => (
            <li
              key={punkt.schluessel}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
              data-testid="pruefpunkt"
            >
              <span>
                {t(`pruefpunkt.${punkt.schluessel}`, { defaultValue: punkt.schluessel })}
                {punkt.notiz && <em className="ml-2 text-xs text-text-tertiary">{punkt.notiz}</em>}
              </span>
              {punkt.automatisch ? (
                <span className="text-xs text-text-tertiary">
                  {t("pruefung.automatisch")}:{" "}
                  {punkt.ergebnis === "ok" ? "✓" : punkt.ergebnis === "nein" ? "✗" : "–"}
                </span>
              ) : (
                <span className="flex gap-1">
                  {(["ok", "nein", "offen"] as Pruefergebnis[]).map((e) => (
                    <button
                      key={e}
                      type="button"
                      disabled={!eingereicht || !wahl.ist_ausschuss}
                      aria-pressed={punkt.ergebnis === e}
                      onClick={() =>
                        aktionen.pruefpunkt.mutate(
                          { schluessel: punkt.schluessel, ergebnis: e },
                          { onError: merken },
                        )
                      }
                      className={`rounded-cid px-2 py-0.5 text-xs ${
                        punkt.ergebnis === e
                          ? "bg-ca text-white"
                          : "border border-text-tertiary/30 text-text-secondary"
                      } disabled:opacity-50`}
                    >
                      {t(`pruefung.ergebnis.${e}`)}
                    </button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {offen && (
        <div className="rounded-cid bg-bg-secondary p-3 text-sm" data-testid="entscheidung-offen">
          <p className="font-medium">
            {t("pruefung.vorschlag", { art: t(`entscheidung.${offen.art}`) })}
          </p>
          {offen.begruendung && <p className="text-xs text-text-secondary">{offen.begruendung}</p>}
          {offen.artikel && <p className="text-xs text-text-secondary">{offen.artikel}</p>}
          <p className="mt-1 text-xs">
            {t("pruefung.zustimmungen", {
              n: offen.zustimmungen.length,
              noetig: wahl.zustimmungen_noetig,
            })}
          </p>
          {wahl.ist_ausschuss && (
            <div className="mt-2 flex gap-2">
              {!offen.zustimmungen.map(String).includes(userId) && (
                <button
                  type="button"
                  onClick={() =>
                    aktionen.entscheidungAntwort.mutate(
                      { eid: offen.id, aktion: "zustimmen" },
                      { onError: merken },
                    )
                  }
                  className="rounded-cid bg-ca px-3 py-1 text-xs font-semibold text-white"
                >
                  {t("pruefung.zustimmen")}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  aktionen.entscheidungAntwort.mutate(
                    { eid: offen.id, aktion: "verwerfen" },
                    { onError: merken },
                  )
                }
                className="rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs"
              >
                {t("pruefung.verwerfen")}
              </button>
            </div>
          )}
        </div>
      )}

      {eingereicht && wahl.ist_ausschuss && !offen && (
        <div className="space-y-2 rounded-cid border border-text-tertiary/20 p-3">
          <h4 className="text-sm font-semibold">{t("pruefung.entscheiden")}</h4>
          <select
            value={art}
            onChange={(e) => setArt(e.target.value as EntscheidungArt)}
            aria-label={t("pruefung.entscheiden")}
            className="w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
          >
            {(["zulassen", "rueckfrage", "ablehnen"] as EntscheidungArt[]).map((a) => (
              <option key={a} value={a}>
                {t(`entscheidung.${a}`)}
              </option>
            ))}
          </select>
          {art !== "zulassen" && (
            <textarea
              rows={2}
              value={begruendung}
              onChange={(e) => setBegruendung(e.target.value)}
              placeholder={t("pruefung.begruendung")}
              aria-label={t("pruefung.begruendung")}
              className="w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
            />
          )}
          {art === "ablehnen" && (
            <input
              value={artikel}
              onChange={(e) => setArtikel(e.target.value)}
              placeholder={t("pruefung.artikel")}
              aria-label={t("pruefung.artikel")}
              className="w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
            />
          )}
          <button
            type="button"
            onClick={vorschlagen}
            disabled={aktionen.entscheidung.isPending}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("pruefung.vorschlagen")}
          </button>
        </div>
      )}
      {(kandidatur.entscheidungen ?? []).map((e) => (
        <p key={e.id} className="text-xs text-text-tertiary">
          {datum(e.umgesetzt_am, true)}: {t(`entscheidung.${e.art}`)}
          {e.artikel ? ` (${e.artikel})` : ""}
        </p>
      ))}
      {fehler && (
        <p role="alert" className="text-sm text-status-dangerText">
          {fehler}
        </p>
      )}
    </article>
  );
}

export default function PruefverfahrenTab({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const kandidaturen = useKandidaturen(wahl.id);
  const eingegangen = (kandidaturen.data ?? []).filter((k) => k.status !== "entwurf");

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        {t("pruefung.einleitung", { n: wahl.zustimmungen_noetig })}
      </p>
      {kandidaturen.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {!kandidaturen.isLoading && eingegangen.length === 0 && (
        <p className="rounded-cid-lg bg-bg-primary p-4 text-sm text-text-secondary">
          {t("pruefung.leer")}
        </p>
      )}
      {eingegangen.map((k) => (
        <Dossier key={k.id} wahl={wahl} kandidatur={k} />
      ))}
    </div>
  );
}
