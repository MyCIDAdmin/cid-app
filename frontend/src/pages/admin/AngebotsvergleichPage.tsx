/** Angebotsvergleich je Projekt: mehrere Angebote nebeneinander, ein Zuschlag. Der Zuschlag
 * markiert nur (übrige Angebote = abgelehnt) und verknüpft den Gewinner als Lieferant mit dem
 * Projekt — eine Buchung oder Kostenposition entsteht nicht automatisch. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Sterne } from "../../components/partner/Sterne";
import {
  useAngebotAktion,
  useAngebote,
  useCreerAngebot,
  useLoescheAngebot,
  usePartner,
  usePartnerListe,
  useZiele,
} from "../../hooks/usePartner";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { Angebot } from "../../types/partner";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";
const PARTNER_FILTER = {} as const;

function Angebotsformular({ projetId }: { projetId: string }) {
  const { t } = useTranslation("partner");
  const partner = usePartnerListe(PARTNER_FILTER);
  const anlegen = useCreerAngebot();
  const [partnerId, setPartnerId] = useState("");
  const [betrag, setBetrag] = useState("");
  const [gueltigBis, setGueltigBis] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [dokumentId, setDokumentId] = useState("");
  const detail = usePartner(partnerId || undefined);
  const dokumente = (detail.data?.dokumente ?? []).filter((d) => d.typ === "angebot");

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    anlegen.mutate(
      {
        projet: projetId,
        partner: partnerId,
        betrag,
        gueltig_bis: gueltigBis || null,
        beschreibung,
        dokument: dokumentId || null,
      },
      {
        onSuccess: () => {
          setBetrag("");
          setGueltigBis("");
          setBeschreibung("");
          setDokumentId("");
        },
      },
    );
  }

  return (
    <form
      onSubmit={absenden}
      className="mt-4 grid gap-2 border-t border-text-tertiary/10 pt-4 sm:grid-cols-2"
    >
      <h3 className="text-sm font-semibold sm:col-span-2">{t("angebot_neu")}</h3>
      <div>
        <label htmlFor="angebot-partner" className={LABEL}>
          {t("angebot_partner")}
        </label>
        <select
          id="angebot-partner"
          required
          value={partnerId}
          onChange={(e) => {
            setPartnerId(e.target.value);
            setDokumentId("");
          }}
          className={FELD}
        >
          <option value="">{t("verknuepfung_waehlen")}</option>
          {(partner.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="angebot-betrag" className={LABEL}>
          {t("angebot_betrag")}
        </label>
        <input
          id="angebot-betrag"
          type="number"
          required
          min="0.01"
          step="0.01"
          value={betrag}
          onChange={(e) => setBetrag(e.target.value)}
          className={FELD}
        />
      </div>
      <div>
        <label htmlFor="angebot-gueltig" className={LABEL}>
          {t("gueltig_bis")}
        </label>
        <input
          id="angebot-gueltig"
          type="date"
          value={gueltigBis}
          onChange={(e) => setGueltigBis(e.target.value)}
          className={FELD}
        />
      </div>
      <div>
        <label htmlFor="angebot-dokument" className={LABEL}>
          {t("angebot_dokument")}
        </label>
        <select
          id="angebot-dokument"
          value={dokumentId}
          disabled={dokumente.length === 0}
          onChange={(e) => setDokumentId(e.target.value)}
          className={FELD}
        >
          <option value="">{t("angebot_ohne_dokument")}</option>
          {dokumente.map((d) => (
            <option key={d.id} value={d.id}>
              {d.titel}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="angebot-beschreibung" className={LABEL}>
          {t("angebot_beschreibung")}
        </label>
        <input
          id="angebot-beschreibung"
          maxLength={300}
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          className={FELD}
        />
      </div>
      {anlegen.isError && (
        <p className="text-xs text-status-dangerText sm:col-span-2">
          {extractApiErrorMessage(anlegen.error, t("fehler_aktion"))}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={anlegen.isPending || !partnerId}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {t("angebot_speichern")}
        </button>
      </div>
    </form>
  );
}

function Tabelle({ angebote, schreibbar }: { angebote: Angebot[]; schreibbar: boolean }) {
  const { t, i18n } = useTranslation("partner");
  const aktion = useAngebotAktion();
  const loeschen = useLoescheAngebot();
  const geld = new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EUR" });
  const guenstigster = Math.min(...angebote.map((a) => Number(a.betrag)));
  const gewaehlt = angebote.some((a) => a.status === "zuschlag");
  const fehler = aktion.error ?? loeschen.error;

  return (
    <>
      <div className="overflow-x-auto rounded-cid border border-text-tertiary/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-tertiary text-left text-xs uppercase text-text-tertiary">
              <th className="px-3 py-2">{t("angebot_partner")}</th>
              <th className="px-3 py-2 text-right">{t("angebot_betrag")}</th>
              <th className="px-3 py-2 text-right">{t("angebot_differenz")}</th>
              <th className="px-3 py-2">{t("bewertung")}</th>
              <th className="px-3 py-2">{t("gueltig_bis")}</th>
              <th className="px-3 py-2">{t("status")}</th>
              {schreibbar && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {angebote.map((a) => {
              const diff = Number(a.betrag) - guenstigster;
              return (
                <tr
                  key={a.id}
                  className={`border-t border-text-tertiary/10 align-top ${
                    a.status === "abgelehnt" ? "text-text-tertiary" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/admin/partner/${a.partner}`}
                      className="font-medium text-ca hover:underline"
                    >
                      {a.partner_name}
                    </Link>
                    {a.beschreibung && (
                      <div className="text-xs text-text-secondary">{a.beschreibung}</div>
                    )}
                    {a.dokument_url && (
                      <a
                        href={a.dokument_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-ca hover:underline"
                      >
                        {t("angebot_dokument_oeffnen")}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {geld.format(Number(a.betrag))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {diff === 0 ? t("angebot_guenstigster") : `+${geld.format(diff)}`}
                  </td>
                  <td className="px-3 py-2">
                    <Sterne wert={a.partner_note} />
                  </td>
                  <td className="px-3 py-2">
                    {a.gueltig_bis
                      ? new Date(`${a.gueltig_bis}T00:00:00`).toLocaleDateString()
                      : "–"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        a.status === "zuschlag"
                          ? "bg-status-successBg text-status-successText"
                          : "bg-bg-tertiary text-text-secondary"
                      }`}
                    >
                      {t(`angebot_status_${a.status}`)}
                    </span>
                  </td>
                  {schreibbar && (
                    <td className="space-x-3 whitespace-nowrap px-3 py-2 text-right text-xs">
                      {a.status === "zuschlag" ? (
                        <button
                          type="button"
                          disabled={aktion.isPending}
                          onClick={() => aktion.mutate({ id: a.id, aktion: "zuruecksetzen" })}
                          className="text-ca hover:underline"
                        >
                          {t("angebot_zuruecksetzen")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={aktion.isPending}
                          onClick={() => aktion.mutate({ id: a.id, aktion: "zuschlag" })}
                          aria-label={t("angebot_zuschlag_fuer", { name: a.partner_name })}
                          className="text-ca hover:underline"
                        >
                          {t("angebot_zuschlag")}
                        </button>
                      )}
                      {a.status !== "zuschlag" && (
                        <button
                          type="button"
                          disabled={loeschen.isPending}
                          onClick={() => loeschen.mutate(a.id)}
                          aria-label={t("angebot_loeschen_fuer", { name: a.partner_name })}
                          className="text-status-dangerText hover:underline"
                        >
                          {t("entfernen")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {gewaehlt && (
        <p className="mt-2 text-xs text-text-secondary">{t("angebot_zuschlag_hinweis")}</p>
      )}
      {fehler != null && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(fehler, t("fehler_aktion"))}
        </p>
      )}
    </>
  );
}

export default function AngebotsvergleichPage() {
  const { t } = useTranslation("partner");
  const schreibbar = hasRoleAtLeast(
    useAuthStore((s) => s.user),
    ROLE_LEVELS.bureau_admin,
  );
  const [suche, setSuche] = useState("");
  const [projetId, setProjetId] = useState("");
  const projekte = useZiele("projet", suche);
  const angebote = useAngebote(projetId);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/partner" className="text-sm text-ca hover:underline">
          ← {t("zurueck")}
        </Link>
        <h1 className="text-xl font-bold text-text-primary">{t("angebote_titel")}</h1>
      </div>
      <p className="text-sm text-text-tertiary">{t("angebote_untertitel")}</p>

      <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="angebote-suche" className={LABEL}>
              {t("verknuepfung_suche")}
            </label>
            <input
              id="angebote-suche"
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className={FELD}
            />
          </div>
          <div>
            <label htmlFor="angebote-projekt" className={LABEL}>
              {t("ziel_projet")}
            </label>
            <select
              id="angebote-projekt"
              value={projetId}
              onChange={(e) => setProjetId(e.target.value)}
              className={FELD}
            >
              <option value="">{t("verknuepfung_waehlen")}</option>
              {(projekte.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {projetId && (
          <div className="mt-4">
            {angebote.isLoading && <p className="text-sm text-text-tertiary">{t("laedt")}</p>}
            {angebote.isError && (
              <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>
            )}
            {angebote.data && angebote.data.length === 0 && (
              <p className="text-sm text-text-tertiary">{t("keine_angebote")}</p>
            )}
            {angebote.data && angebote.data.length > 0 && (
              <Tabelle angebote={angebote.data} schreibbar={schreibbar} />
            )}
            {schreibbar && <Angebotsformular projetId={projetId} />}
          </div>
        )}
      </section>
    </div>
  );
}
