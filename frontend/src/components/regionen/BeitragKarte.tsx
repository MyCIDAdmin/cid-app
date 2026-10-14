import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  useBeitragAendern,
  useBeitragAusblenden,
  useBeitragBildEntfernen,
  useBeitragBildHochladen,
  useBeitragLoeschen,
  useReaktionSetzen,
} from "../../hooks/useRegionen";
import type { Beitrag } from "../../types/regionen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { REAKTIONS_EMOJI } from "../../utils/regionen";

const FELD =
  "w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";

export default function BeitragKarte({ slug, beitrag }: { slug: string; beitrag: Beitrag }) {
  const { t, i18n } = useTranslation("regionen");
  const reagieren = useReaktionSetzen();
  const aendern = useBeitragAendern();
  const loeschen = useBeitragLoeschen();
  const bildHoch = useBeitragBildHochladen();
  const bildWeg = useBeitragBildEntfernen();
  const ausblenden = useBeitragAusblenden();

  const [bearbeiten, setBearbeiten] = useState(false);
  const [titel, setTitel] = useState(beitrag.titel);
  const [text, setText] = useState(beitrag.text);
  const [grundOffen, setGrundOffen] = useState(false);
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const bei = (err: unknown) => setFehler(extractApiErrorMessage(err, t("fehler_speichern")));
  const datum = new Date(beitrag.created_at).toLocaleDateString(i18n.language);

  function sichern() {
    setFehler(null);
    aendern.mutate(
      { slug, id: beitrag.id, titel, text },
      { onSuccess: () => setBearbeiten(false), onError: bei },
    );
  }

  function bildGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setFehler(null);
    bildHoch.mutate({ slug, id: beitrag.id, datei }, { onError: bei });
    e.target.value = "";
  }

  function ausblendenSenden() {
    setFehler(null);
    ausblenden.mutate(
      { slug, id: beitrag.id, ausgeblendet: true, grund: grund.trim() },
      {
        onSuccess: () => {
          setGrundOffen(false);
          setGrund("");
        },
        onError: bei,
      },
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      {beitrag.ausgeblendet && (
        <p className="rounded-cid bg-status-dangerBg px-3 py-2 text-xs text-status-dangerText">
          {t("beitrag_ausgeblendet")}
          {beitrag.ausgeblendet_grund && `: ${beitrag.ausgeblendet_grund}`}
        </p>
      )}

      {!bearbeiten && (
        <div>
          <h3 className="text-base font-semibold text-text-primary">{beitrag.titel}</h3>
          <p className="text-xs text-text-tertiary">
            {beitrag.autor_name ? `${beitrag.autor_name} · ` : ""}
            {datum}
          </p>
        </div>
      )}
      {bearbeiten && (
        <div className="flex flex-col gap-2">
          <input
            className={FELD}
            aria-label={t("beitrag_titel")}
            value={titel}
            maxLength={150}
            onChange={(e) => setTitel(e.target.value)}
          />
          <textarea
            className={FELD}
            aria-label={t("beitrag_text")}
            rows={6}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={sichern}
              disabled={aendern.isPending || !titel.trim() || !text.trim()}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("speichern")}
            </button>
            <button
              type="button"
              onClick={() => setBearbeiten(false)}
              className="rounded-cid px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
            >
              {t("abbrechen")}
            </button>
          </div>
        </div>
      )}

      {beitrag.bild_url && (
        <img src={beitrag.bild_url} alt="" className="max-h-80 w-full rounded-cid object-cover" />
      )}
      {!bearbeiten && (
        <p className="whitespace-pre-line text-sm text-text-secondary">{beitrag.text}</p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("reaktionen")}>
        {beitrag.reaktionen.map((r) => (
          <button
            key={r.art}
            type="button"
            aria-pressed={r.meine}
            aria-label={t(`reaktion_${r.art}`)}
            disabled={reagieren.isPending}
            onClick={() => {
              setFehler(null);
              reagieren.mutate(
                { slug, id: beitrag.id, art: r.art, aktiv: !r.meine },
                { onError: bei },
              );
            }}
            className={`rounded-full border px-3 py-1 text-sm ${
              r.meine
                ? "border-ca bg-bg-secondary font-semibold text-text-primary"
                : "border-text-tertiary/20 text-text-secondary hover:bg-bg-secondary"
            }`}
          >
            <span aria-hidden="true">{REAKTIONS_EMOJI[r.art]}</span>
            {r.anzahl > 0 && <span className="ml-1 tabular-nums">{r.anzahl}</span>}
          </button>
        ))}
      </div>

      {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}

      {(beitrag.darf_bearbeiten || beitrag.darf_ausblenden) && !bearbeiten && (
        <div className="flex flex-wrap items-center gap-2 border-t border-text-tertiary/10 pt-3">
          {beitrag.darf_bearbeiten && (
            <>
              <button
                type="button"
                onClick={() => setBearbeiten(true)}
                className="rounded-cid px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
              >
                {t("beitrag_bearbeiten")}
              </button>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={t("beitrag_bild_waehlen")}
                onChange={bildGewaehlt}
                className="text-xs text-text-primary"
              />
              {beitrag.bild_url && (
                <button
                  type="button"
                  onClick={() => bildWeg.mutate({ slug, id: beitrag.id }, { onError: bei })}
                  className="rounded-cid px-2 py-1 text-xs font-semibold text-status-dangerText hover:bg-status-dangerBg"
                >
                  {t("beitrag_bild_entfernen")}
                </button>
              )}
              <button
                type="button"
                onClick={() => loeschen.mutate({ slug, id: beitrag.id }, { onError: bei })}
                disabled={loeschen.isPending}
                className="rounded-cid px-3 py-1.5 text-xs font-semibold text-status-dangerText hover:bg-status-dangerBg disabled:opacity-50"
              >
                {t("beitrag_loeschen")}
              </button>
            </>
          )}
          {beitrag.darf_ausblenden && beitrag.ausgeblendet && (
            <button
              type="button"
              onClick={() =>
                ausblenden.mutate({ slug, id: beitrag.id, ausgeblendet: false }, { onError: bei })
              }
              className="rounded-cid px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
            >
              {t("beitrag_einblenden")}
            </button>
          )}
          {beitrag.darf_ausblenden && !beitrag.ausgeblendet && !grundOffen && (
            <button
              type="button"
              onClick={() => setGrundOffen(true)}
              className="rounded-cid px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
            >
              {t("beitrag_ausblenden")}
            </button>
          )}
        </div>
      )}

      {grundOffen && (
        <div className="flex flex-col gap-2">
          <input
            className={FELD}
            aria-label={t("beitrag_grund")}
            placeholder={t("beitrag_grund")}
            value={grund}
            maxLength={200}
            onChange={(e) => setGrund(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={ausblendenSenden}
              disabled={!grund.trim() || ausblenden.isPending}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("beitrag_ausblenden_bestaetigen")}
            </button>
            <button
              type="button"
              onClick={() => setGrundOffen(false)}
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
