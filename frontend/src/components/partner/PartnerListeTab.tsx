/**
 * Business Partner & Lieferanten (Nutzerwunsch 2026-10-07) — Liste mit Filtern (Suche, Typ,
 * Kategorie, Status, Mindestnote, bevorzugt). Lesen ab Rolle RH, Anlegen/Pflegen ab Bureau Admin
 * (gleiche Grenzen wie PartnerPermission im Backend). Partner werden archiviert, nie gelöscht.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import ImportPanel from "./ImportPanel";
import KategorienPanel from "./KategorienPanel";
import PartnerForm from "./PartnerForm";
import { Sterne } from "./Sterne";
import { useCreerPartner, usePartnerKategorien, usePartnerListe } from "../../hooks/usePartner";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { PartnerFiltre } from "../../types/partner";
import { extractApiErrorMessage } from "../../utils/apiError";
import { kategorieName } from "../../utils/partner";

const FELD = "rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";
const MIN_NOTEN = [3, 4, 4.5];

export default function PartnerListeTab() {
  const { t, i18n } = useTranslation("partner");
  const navigate = useNavigate();
  const schreibbar = hasRoleAtLeast(
    useAuthStore((s) => s.user),
    ROLE_LEVELS.bureau_admin,
  );
  const [filtre, setFiltre] = useState<PartnerFiltre>({
    q: "",
    typ: "",
    statut: "",
    kategorie: [],
    bevorzugt: false,
    min_note: null,
    ordering: "nom",
  });
  const [neu, setNeu] = useState(false);
  const [kategorienOffen, setKategorienOffen] = useState(false);
  const [importOffen, setImportOffen] = useState(false);
  const liste = usePartnerListe(filtre);
  const kategorien = usePartnerKategorien();
  const anlegen = useCreerPartner();

  function setze<K extends keyof PartnerFiltre>(k: K, v: PartnerFiltre[K]) {
    setFiltre((alt) => ({ ...alt, [k]: v }));
  }

  function kategorieUmschalten(id: string) {
    const aktuell = filtre.kategorie ?? [];
    setze("kategorie", aktuell.includes(id) ? aktuell.filter((x) => x !== id) : [...aktuell, id]);
  }

  const partner = liste.data ?? [];
  const alleKategorien = kategorien.data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-text-primary">{t("titel")}</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link
            to="/admin/partner/angebote"
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("angebotsvergleich")}
          </Link>
          {schreibbar && (
            <button
              type="button"
              onClick={() => setImportOffen((o) => !o)}
              aria-expanded={importOffen}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("aus_ausgaben_importieren")}
            </button>
          )}
        </div>
        {schreibbar && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKategorienOffen((o) => !o)}
              aria-expanded={kategorienOffen}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("kategorien_verwalten")}
            </button>
            <button
              type="button"
              onClick={() => setNeu((n) => !n)}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              {t("neuer_partner")}
            </button>
          </div>
        )}
      </div>
      <p className="mb-4 text-sm text-text-tertiary">{t("sous_titre")}</p>
      {!schreibbar && (
        <p className="mb-4 rounded-cid-lg bg-bg-tertiary px-4 py-2 text-sm text-text-secondary">
          {t("nur_lesen")}
        </p>
      )}

      {schreibbar && kategorienOffen && <KategorienPanel />}
      {schreibbar && importOffen && <ImportPanel onClose={() => setImportOffen(false)} />}

      {schreibbar && neu && (
        <section className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">{t("neuer_partner")}</h2>
          <PartnerForm
            kategorien={alleKategorien}
            pending={anlegen.isPending}
            fehler={
              anlegen.isError ? extractApiErrorMessage(anlegen.error, t("fehler_aktion")) : null
            }
            onCancel={() => setNeu(false)}
            onSubmit={(daten) =>
              anlegen.mutate(daten, {
                onSuccess: (p) => {
                  setNeu(false);
                  navigate(`/admin/partner/${p.id}`);
                },
              })
            }
          />
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="partner-suche" className={LABEL}>
            {t("suche")}
          </label>
          <input
            id="partner-suche"
            type="search"
            value={filtre.q}
            onChange={(e) => setze("q", e.target.value)}
            className={`${FELD} w-52`}
          />
        </div>
        <div>
          <label htmlFor="partner-filter-typ" className={LABEL}>
            {t("feld_typ")}
          </label>
          <select
            id="partner-filter-typ"
            value={filtre.typ}
            onChange={(e) => setze("typ", e.target.value as PartnerFiltre["typ"])}
            className={FELD}
          >
            <option value="">{t("alle")}</option>
            <option value="partner">{t("typ_partner")}</option>
            <option value="lieferant">{t("typ_lieferant")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="partner-filter-status" className={LABEL}>
            {t("status")}
          </label>
          <select
            id="partner-filter-status"
            value={filtre.statut}
            onChange={(e) => setze("statut", e.target.value as PartnerFiltre["statut"])}
            className={FELD}
          >
            <option value="">{t("status_offen")}</option>
            <option value="aktiv">{t("status_aktiv")}</option>
            <option value="inaktiv">{t("status_inaktiv")}</option>
            <option value="archiviert">{t("status_archiviert")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="partner-filter-note" className={LABEL}>
            {t("min_note")}
          </label>
          <select
            id="partner-filter-note"
            value={filtre.min_note ?? ""}
            onChange={(e) => setze("min_note", e.target.value ? Number(e.target.value) : null)}
            className={FELD}
          >
            <option value="">{t("alle")}</option>
            {MIN_NOTEN.map((n) => (
              <option key={n} value={n}>
                ★ {n}+
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="partner-sortierung" className={LABEL}>
            {t("sortierung")}
          </label>
          <select
            id="partner-sortierung"
            value={filtre.ordering}
            onChange={(e) => setze("ordering", e.target.value as PartnerFiltre["ordering"])}
            className={FELD}
          >
            <option value="nom">{t("sort_name")}</option>
            <option value="note">{t("sort_note")}</option>
            <option value="-created_at">{t("sort_neueste")}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={filtre.bevorzugt}
            onChange={(e) => setze("bevorzugt", e.target.checked)}
          />
          {t("nur_bevorzugte")}
        </label>
      </div>

      {alleKategorien.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t("feld_kategorien")}>
          {alleKategorien
            .filter((k) => k.actif || filtre.kategorie?.includes(k.id))
            .map((k) => {
              const aktiv = filtre.kategorie?.includes(k.id) ?? false;
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={aktiv}
                  onClick={() => kategorieUmschalten(k.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    aktiv
                      ? "border-brand-red bg-brand-red/10 font-medium"
                      : "border-text-tertiary/30 text-text-secondary hover:bg-bg-tertiary"
                  }`}
                >
                  {kategorieName(k, i18n.language)}
                </button>
              );
            })}
        </div>
      )}

      {liste.isLoading && <p className="text-sm text-text-tertiary">{t("laedt")}</p>}
      {liste.isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}
      {liste.data && partner.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("keine_treffer")}</p>
      )}
      {partner.length > 0 && (
        <div className="overflow-x-auto rounded-cid border border-text-tertiary/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-tertiary text-left text-xs uppercase text-text-tertiary">
                <th className="px-3 py-2">{t("feld_nom")}</th>
                <th className="px-3 py-2">{t("feld_typ")}</th>
                <th className="px-3 py-2">{t("feld_kategorien")}</th>
                <th className="px-3 py-2">{t("hauptkontakt")}</th>
                <th className="px-3 py-2">{t("feld_ville")}</th>
                <th className="px-3 py-2">{t("bewertung")}</th>
                <th className="px-3 py-2 text-right">{t("verknuepfungen")}</th>
              </tr>
            </thead>
            <tbody>
              {partner.map((p) => (
                <tr key={p.id} className="border-t border-text-tertiary/10 align-top">
                  <td className="px-3 py-2">
                    <Link
                      to={`/admin/partner/${p.id}`}
                      className="font-medium text-ca hover:underline"
                    >
                      {p.bevorzugt && (
                        <span aria-label={t("feld_bevorzugt")} title={t("feld_bevorzugt")}>
                          ★{" "}
                        </span>
                      )}
                      {p.nom}
                    </Link>
                    {p.logo_url && (
                      <img
                        src={p.logo_url}
                        alt=""
                        loading="lazy"
                        className="ml-2 inline-block h-5 max-w-[3rem] object-contain align-middle"
                      />
                    )}
                    {p.statut !== "aktiv" && (
                      <span className="ml-2 rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-tertiary">
                        {t(`status_${p.statut}`)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{t(`typ_${p.typ}`)}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">
                    {p.kategorien
                      .map((id) => alleKategorien.find((k) => k.id === id))
                      .map((k, i) => (k ? kategorieName(k, i18n.language) : p.kategorien_namen[i]))
                      .join(", ")}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-secondary">{p.hauptkontakt_name}</td>
                  <td className="px-3 py-2">{p.ville}</td>
                  <td className="px-3 py-2">
                    <Sterne wert={p.bewertung_schnitt} />
                    {p.bewertung_anzahl > 0 && (
                      <span className="ml-1 text-[11px] text-text-tertiary">
                        ({p.bewertung_anzahl})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.verknuepfungen_anzahl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
