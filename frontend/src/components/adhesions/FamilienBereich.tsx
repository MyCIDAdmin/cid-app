/** Familienbereich auf „Meine Mitgliedschaft“ (R35): Gesamtpreis und Rabatt, weitere Erwachsene
 * mit Einladungsstatus (Name/E-Mail korrigieren, Einladung erneut senden), Kinder (entfernen) und
 * – nach Zahlung – eine eigene Junior-Karte je Kind mit dem zugewiesenen Angebot. */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useEinladungErneutSenden,
  useErwachsenerAendern,
  useKindLoeschen,
} from "../../hooks/useAdhesions";
import type { FamilienErwachsener, FamilienKind, Souscription } from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";
import ConfirmDialog from "../ui/ConfirmDialog";
import { formatEuro } from "./familienpreis";
import MitgliedsKarte from "./MitgliedsKarte";

const STATUS_STIL: Record<string, string> = {
  angenommen: "bg-status-successBg text-status-successText",
  konflikt: "bg-status-dangerBg text-status-dangerText",
  abgelehnt: "bg-status-dangerBg text-status-dangerText",
  zustimmung_offen: "bg-status-warningBg text-status-warningText",
  eingeladen: "bg-status-warningBg text-status-warningText",
  offen: "bg-bg-tertiary text-text-secondary",
};

const FELD = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm";

function ErwachsenerZeile({
  souscription,
  person,
  bezahlt,
}: {
  souscription: Souscription;
  person: FamilienErwachsener;
  bezahlt: boolean;
}) {
  const { t } = useTranslation("adhesions");
  const aendern = useErwachsenerAendern();
  const senden = useEinladungErneutSenden();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [form, setForm] = useState({
    vorname: person.vorname,
    nachname: person.nachname,
    email: person.email,
  });
  const korrigierbar = person.status !== "angenommen" && person.status !== "konflikt";
  const erneutMoeglich =
    bezahlt && ["offen", "eingeladen", "zustimmung_offen"].includes(person.status);

  function speichern(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    aendern.mutate(
      { souscriptionId: souscription.id, erwachsenerId: person.id, payload: form },
      { onSuccess: () => setBearbeiten(false) },
    );
  }

  return (
    <li className="rounded-cid border border-text-tertiary/15 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-text-primary">
          {person.vorname} {person.nachname}{" "}
          <span className="text-text-tertiary">
            · {t(`familie.beziehung_${person.beziehung}`)} · {person.angebot || "—"} ·{" "}
            {formatEuro(person.preis_anteil)}
          </span>
          <div className="text-xs text-text-tertiary">{person.email}</div>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STIL[person.status] ?? ""}`}
        >
          {t(`familie.status_${person.status}`)}
        </span>
      </div>
      {person.status === "konflikt" && (
        <p className="mt-1 text-xs text-status-dangerText">{t("familie.konflikt_hinweis")}</p>
      )}
      {(korrigierbar || erneutMoeglich) && !bearbeiten && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          {korrigierbar && (
            <button
              type="button"
              onClick={() => setBearbeiten(true)}
              className="text-ca hover:underline"
            >
              {t("familie.korrigieren")}
            </button>
          )}
          {erneutMoeglich && (
            <button
              type="button"
              disabled={senden.isPending}
              onClick={() =>
                senden.mutate({ souscriptionId: souscription.id, erwachsenerId: person.id })
              }
              className="text-ca hover:underline disabled:opacity-40"
            >
              {t("familie.erneut_senden")}
            </button>
          )}
        </div>
      )}
      {senden.isSuccess && (
        <p className="mt-1 text-xs text-status-successText">{t("familie.erneut_gesendet")}</p>
      )}
      {senden.isError && (
        <p className="mt-1 text-xs text-status-dangerText">
          {extractApiErrorMessage(senden.error, t("familie.erreur"))}
        </p>
      )}
      {bearbeiten && (
        <form onSubmit={speichern} className="mt-2 grid gap-2 sm:grid-cols-3">
          <input
            aria-label={t("familie.vorname")}
            required
            className={FELD}
            value={form.vorname}
            onChange={(e) => setForm({ ...form, vorname: e.target.value })}
          />
          <input
            aria-label={t("familie.nachname")}
            required
            className={FELD}
            value={form.nachname}
            onChange={(e) => setForm({ ...form, nachname: e.target.value })}
          />
          <input
            aria-label={t("familie.email")}
            required
            type="email"
            className={FELD}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          {aendern.isError && (
            <p className="text-xs text-status-dangerText sm:col-span-3">
              {extractApiErrorMessage(aendern.error, t("familie.erreur"))}
            </p>
          )}
          <div className="flex gap-2 sm:col-span-3">
            <button
              type="submit"
              disabled={aendern.isPending}
              className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {t("familie.speichern")}
            </button>
            <button
              type="button"
              onClick={() => setBearbeiten(false)}
              className="rounded-cid border border-text-tertiary/20 px-3 py-1 text-xs"
            >
              {t("offres.annuler_selection")}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function FamilienBereich({
  souscription,
  kampagne,
  gueltigBis,
}: {
  souscription: Souscription;
  kampagne?: string;
  gueltigBis?: string;
}) {
  const { t } = useTranslation("adhesions");
  const loeschen = useKindLoeschen();
  const [zuLoeschen, setZuLoeschen] = useState<FamilienKind | null>(null);

  const bezahlt = souscription.statut === "payee";
  const kinder = souscription.kinder ?? [];
  const erwachsene = souscription.erwachsene ?? [];
  const info =
    souscription.familien_info?.rolle === "hauptperson" ? souscription.familien_info : null;

  function bestaetigenLoeschen() {
    if (!zuLoeschen) return;
    loeschen.mutate(
      { souscriptionId: souscription.id, kindId: zuLoeschen.id },
      { onSuccess: () => setZuLoeschen(null) },
    );
  }

  return (
    <section className="mb-5 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-1 text-xs font-bold text-text-primary">{t("familie.titel")}</h2>
      {info && (
        <p className="text-sm text-text-secondary">
          {t("familie.gesamt_zeile", {
            preis: formatEuro(info.gesamtpreis),
            pct: Number(info.rabatt_pct),
          })}
        </p>
      )}

      <h3 className="mt-4 text-xs font-semibold uppercase text-text-tertiary">
        {t("familie.erwachsene_titel")} ({erwachsene.length})
      </h3>
      {erwachsene.length === 0 && (
        <p className="mt-1 text-sm text-text-tertiary">{t("familie.keine_erwachsenen")}</p>
      )}
      <ul className="mt-2 space-y-2">
        {erwachsene.map((p) => (
          <ErwachsenerZeile key={p.id} souscription={souscription} person={p} bezahlt={bezahlt} />
        ))}
      </ul>
      {!bezahlt && erwachsene.length > 0 && (
        <p className="mt-2 text-xs text-text-tertiary">{t("familie.einladung_nach_zahlung")}</p>
      )}

      <h3 className="mt-4 text-xs font-semibold uppercase text-text-tertiary">
        {t("familie.kinder_titel_kurz")} ({kinder.length})
      </h3>
      {kinder.length === 0 && (
        <p className="mt-1 text-sm text-text-tertiary">{t("familie.keine_kinder")}</p>
      )}
      <ul className="mt-2 space-y-3">
        {kinder.map((kind) => (
          <li key={kind.id}>
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <span className="flex-1">
                {kind.vorname} {kind.nachname}{" "}
                <span className="text-text-tertiary">
                  · {t("familie.alter", { alter: kind.alter })} ·{" "}
                  {t(`familie.beziehung_${kind.beziehung}`)} · {kind.angebot || "—"} ·{" "}
                  {formatEuro(kind.preis_anteil)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setZuLoeschen(kind)}
                aria-label={t("familie.entfernen_aria", {
                  name: `${kind.vorname} ${kind.nachname}`,
                })}
                className="rounded-cid border border-text-tertiary/20 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
              >
                {t("familie.entfernen")}
              </button>
            </div>
            {bezahlt && (
              <div className="mt-2 max-w-sm">
                <MitgliedsKarte
                  stil={kind.kartenstil}
                  angebot={t("familie.junior_angebot", { angebot: kind.angebot })}
                  name={`${kind.vorname} ${kind.nachname}`}
                  mitgliedsnummer={kind.kartennummer}
                  gueltigBis={gueltigBis}
                  kampagne={kampagne}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {!bezahlt && kinder.length > 0 && (
        <p className="mt-2 text-xs text-text-tertiary">{t("familie.karten_nach_zahlung")}</p>
      )}
      {loeschen.isError && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(loeschen.error, t("familie.erreur"))}
        </p>
      )}

      <ConfirmDialog
        open={zuLoeschen !== null}
        title={t("familie.entfernen_titel")}
        message={t("familie.entfernen_message", {
          name: zuLoeschen ? `${zuLoeschen.vorname} ${zuLoeschen.nachname}` : "",
        })}
        danger
        onConfirm={bestaetigenLoeschen}
        onCancel={() => setZuLoeschen(null)}
      />
    </section>
  );
}
