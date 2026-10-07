import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useLoescheVerknuepfung, useVerknuepfen, useZiele } from "../../hooks/usePartner";
import {
  VERKNUEPFUNG_ROLLEN,
  type PartnerVerknuepfung,
  type VerknuepfungRolle,
  type ZielTyp,
} from "../../types/partner";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const ZIEL_TYPEN: ZielTyp[] = ["projet", "evenement", "produit"];
/** Detailseite des Ziels in der Verwaltung (Veranstaltungen und Produkte haben keine eigene Detailroute). */
const ZIEL_LINK: Record<ZielTyp, (id: string) => string> = {
  projet: (id) => `/projets/${id}`,
  evenement: () => "/evenements",
  produit: () => "/admin/boutique",
};

interface Props {
  partnerId: string;
  verknuepfungen: PartnerVerknuepfung[];
  schreibbar: boolean;
}

function NeueVerknuepfung({ partnerId }: { partnerId: string }) {
  const { t } = useTranslation("partner");
  const [typ, setTyp] = useState<ZielTyp>("projet");
  const [suche, setSuche] = useState("");
  const [zielId, setZielId] = useState("");
  const [rolle, setRolle] = useState<VerknuepfungRolle>("lieferant");
  const [notiz, setNotiz] = useState("");
  const ziele = useZiele(typ, suche);
  const verknuepfen = useVerknuepfen(partnerId);

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    verknuepfen.mutate(
      { ziel_typ: typ, ziel_id: zielId, rolle, notiz },
      {
        onSuccess: () => {
          setZielId("");
          setNotiz("");
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
        <label
          htmlFor="verknuepfung-typ"
          className="mb-1 block text-[10px] uppercase text-text-tertiary"
        >
          {t("verknuepfung_ziel_typ")}
        </label>
        <select
          id="verknuepfung-typ"
          value={typ}
          onChange={(e) => {
            setTyp(e.target.value as ZielTyp);
            setZielId("");
          }}
          className={`${FELD} w-full`}
        >
          {ZIEL_TYPEN.map((z) => (
            <option key={z} value={z}>
              {t(`ziel_${z}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor="verknuepfung-rolle"
          className="mb-1 block text-[10px] uppercase text-text-tertiary"
        >
          {t("verknuepfung_rolle")}
        </label>
        <select
          id="verknuepfung-rolle"
          value={rolle}
          onChange={(e) => setRolle(e.target.value as VerknuepfungRolle)}
          className={`${FELD} w-full`}
        >
          {VERKNUEPFUNG_ROLLEN.map((r) => (
            <option key={r} value={r}>
              {t(`rolle_${r}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor="verknuepfung-suche"
          className="mb-1 block text-[10px] uppercase text-text-tertiary"
        >
          {t("verknuepfung_suche")}
        </label>
        <input
          id="verknuepfung-suche"
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className={`${FELD} w-full`}
        />
      </div>
      <div>
        <label
          htmlFor="verknuepfung-ziel"
          className="mb-1 block text-[10px] uppercase text-text-tertiary"
        >
          {t("verknuepfung_ziel")}
        </label>
        <select
          id="verknuepfung-ziel"
          value={zielId}
          required
          onChange={(e) => setZielId(e.target.value)}
          className={`${FELD} w-full`}
        >
          <option value="">{t("verknuepfung_waehlen")}</option>
          {(ziele.data ?? []).map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label
          htmlFor="verknuepfung-notiz"
          className="mb-1 block text-[10px] uppercase text-text-tertiary"
        >
          {t("verknuepfung_notiz")}
        </label>
        <input
          id="verknuepfung-notiz"
          type="text"
          maxLength={300}
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          className={`${FELD} w-full`}
        />
      </div>
      {verknuepfen.isError && (
        <p className="text-xs text-status-dangerText sm:col-span-2">
          {extractApiErrorMessage(verknuepfen.error, t("fehler_aktion"))}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={verknuepfen.isPending || !zielId}
          className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {t("verknuepfen")}
        </button>
      </div>
    </form>
  );
}

export default function VerknuepfungenPanel({ partnerId, verknuepfungen, schreibbar }: Props) {
  const { t } = useTranslation("partner");
  const loeschen = useLoescheVerknuepfung();

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("verknuepfungen")}</h2>
      {verknuepfungen.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t("keine_verknuepfungen")}</p>
      ) : (
        <ul className="divide-y divide-text-tertiary/10">
          {verknuepfungen.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-secondary">
                {t(`ziel_${v.ziel_typ}`)}
              </span>
              {v.ziel_id ? (
                <Link
                  to={ZIEL_LINK[v.ziel_typ](v.ziel_id)}
                  className="font-medium text-ca hover:underline"
                >
                  {v.ziel_label}
                </Link>
              ) : (
                <span className="font-medium">{v.ziel_label}</span>
              )}
              <span className="text-xs text-text-tertiary">{t(`rolle_${v.rolle}`)}</span>
              {v.notiz && <span className="text-xs text-text-secondary">· {v.notiz}</span>}
              {schreibbar && (
                <button
                  type="button"
                  disabled={loeschen.isPending}
                  onClick={() => loeschen.mutate(v.id)}
                  aria-label={t("verknuepfung_entfernen", { name: v.ziel_label })}
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
      {schreibbar && <NeueVerknuepfung partnerId={partnerId} />}
    </section>
  );
}
