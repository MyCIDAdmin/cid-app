import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAendernKategorie,
  useCreerKategorie,
  usePartnerKategorien,
} from "../../hooks/usePartner";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";

/** Kategorien pflegen: anlegen, umbenennen (DE/FR), (de)aktivieren — nie löschen. */
export default function KategorienPanel() {
  const { t } = useTranslation("partner");
  const { data } = usePartnerKategorien();
  const anlegen = useCreerKategorie();
  const aendern = useAendernKategorie();
  const [nom, setNom] = useState("");
  const [nomFr, setNomFr] = useState("");

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    anlegen.mutate(
      { nom, nom_fr: nomFr },
      {
        onSuccess: () => {
          setNom("");
          setNomFr("");
        },
      },
    );
  }

  return (
    <section className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("kategorien_verwalten")}</h2>
      <ul className="mb-3 divide-y divide-text-tertiary/10">
        {(data ?? []).map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
            <span className={k.actif ? "" : "text-text-tertiary line-through"}>{k.nom}</span>
            {k.nom_fr && <span className="text-xs text-text-tertiary">/ {k.nom_fr}</span>}
            <span className="text-xs text-text-tertiary">({k.anzahl ?? 0})</span>
            <button
              type="button"
              disabled={aendern.isPending}
              onClick={() => aendern.mutate({ id: k.id, daten: { actif: !k.actif } })}
              className="ml-auto text-xs text-ca hover:underline"
            >
              {k.actif ? t("deaktivieren") : t("aktivieren")}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={absenden} className="flex flex-wrap items-end gap-2">
        <div>
          <label
            htmlFor="kategorie-nom"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("kategorie_nom_de")}
          </label>
          <input
            id="kategorie-nom"
            value={nom}
            required
            maxLength={100}
            onChange={(e) => setNom(e.target.value)}
            className={FELD}
          />
        </div>
        <div>
          <label
            htmlFor="kategorie-nom-fr"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("kategorie_nom_fr")}
          </label>
          <input
            id="kategorie-nom-fr"
            value={nomFr}
            maxLength={100}
            onChange={(e) => setNomFr(e.target.value)}
            className={FELD}
          />
        </div>
        <button
          type="submit"
          disabled={anlegen.isPending || !nom.trim()}
          className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {t("kategorie_anlegen")}
        </button>
      </form>
      {(anlegen.isError || aendern.isError) && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(anlegen.error ?? aendern.error, t("fehler_aktion"))}
        </p>
      )}
    </section>
  );
}
