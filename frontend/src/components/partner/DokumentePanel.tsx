/** Verträge, Angebote und sonstige Dokumente eines Partners. Bei Verträgen ist "Gültig bis" das
 * Vertragsende; 60 und 14 Tage vorher erinnert das System (siehe Backend tasks.py). */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useLadeDokumentHoch, useLoescheDokument } from "../../hooks/usePartner";
import { DOKUMENT_TYPEN, type DokumentTyp, type PartnerDokument } from "../../types/partner";
import { extractApiErrorMessage } from "../../utils/apiError";
import { tageBis } from "../../utils/partner";

const FELD = "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";

interface Props {
  partnerId: string;
  dokumente: PartnerDokument[];
  schreibbar: boolean;
}

function Frist({ dokument }: { dokument: PartnerDokument }) {
  const { t } = useTranslation("partner");
  if (!dokument.gueltig_bis) return null;
  const tage = tageBis(dokument.gueltig_bis);
  const datum = new Date(`${dokument.gueltig_bis}T00:00:00`).toLocaleDateString();
  const warnung = dokument.typ === "vertrag" && tage <= 60;
  return (
    <span
      className={`text-xs ${warnung ? "font-medium text-status-dangerText" : "text-text-secondary"}`}
    >
      {t("gueltig_bis_datum", { datum })}
      {dokument.typ === "vertrag" &&
        (tage < 0
          ? ` · ${t("abgelaufen")}`
          : tage <= 60
            ? ` · ${t("in_tagen", { count: tage })}`
            : "")}
    </span>
  );
}

function Hochladen({ partnerId }: { partnerId: string }) {
  const { t } = useTranslation("partner");
  const hochladen = useLadeDokumentHoch(partnerId);
  const [datei, setDatei] = useState<File | null>(null);
  const [titel, setTitel] = useState("");
  const [typ, setTyp] = useState<DokumentTyp>("vertrag");
  const [gueltigBis, setGueltigBis] = useState("");
  const [notiz, setNotiz] = useState("");
  const [schluessel, setSchluessel] = useState(0);

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (!datei) return;
    hochladen.mutate(
      { datei, titel, typ, gueltig_bis: gueltigBis || undefined, notiz: notiz || undefined },
      {
        onSuccess: () => {
          setDatei(null);
          setTitel("");
          setGueltigBis("");
          setNotiz("");
          setSchluessel((k) => k + 1); // Dateifeld leeren
        },
      },
    );
  }

  return (
    <form
      onSubmit={absenden}
      className="mt-4 grid gap-2 border-t border-text-tertiary/10 pt-4 sm:grid-cols-2"
    >
      <div>
        <label htmlFor="dok-typ" className={LABEL}>
          {t("dokument_typ")}
        </label>
        <select
          id="dok-typ"
          value={typ}
          onChange={(e) => setTyp(e.target.value as DokumentTyp)}
          className={FELD}
        >
          {DOKUMENT_TYPEN.map((d) => (
            <option key={d} value={d}>
              {t(`dokument_typ_${d}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="dok-titel" className={LABEL}>
          {t("dokument_titel")}
        </label>
        <input
          id="dok-titel"
          required
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          className={FELD}
        />
      </div>
      <div>
        <label htmlFor="dok-datei" className={LABEL}>
          {t("dokument_datei")}
        </label>
        <input
          key={schluessel}
          id="dok-datei"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.docx"
          onChange={(e) => setDatei(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>
      <div>
        <label htmlFor="dok-gueltig" className={LABEL}>
          {typ === "vertrag" ? t("vertragsende") : t("gueltig_bis")}
        </label>
        <input
          id="dok-gueltig"
          type="date"
          value={gueltigBis}
          onChange={(e) => setGueltigBis(e.target.value)}
          className={FELD}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="dok-notiz" className={LABEL}>
          {t("dokument_notiz")}
        </label>
        <input
          id="dok-notiz"
          value={notiz}
          maxLength={300}
          onChange={(e) => setNotiz(e.target.value)}
          className={FELD}
        />
      </div>
      {hochladen.isError && (
        <p className="text-xs text-status-dangerText sm:col-span-2">
          {extractApiErrorMessage(hochladen.error, t("fehler_aktion"))}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={hochladen.isPending || !datei}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {t("dokument_hochladen")}
        </button>
        <p className="mt-1 text-[11px] text-text-tertiary">{t("dokument_hinweis")}</p>
      </div>
    </form>
  );
}

export default function DokumentePanel({ partnerId, dokumente, schreibbar }: Props) {
  const { t } = useTranslation("partner");
  const loeschen = useLoescheDokument();

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("dokumente")}</h2>
      {dokumente.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t("keine_dokumente")}</p>
      ) : (
        <ul className="divide-y divide-text-tertiary/10">
          {dokumente.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-secondary">
                {t(`dokument_typ_${d.typ}`)}
              </span>
              {d.datei_url ? (
                <a
                  href={d.datei_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ca hover:underline"
                >
                  {d.titel}
                </a>
              ) : (
                <span className="font-medium">{d.titel}</span>
              )}
              <Frist dokument={d} />
              {d.notiz && <span className="text-xs text-text-secondary">· {d.notiz}</span>}
              {schreibbar && (
                <button
                  type="button"
                  disabled={loeschen.isPending}
                  onClick={() => loeschen.mutate(d.id)}
                  aria-label={t("dokument_entfernen", { name: d.titel })}
                  className="ml-auto text-xs text-status-dangerText hover:underline"
                >
                  {t("entfernen")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {loeschen.isError && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(loeschen.error, t("fehler_aktion"))}
        </p>
      )}
      {schreibbar && <Hochladen partnerId={partnerId} />}
    </section>
  );
}
