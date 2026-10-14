/**
 * Regionen-Struktur (Release 26, nur App Admin) : Regionen anlegen/umbenennen, Bundesländer
 * zuordnen (ein Land gehört genau einer Region ; Zuordnung verschiebt es aus der alten Region),
 * Standorte pflegen. Verantwortliche und Seiteninhalte pflegt man auf der Regionsseite selbst.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  useLaenderSetzen,
  useRegionAendern,
  useRegionAnlegen,
  useRegionLoeschen,
  useStandortAnlegen,
  useStandortLoeschen,
  useVerwaltung,
} from "../../hooks/useRegionen";
import type { Verwaltung, VerwaltungRegion } from "../../types/regionen";
import { extractApiErrorMessage } from "../../utils/apiError";

const FELD =
  "rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";

function RegionKarte({
  region,
  laender,
  onFehler,
}: {
  region: VerwaltungRegion;
  laender: Verwaltung["laender"];
  onFehler: (text: string | null) => void;
}) {
  const { t } = useTranslation("regionen");
  const aendern = useRegionAendern();
  const loeschen = useRegionLoeschen();
  const laenderSetzen = useLaenderSetzen();
  const standortAnlegen = useStandortAnlegen();
  const standortLoeschen = useStandortLoeschen();
  const [name, setName] = useState(region.name);
  const [farbe, setFarbe] = useState(region.farbe);
  const [standortName, setStandortName] = useState("");

  const bei = (err: unknown) => onFehler(extractApiErrorMessage(err, t("fehler_speichern")));

  function sichern() {
    onFehler(null);
    aendern.mutate({ id: region.id, daten: { name: name.trim(), farbe } }, { onError: bei });
  }

  function landUmschalten(code: string) {
    onFehler(null);
    const neu = region.laender.includes(code)
      ? region.laender.filter((c) => c !== code)
      : [...region.laender, code];
    laenderSetzen.mutate({ id: region.id, laender: neu }, { onError: bei });
  }

  function standortHinzufuegen(e: FormEvent) {
    e.preventDefault();
    if (!standortName.trim()) return;
    onFehler(null);
    standortAnlegen.mutate(
      { regionId: region.id, name: standortName.trim() },
      { onSuccess: () => setStandortName(""), onError: bei },
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-text-tertiary">
          {t("admin_name")}
          <input
            className={`${FELD} mt-1 block font-normal`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-text-tertiary">
          {t("admin_farbe")}
          <input
            type="color"
            className="mt-1 block h-9 w-14 rounded-cid border border-text-tertiary/20"
            value={farbe}
            onChange={(e) => setFarbe(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={sichern}
          disabled={aendern.isPending || !name.trim()}
          className="rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("speichern")}
        </button>
        <label className="flex items-center gap-2 pb-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={region.aktiv}
            onChange={(e) => {
              onFehler(null);
              aendern.mutate(
                { id: region.id, daten: { aktiv: e.target.checked } },
                { onError: bei },
              );
            }}
          />
          {t("admin_aktiv")}
        </label>
        <Link
          to={`/regionen/${region.slug}`}
          className="pb-2 text-sm text-text-secondary hover:underline"
        >
          {t("admin_seite_oeffnen")}
        </Link>
      </div>
      <p className="text-xs text-text-tertiary">
        {t("mitglieder_zahl", { count: region.mitglieder })} ·{" "}
        {t("verantwortliche_zahl", { count: region.verantwortliche })}
      </p>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-text-tertiary">
          {t("admin_laender")}
        </legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
          {laender.map((land) => (
            <label key={land.code} className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={region.laender.includes(land.code)}
                onChange={() => landUmschalten(land.code)}
                disabled={laenderSetzen.isPending}
              />
              {land.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-1 text-xs font-semibold text-text-tertiary">{t("standorte")}</p>
        <ul className="mb-2 flex flex-wrap gap-2">
          {region.standorte.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-1 rounded-full bg-bg-secondary px-3 py-1 text-sm text-text-secondary"
            >
              {s.name}
              <button
                type="button"
                aria-label={t("admin_standort_loeschen", { name: s.name })}
                onClick={() => {
                  onFehler(null);
                  standortLoeschen.mutate(s.id, { onError: bei });
                }}
                className="text-status-dangerText"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={standortHinzufuegen} className="flex gap-2">
          <input
            className={`${FELD} flex-1`}
            value={standortName}
            maxLength={100}
            onChange={(e) => setStandortName(e.target.value)}
            aria-label={t("admin_standort_neu")}
            placeholder={t("admin_standort_neu")}
          />
          <button
            type="submit"
            disabled={!standortName.trim() || standortAnlegen.isPending}
            className="rounded-cid px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
          >
            {t("admin_hinzufuegen")}
          </button>
        </form>
      </div>

      <div>
        <button
          type="button"
          onClick={() => {
            onFehler(null);
            loeschen.mutate(region.id, { onError: bei });
          }}
          disabled={loeschen.isPending}
          className="rounded-cid px-3 py-1.5 text-xs font-semibold text-status-dangerText hover:bg-status-dangerBg disabled:opacity-50"
        >
          {t("admin_region_loeschen")}
        </button>
      </div>
    </li>
  );
}

export default function AdminRegionenPage() {
  const { t } = useTranslation("regionen");
  const { data, isLoading, isError } = useVerwaltung();
  const anlegen = useRegionAnlegen();
  const [neuerName, setNeuerName] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  function regionAnlegen(e: FormEvent) {
    e.preventDefault();
    if (!neuerName.trim()) return;
    setFehler(null);
    anlegen.mutate(
      { name: neuerName.trim() },
      {
        onSuccess: () => setNeuerName(""),
        onError: (err) => setFehler(extractApiErrorMessage(err, t("fehler_speichern"))),
      },
    );
  }

  const ohne = data
    ? data.ohne_region.map((c) => data.laender.find((l) => l.code === c)?.name ?? c)
    : [];

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("admin_titel")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("admin_einleitung")}</p>

      {fehler && <p className="mb-3 text-sm text-status-dangerText">{fehler}</p>}
      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}

      {data && ohne.length > 0 && (
        <p className="mb-4 rounded-cid bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
          {t("admin_ohne_region", { laender: ohne.join(", ") })}
        </p>
      )}

      <form onSubmit={regionAnlegen} className="mb-4 flex gap-2">
        <input
          className={`${FELD} flex-1`}
          value={neuerName}
          maxLength={80}
          onChange={(e) => setNeuerName(e.target.value)}
          aria-label={t("admin_region_neu")}
          placeholder={t("admin_region_neu")}
        />
        <button
          type="submit"
          disabled={!neuerName.trim() || anlegen.isPending}
          className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("admin_anlegen")}
        </button>
      </form>

      {data && (
        <ul className="flex flex-col gap-4">
          {data.ergebnisse.map((r) => (
            <RegionKarte key={r.id} region={r} laender={data.laender} onFehler={setFehler} />
          ))}
        </ul>
      )}
    </div>
  );
}
