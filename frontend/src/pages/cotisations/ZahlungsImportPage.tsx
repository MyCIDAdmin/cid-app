/**
 * Zahlungen importieren und nachbearbeiten (Release 3, 2026-10-12).
 *
 * Oben der generische Import-Assistent (Prüfen -> Bestätigen -> Bericht, ImportAssistent art
 * "zahlungen"), darunter die importierten Zahlungseingänge. Vollständige Zeilen (Mitglied +
 * Artikel) sind beim Import bereits als bezahlte Cotisation gebucht; unvollständige bleiben
 * „offen" und werden hier ergänzt, einem Mitglied zugeordnet und gebucht. Nichts wird gelöscht —
 * „verwerfen" blendet nur aus und lässt sich rückgängig machen.
 * Zugriff: Matrix-Seite page_zahlungen_import (Lesen = ansehen, Schreiben = ändern/importieren).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAendereZahlungseingang,
  useZahlungseingaenge,
  useZahlungseingangAktion,
} from "../../hooks/useCotisations";
import { useMembresList } from "../../hooks/useMembres";
import { usePageAccess } from "../../hooks/useRbac";
import type { ModePaiement } from "../../types/cotisation";
import type {
  StatusZahlungseingang,
  Zahlungseingang,
  ZahlungsArtikel,
} from "../../types/zahlungseingang";
import { extractApiErrorMessage } from "../../utils/apiError";
import ImportListenVerwaltung from "../../components/cotisations/ImportListenVerwaltung";
import ImportAssistent from "../membres/ImportAssistent";

const ARTIKEL: ZahlungsArtikel[] = ["cotisation", "adhesion", "don", "autre_libre"];
const MODI: ModePaiement[] = ["virement_sepa", "especes", "paypal", "carte"];
const FELD =
  "rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs disabled:opacity-40 bg-bg-primary";

const STATUS_STIL: Record<StatusZahlungseingang, string> = {
  offen: "bg-status-warningBg text-status-warningText",
  gebucht: "bg-status-successBg text-status-successText",
  verworfen: "bg-bg-secondary text-text-secondary",
};

function MitgliedSuche({ onWahl }: { onWahl: (id: string) => void }) {
  const { t } = useTranslation("cotisations");
  const [q, setQ] = useState("");
  const treffer = useMembresList({ q }, null, { enabled: q.trim().length >= 2 });

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("zahlungen_import.mitglied_suchen")}
        aria-label={t("zahlungen_import.mitglied_suchen")}
        className={`${FELD} w-48`}
      />
      {q.trim().length >= 2 && (
        <ul className="mt-1 max-h-32 overflow-auto rounded-cid border border-text-tertiary/20 bg-bg-primary text-xs">
          {(treffer.data?.results ?? []).slice(0, 8).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onWahl(m.id);
                  setQ("");
                }}
                className="block w-full px-2 py-1 text-left hover:bg-bg-secondary"
              >
                {m.prenom} {m.nom} · {m.email}
              </button>
            </li>
          ))}
          {treffer.data?.results.length === 0 && (
            <li className="px-2 py-1 text-text-tertiary">{t("zahlungen_import.kein_treffer")}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function ZahlungsZeile({ eingang, modifiable }: { eingang: Zahlungseingang; modifiable: boolean }) {
  const { t } = useTranslation(["cotisations", "common"]);
  const aendern = useAendereZahlungseingang();
  const aktion = useZahlungseingangAktion();
  const offen = eingang.status === "offen";
  const bearbeitbar = offen && modifiable;
  const fehler = aendern.error ?? aktion.error;
  const mitglied = eingang.membre_info;

  return (
    <tr className="border-b border-text-tertiary/10 align-top last:border-0">
      <td className="px-3 py-2 text-xs">
        <div>{eingang.datum ?? "—"}</div>
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STIL[eingang.status]}`}
        >
          {t(`zahlungen_import.status.${eingang.status}`)}
        </span>
      </td>
      <td className="px-3 py-2 text-sm font-semibold tabular-nums">{eingang.betrag} €</td>
      <td className="px-3 py-2 text-xs">
        <div className="font-medium text-text-primary">{eingang.referenz || "—"}</div>
        <div className="text-text-secondary">{eingang.verwendungszweck}</div>
        {eingang.hinweis && <div className="mt-1 text-text-tertiary">{eingang.hinweis}</div>}
      </td>
      <td className="px-3 py-2 text-xs">
        {mitglied ? (
          <div>
            <div className="font-medium text-text-primary">
              {mitglied.prenom} {mitglied.nom}
            </div>
            <div className="text-text-secondary">{mitglied.email}</div>
          </div>
        ) : (
          <span className="text-status-warningText">{t("zahlungen_import.ohne_mitglied")}</span>
        )}
        {bearbeitbar && (
          <div className="mt-1">
            <MitgliedSuche
              onWahl={(id) => aendern.mutate({ id: eingang.id, payload: { membre: id } })}
            />
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={t("zahlungen_import.col_artikel")}
          value={eingang.type_article}
          disabled={!bearbeitbar || aendern.isPending}
          onChange={(e) =>
            aendern.mutate({
              id: eingang.id,
              payload: { type_article: e.target.value as ZahlungsArtikel },
            })
          }
          className={FELD}
        >
          <option value="">—</option>
          {ARTIKEL.map((a) => (
            <option key={a} value={a}>
              {t(`zahlungen_import.artikel.${a}`)}
            </option>
          ))}
        </select>
        <input
          type="number"
          aria-label={t("zahlungen_import.col_jahr")}
          defaultValue={eingang.annee ?? ""}
          disabled={!bearbeitbar}
          onBlur={(e) => {
            const jahr = e.target.value ? Number(e.target.value) : null;
            if (jahr !== eingang.annee)
              aendern.mutate({ id: eingang.id, payload: { annee: jahr } });
          }}
          className={`${FELD} ml-1 w-20`}
        />
        <select
          aria-label={t("zahlungen_import.col_modus")}
          value={eingang.mode_paiement}
          disabled={!bearbeitbar || aendern.isPending}
          onChange={(e) =>
            aendern.mutate({
              id: eingang.id,
              payload: { mode_paiement: e.target.value as ModePaiement },
            })
          }
          className={`${FELD} mt-1 block`}
        >
          <option value="">—</option>
          {MODI.map((m) => (
            <option key={m} value={m}>
              {t(`zahlungen_import.modus.${m}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        {offen && eingang.fehlt.length > 0 && (
          <p className="mb-1 text-xs text-status-warningText">
            {t("zahlungen_import.fehlt", { was: eingang.fehlt.join(", ") })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {offen && (
            <button
              type="button"
              disabled={!modifiable || eingang.fehlt.length > 0 || aktion.isPending}
              title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
              onClick={() => aktion.mutate({ id: eingang.id, aktion: "buchen" })}
              className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {t("zahlungen_import.buchen")}
            </button>
          )}
          {offen && (
            <button
              type="button"
              disabled={!modifiable || aktion.isPending}
              onClick={() => aktion.mutate({ id: eingang.id, aktion: "verwerfen" })}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs hover:bg-bg-secondary disabled:opacity-40"
            >
              {t("zahlungen_import.verwerfen")}
            </button>
          )}
          {eingang.status === "verworfen" && (
            <button
              type="button"
              disabled={!modifiable || aktion.isPending}
              onClick={() => aktion.mutate({ id: eingang.id, aktion: "wiederherstellen" })}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs hover:bg-bg-secondary disabled:opacity-40"
            >
              {t("zahlungen_import.wiederherstellen")}
            </button>
          )}
        </div>
        {fehler && (
          <p className="mt-1 text-xs text-status-dangerText">
            {extractApiErrorMessage(fehler, t("zahlungen_import.erreur_action"))}
          </p>
        )}
      </td>
    </tr>
  );
}

export default function ZahlungsImportPage({ eingebettet = false }: { eingebettet?: boolean }) {
  const { t } = useTranslation(["cotisations", "common"]);
  const { accessible, modifiable } = usePageAccess("page_zahlungen_import");
  const [status, setStatus] = useState<StatusZahlungseingang | "">("offen");
  const [suche, setSuche] = useState("");
  const [seitenUrl, setSeitenUrl] = useState<string | null>(null);
  const liste = useZahlungseingaenge({ status, q: suche.trim() }, seitenUrl);

  return (
    <div>
      {eingebettet ? (
        <h2 className="mb-2 text-lg font-bold text-text-primary">{t("zahlungen_import.titre")}</h2>
      ) : (
        <h1 className="mb-2 text-xl font-bold text-text-primary">{t("zahlungen_import.titre")}</h1>
      )}
      <p className="mb-4 text-sm text-text-secondary">{t("zahlungen_import.beschreibung")}</p>

      {accessible && !modifiable && (
        <p className="mb-4 rounded-cid-lg bg-bg-tertiary px-4 py-2 text-sm text-text-secondary">
          {t("common:acces.lecture_seule_banniere")}
        </p>
      )}

      {modifiable && <ImportAssistent art="zahlungen" />}
      {accessible && <ImportListenVerwaltung modifiable={modifiable} />}

      <h2 className="mb-2 mt-8 text-lg font-semibold text-text-primary">
        {t("zahlungen_import.liste_titre")}
      </h2>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          aria-label={t("zahlungen_import.filter_status")}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusZahlungseingang | "");
            setSeitenUrl(null);
          }}
          className={FELD}
        >
          <option value="">{t("zahlungen_import.alle")}</option>
          {(["offen", "gebucht", "verworfen"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`zahlungen_import.status.${s}`)}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={suche}
          onChange={(e) => {
            setSuche(e.target.value);
            setSeitenUrl(null);
          }}
          placeholder={t("zahlungen_import.suche")}
          aria-label={t("zahlungen_import.suche")}
          className={`${FELD} w-64`}
        />
      </div>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-3 py-2">{t("zahlungen_import.col_datum")}</th>
              <th className="px-3 py-2">{t("zahlungen_import.col_betrag")}</th>
              <th className="px-3 py-2">{t("zahlungen_import.col_zahlung")}</th>
              <th className="px-3 py-2">{t("zahlungen_import.col_mitglied")}</th>
              <th className="px-3 py-2">{t("zahlungen_import.col_artikel")}</th>
              <th className="px-3 py-2">{t("zahlungen_import.col_aktionen")}</th>
            </tr>
          </thead>
          <tbody>
            {liste.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("zahlungen_import.chargement")}
                </td>
              </tr>
            )}
            {liste.isError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-status-dangerText">
                  {t("zahlungen_import.erreur_chargement")}
                </td>
              </tr>
            )}
            {liste.data?.results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("zahlungen_import.leer")}
                </td>
              </tr>
            )}
            {liste.data?.results.map((e) => (
              <ZahlungsZeile key={e.id} eingang={e} modifiable={modifiable} />
            ))}
          </tbody>
        </table>
      </div>

      {liste.data?.next && (
        <button
          type="button"
          onClick={() => setSeitenUrl(liste.data?.next ?? null)}
          className="mt-3 rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm hover:bg-bg-secondary"
        >
          {t("zahlungen_import.weiter")}
        </button>
      )}
      {seitenUrl && (
        <button
          type="button"
          onClick={() => setSeitenUrl(null)}
          className="ml-2 mt-3 rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm hover:bg-bg-secondary"
        >
          {t("zahlungen_import.zur_ersten_seite")}
        </button>
      )}
    </div>
  );
}
