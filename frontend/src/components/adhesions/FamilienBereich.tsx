/** Familienbereich auf „Meine Mitgliedschaft“ (R34): gebuchte Plätze, Kinder eintragen (mit
 * Einwilligung der Erziehungsberechtigten) und – nach Zahlung – eine eigene Junior-Karte je Kind.
 * Erwachsene werden erst in einer späteren Version per E-Mail-Einladung ergänzt. */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useKindAnlegen, useKindLoeschen } from "../../hooks/useAdhesions";
import type { FamilienKind, Souscription } from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";
import ConfirmDialog from "../ui/ConfirmDialog";
import MitgliedsKarte from "./MitgliedsKarte";

const LEER = { vorname: "", nachname: "", geburtsjahr: "", einwilligung: false };

export default function FamilienBereich({
  souscription,
  angebot,
  stil,
  kampagne,
  gueltigBis,
}: {
  souscription: Souscription;
  angebot: string;
  stil: string | null | undefined;
  kampagne?: string;
  gueltigBis?: string;
}) {
  const { t } = useTranslation("adhesions");
  const anlegen = useKindAnlegen();
  const loeschen = useKindLoeschen();
  const [form, setForm] = useState(LEER);
  const [zuLoeschen, setZuLoeschen] = useState<FamilienKind | null>(null);

  const bezahlt = souscription.statut === "payee";
  const kinder = souscription.kinder ?? [];
  const frei = souscription.plaetze_kinder - kinder.length;

  function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    anlegen.mutate(
      {
        souscriptionId: souscription.id,
        payload: {
          vorname: form.vorname.trim(),
          nachname: form.nachname.trim(),
          geburtsjahr: Number(form.geburtsjahr),
          einwilligung: form.einwilligung,
        },
      },
      { onSuccess: () => setForm(LEER) },
    );
  }

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
      <p className="text-sm text-text-secondary">
        {t("familie.plaetze_zusammenfassung", {
          erwachsene: souscription.plaetze_erwachsene,
          kinder: souscription.plaetze_kinder,
        })}
      </p>
      {souscription.plaetze_erwachsene > 0 && (
        <p className="mt-1 text-xs text-text-tertiary">{t("familie.erwachsene_hinweis")}</p>
      )}

      <h3 className="mt-4 text-xs font-semibold uppercase text-text-tertiary">
        {t("familie.kinder_titel", { anzahl: kinder.length, max: souscription.plaetze_kinder })}
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
                  · {t("familie.alter", { alter: kind.alter })}
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
                  stil={stil}
                  angebot={t("familie.junior_angebot", { angebot })}
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

      {frei > 0 && (
        <form
          onSubmit={absenden}
          className="mt-4 grid gap-2 border-t border-text-tertiary/10 pt-3 sm:grid-cols-3"
        >
          <div>
            <label htmlFor="kind-vorname" className="mb-1 block text-[11px] text-text-tertiary">
              {t("familie.vorname")}
            </label>
            <input
              id="kind-vorname"
              required
              maxLength={100}
              value={form.vorname}
              onChange={(e) => setForm({ ...form, vorname: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="kind-nachname" className="mb-1 block text-[11px] text-text-tertiary">
              {t("familie.nachname")}
            </label>
            <input
              id="kind-nachname"
              required
              maxLength={100}
              value={form.nachname}
              onChange={(e) => setForm({ ...form, nachname: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="kind-jahr" className="mb-1 block text-[11px] text-text-tertiary">
              {t("familie.geburtsjahr")}
            </label>
            <input
              id="kind-jahr"
              required
              type="number"
              min={1900}
              max={9999}
              value={form.geburtsjahr}
              onChange={(e) => setForm({ ...form, geburtsjahr: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-text-secondary sm:col-span-3">
            <input
              type="checkbox"
              required
              checked={form.einwilligung}
              onChange={(e) => setForm({ ...form, einwilligung: e.target.checked })}
              className="mt-0.5"
            />
            <span>{t("familie.einwilligung")}</span>
          </label>
          {anlegen.isError && (
            <p className="text-xs text-status-dangerText sm:col-span-3">
              {extractApiErrorMessage(anlegen.error, t("familie.erreur"))}
            </p>
          )}
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={anlegen.isPending}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {t("familie.hinzufuegen")}
            </button>
          </div>
        </form>
      )}
      {frei <= 0 && souscription.plaetze_kinder > 0 && (
        <p className="mt-3 text-xs text-text-tertiary">{t("familie.alle_plaetze_belegt")}</p>
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
