import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useBeitraege, useBeitragAnlegen } from "../../hooks/useRegionen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { klartext } from "../../utils/formattext";
import RichTextEditor from "../ui/RichTextEditor";
import BeitragKarte from "./BeitragKarte";

const SEITE = 10;
const FELD =
  "w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";

/** Beiträge der Regionsseite : lesen und reagieren für alle Konten, schreiben für Verantwortliche. */
export default function BeitraegeBereich({
  slug,
  darfSchreiben,
}: {
  slug: string;
  darfSchreiben: boolean;
}) {
  const { t } = useTranslation("regionen");
  const [limit, setLimit] = useState(SEITE);
  const { data, isLoading, isError } = useBeitraege(slug, limit);
  const anlegen = useBeitragAnlegen();
  const bildEingabe = useRef<HTMLInputElement | null>(null);

  const [titel, setTitel] = useState("");
  const [text, setText] = useState("");
  const [bild, setBild] = useState<File | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  function senden(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim() || !klartext(text)) return;
    setFehler(null);
    anlegen.mutate(
      { slug, titel: titel.trim(), text: text.trim(), bild },
      {
        onSuccess: () => {
          setTitel("");
          setText("");
          setBild(null);
          if (bildEingabe.current) bildEingabe.current.value = "";
        },
        onError: (err) => setFehler(extractApiErrorMessage(err, t("fehler_speichern"))),
      },
    );
  }

  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-text-primary">{t("beitraege")}</h2>

      {darfSchreiben && (
        <form
          onSubmit={senden}
          className="mb-4 flex flex-col gap-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
        >
          <input
            className={FELD}
            aria-label={t("beitrag_titel")}
            placeholder={t("beitrag_titel")}
            value={titel}
            maxLength={150}
            onChange={(e) => setTitel(e.target.value)}
          />
          <RichTextEditor
            value={text}
            onChange={setText}
            ariaLabel={t("beitrag_text")}
            placeholder={t("beitrag_text")}
          />
          <input
            ref={bildEingabe}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={t("beitrag_bild_waehlen")}
            onChange={(e) => setBild(e.target.files?.[0] ?? null)}
            className="text-xs text-text-primary"
          />
          {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
          <div>
            <button
              type="submit"
              disabled={!titel.trim() || !klartext(text) || anlegen.isPending}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("beitrag_veroeffentlichen")}
            </button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fehler_beitraege")}</p>}
      {data && data.ergebnisse.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("keine_beitraege")}</p>
      )}
      {data && data.ergebnisse.length > 0 && (
        <ul className="flex flex-col gap-4">
          {data.ergebnisse.map((b) => (
            <BeitragKarte key={b.id} slug={slug} beitrag={b} />
          ))}
        </ul>
      )}
      {data && data.gesamt > data.ergebnisse.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + SEITE)}
          className="mt-3 rounded-cid px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
        >
          {t("mehr_beitraege")}
        </button>
      )}
    </section>
  );
}
