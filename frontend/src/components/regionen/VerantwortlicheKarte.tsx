import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useFotoEntfernen,
  useFotoHochladen,
  useKarteLoeschen,
  useKarteSpeichern,
} from "../../hooks/useRegionen";
import type { Standort, Verantwortlicher } from "../../types/regionen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { klartext } from "../../utils/formattext";
import { anfangsbuchstaben } from "../../utils/regionen";
import RichTextEditor from "../ui/RichTextEditor";
import FormatierterText from "./FormatierterText";

interface Props {
  slug: string;
  person: Verantwortlicher;
  standorte: Standort[];
  /** Eigene Karte oder Personenverwalter : Karte darf bearbeitet werden. */
  darfBearbeiten: boolean;
  darfEntfernen: boolean;
}

const FELD =
  "w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";

export default function VerantwortlicheKarte({
  slug,
  person,
  standorte,
  darfBearbeiten,
  darfEntfernen,
}: Props) {
  const { t } = useTranslation("regionen");
  const speichern = useKarteSpeichern();
  const loeschen = useKarteLoeschen();
  const fotoHoch = useFotoHochladen();
  const fotoWeg = useFotoEntfernen();
  const fotoEingabe = useRef<HTMLInputElement | null>(null);

  const [offen, setOffen] = useState(false);
  const [name, setName] = useState(person.name);
  const [funktion, setFunktion] = useState(person.funktion);
  const [vorstellung, setVorstellung] = useState(person.vorstellung);
  const [kontakt, setKontakt] = useState(person.kontakt_email);
  const [standort, setStandort] = useState(person.standort?.id ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  const bei = (err: unknown) => setFehler(extractApiErrorMessage(err, t("fehler_speichern")));

  function sichern() {
    setFehler(null);
    speichern.mutate(
      {
        slug,
        id: person.id,
        daten: {
          name,
          funktion,
          vorstellung,
          kontakt_email: kontakt,
          standort: standort || null,
        },
      },
      { onSuccess: () => setOffen(false), onError: bei },
    );
  }

  function fotoGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setFehler(null);
    fotoHoch.mutate({ slug, id: person.id, datei }, { onError: bei });
    e.target.value = "";
  }

  function entfernen() {
    setFehler(null);
    loeschen.mutate({ slug, id: person.id }, { onError: bei });
  }

  return (
    <li className="flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {person.foto_url ? (
          <img
            src={person.foto_url}
            alt={person.name}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-lg font-semibold text-text-secondary"
          >
            {anfangsbuchstaben(person.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-text-primary">{person.name}</p>
          {person.funktion && <p className="text-sm text-text-secondary">{person.funktion}</p>}
          {person.standort && <p className="text-xs text-text-tertiary">{person.standort.name}</p>}
        </div>
      </div>

      {klartext(person.vorstellung) && <FormatierterText text={person.vorstellung} />}
      {person.kontakt_email && (
        <p className="text-sm text-text-secondary">
          {t("kontakt")}: <span className="select-all">{person.kontakt_email}</span>
        </p>
      )}

      {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}

      {darfBearbeiten && !offen && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOffen(true)}
            className="rounded-cid px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
          >
            {person.eigene ? t("karte_meine_bearbeiten") : t("karte_bearbeiten")}
          </button>
          {darfEntfernen && (
            <button
              type="button"
              onClick={entfernen}
              disabled={loeschen.isPending}
              className="rounded-cid px-3 py-1.5 text-xs font-semibold text-status-dangerText hover:bg-status-dangerBg disabled:opacity-50"
            >
              {t("karte_entfernen")}
            </button>
          )}
        </div>
      )}

      {darfBearbeiten && offen && (
        <div className="flex flex-col gap-3 border-t border-text-tertiary/10 pt-3">
          <label className="text-xs font-semibold text-text-tertiary">
            {t("feld_name")}
            <input
              className={`${FELD} mt-1 font-normal`}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-text-tertiary">
            {t("feld_funktion")}
            <input
              className={`${FELD} mt-1 font-normal`}
              value={funktion}
              maxLength={100}
              onChange={(e) => setFunktion(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-text-tertiary">
            {t("feld_standort")}
            <select
              className={`${FELD} mt-1 font-normal`}
              value={standort}
              onChange={(e) => setStandort(e.target.value)}
            >
              <option value="">{t("kein_standort")}</option>
              {standorte.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs font-semibold text-text-tertiary">
            <span className="mb-1 block">{t("feld_vorstellung")}</span>
            <RichTextEditor
              value={vorstellung}
              onChange={setVorstellung}
              ariaLabel={t("feld_vorstellung")}
            />
          </div>
          <label className="text-xs font-semibold text-text-tertiary">
            {t("feld_kontakt")}
            <input
              type="email"
              className={`${FELD} mt-1 font-normal`}
              value={kontakt}
              onChange={(e) => setKontakt(e.target.value)}
            />
            <span className="mt-1 block font-normal text-text-tertiary">
              {t("kontakt_hinweis")}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fotoEingabe}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={t("foto_waehlen")}
              onChange={fotoGewaehlt}
              className="text-xs text-text-primary"
            />
            {person.foto_url && (
              <button
                type="button"
                onClick={() => fotoWeg.mutate({ slug, id: person.id }, { onError: bei })}
                className="rounded-cid px-2 py-1 text-xs font-semibold text-status-dangerText hover:bg-status-dangerBg"
              >
                {t("foto_entfernen")}
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={sichern}
              disabled={speichern.isPending || !name.trim()}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("speichern")}
            </button>
            <button
              type="button"
              onClick={() => setOffen(false)}
              className="rounded-cid px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
            >
              {t("abbrechen")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
