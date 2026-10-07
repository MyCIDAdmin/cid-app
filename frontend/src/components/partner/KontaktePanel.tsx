/** Ansprechpersonen eines Partners: mehrere je Partner, genau einer ist der Hauptkontakt. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAendernKontakt, useCreerKontakt, useLoescheKontakt } from "../../hooks/usePartner";
import type { PartnerKontakt, PartnerKontaktDaten } from "../../types/partner";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";

interface Props {
  partnerId: string;
  kontakte: PartnerKontakt[];
  schreibbar: boolean;
}

const LEER = { name: "", funktion: "", email: "", telefon: "" };

function KontaktFormular({
  start,
  pending,
  fehler,
  onSubmit,
  onCancel,
}: {
  start: typeof LEER;
  pending: boolean;
  fehler: string | null;
  onSubmit: (daten: PartnerKontaktDaten) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation("partner");
  const [werte, setWerte] = useState(start);
  const setze = (k: keyof typeof LEER, v: string) => setWerte((alt) => ({ ...alt, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(werte);
      }}
      className="grid gap-2 sm:grid-cols-2"
    >
      <div>
        <label htmlFor="kontakt-name" className={LABEL}>
          {t("kontakt_name")}
        </label>
        <input
          id="kontakt-name"
          required
          value={werte.name}
          onChange={(e) => setze("name", e.target.value)}
          className={FELD}
        />
      </div>
      <div>
        <label htmlFor="kontakt-funktion" className={LABEL}>
          {t("kontakt_funktion")}
        </label>
        <input
          id="kontakt-funktion"
          value={werte.funktion}
          onChange={(e) => setze("funktion", e.target.value)}
          className={FELD}
        />
      </div>
      <div>
        <label htmlFor="kontakt-email" className={LABEL}>
          {t("feld_email")}
        </label>
        <input
          id="kontakt-email"
          type="email"
          value={werte.email}
          onChange={(e) => setze("email", e.target.value)}
          className={FELD}
        />
      </div>
      <div>
        <label htmlFor="kontakt-telefon" className={LABEL}>
          {t("feld_telefon")}
        </label>
        <input
          id="kontakt-telefon"
          type="tel"
          value={werte.telefon}
          onChange={(e) => setze("telefon", e.target.value)}
          className={FELD}
        />
      </div>
      {fehler && <p className="text-xs text-status-dangerText sm:col-span-2">{fehler}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {t("speichern")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("abbrechen")}
          </button>
        )}
      </div>
    </form>
  );
}

export default function KontaktePanel({ partnerId, kontakte, schreibbar }: Props) {
  const { t } = useTranslation("partner");
  const [neu, setNeu] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<string | null>(null);
  const anlegen = useCreerKontakt(partnerId);
  const aendern = useAendernKontakt();
  const loeschen = useLoescheKontakt();
  const fehlerText = (e: unknown) => extractApiErrorMessage(e, t("fehler_aktion"));

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-text-primary">{t("kontakte")}</h2>
        {schreibbar && !neu && (
          <button
            type="button"
            onClick={() => setNeu(true)}
            className="ml-auto rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
          >
            {t("kontakt_neu")}
          </button>
        )}
      </div>

      {kontakte.length === 0 && !neu && (
        <p className="text-sm text-text-tertiary">{t("keine_kontakte")}</p>
      )}
      <ul className="divide-y divide-text-tertiary/10">
        {kontakte.map((k) =>
          bearbeiten === k.id ? (
            <li key={k.id} className="py-3">
              <KontaktFormular
                start={{ name: k.name, funktion: k.funktion, email: k.email, telefon: k.telefon }}
                pending={aendern.isPending}
                fehler={aendern.isError ? fehlerText(aendern.error) : null}
                onCancel={() => setBearbeiten(null)}
                onSubmit={(daten) =>
                  aendern.mutate({ id: k.id, daten }, { onSuccess: () => setBearbeiten(null) })
                }
              />
            </li>
          ) : (
            <li key={k.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="font-medium">{k.name}</span>
              {k.hauptkontakt && (
                <span className="rounded-full bg-ca/10 px-2 py-0.5 text-[11px] font-medium text-ca">
                  {t("hauptkontakt")}
                </span>
              )}
              {k.funktion && <span className="text-xs text-text-tertiary">{k.funktion}</span>}
              {k.email && (
                <a href={`mailto:${k.email}`} className="text-xs text-ca hover:underline">
                  {k.email}
                </a>
              )}
              {k.telefon && <span className="text-xs text-text-secondary">{k.telefon}</span>}
              {schreibbar && (
                <span className="ml-auto flex gap-3 text-xs">
                  {!k.hauptkontakt && (
                    <button
                      type="button"
                      disabled={aendern.isPending}
                      onClick={() => aendern.mutate({ id: k.id, daten: { hauptkontakt: true } })}
                      aria-label={t("zum_hauptkontakt_machen", { name: k.name })}
                      className="text-ca hover:underline"
                    >
                      {t("hauptkontakt_festlegen")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBearbeiten(k.id)}
                    aria-label={t("kontakt_bearbeiten", { name: k.name })}
                    className="text-ca hover:underline"
                  >
                    {t("bearbeiten")}
                  </button>
                  <button
                    type="button"
                    disabled={loeschen.isPending}
                    onClick={() => loeschen.mutate(k.id)}
                    aria-label={t("kontakt_entfernen", { name: k.name })}
                    className="text-status-dangerText hover:underline"
                  >
                    {t("entfernen")}
                  </button>
                </span>
              )}
            </li>
          ),
        )}
      </ul>
      {loeschen.isError && (
        <p className="mt-2 text-xs text-status-dangerText">{fehlerText(loeschen.error)}</p>
      )}
      {schreibbar && neu && (
        <div className="mt-3 border-t border-text-tertiary/10 pt-3">
          <KontaktFormular
            start={LEER}
            pending={anlegen.isPending}
            fehler={anlegen.isError ? fehlerText(anlegen.error) : null}
            onCancel={() => setNeu(false)}
            onSubmit={(daten) => anlegen.mutate(daten, { onSuccess: () => setNeu(false) })}
          />
        </div>
      )}
    </section>
  );
}
