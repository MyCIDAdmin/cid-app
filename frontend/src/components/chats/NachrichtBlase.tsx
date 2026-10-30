/** Eine Nachricht im Verlauf : Text, GIF, Umfrage, Treffpunkt oder Systemzeile — mit Antwort-Zitat,
 * Reaktionen, Lesehäkchen, Uhrzeit und einer Leiste (Reaktion, Herz, Antworten, Übersetzen,
 * Anheften, Löschen), die beim Darüberfahren oder Antippen erscheint. */
import { useState } from "react";
import {
  IconArrowBackUp,
  IconCheck,
  IconChecks,
  IconClock,
  IconHeart,
  IconHeartFilled,
  IconLanguage,
  IconMapPin,
  IconPin,
  IconPinnedOff,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { useUebersetzen } from "../../hooks/useChats";
import type { ChatDienste, ChatNachricht } from "../../types/chats";
import type { GifDaten, TreffpunktDaten, UmfrageDaten } from "../../types/communaute";
import { SCHNELL_REAKTIONEN, langDatum, uhrzeit } from "../../utils/chatsDesign";

export interface BlasenAktionen {
  onAntworten: (n: ChatNachricht) => void;
  onLike: (id: string) => void;
  onReagieren: (id: string, emoji: string) => void;
  onAnheften: (id: string) => void;
  onLoeschen: (id: string) => void;
  onAbstimmen: (id: string, option: number) => void;
}

interface Props extends BlasenAktionen {
  nachricht: ChatNachricht;
  direkt: boolean;
  dienste: ChatDienste | undefined;
  hervorgehoben?: boolean;
}

/** Mentions „@Name“ werden hervorgehoben (nur Darstellung, wie bisher). */
function MitErwaehnungen({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@\w+)/g).map((teil, i) =>
        teil.startsWith("@") ? (
          <span key={i} className="font-semibold underline decoration-dotted">
            {teil}
          </span>
        ) : (
          <span key={i}>{teil}</span>
        ),
      )}
    </>
  );
}

const nurHttps = (url: string) => /^https:\/\//i.test(url);

function UmfrageKarte({
  n,
  direkt,
  onAbstimmen,
}: {
  n: ChatNachricht;
  direkt: boolean;
  onAbstimmen: Props["onAbstimmen"];
}) {
  const { t, i18n } = useTranslation("communaute");
  const d = n.daten as UmfrageDaten;
  const u = n.umfrage;
  const gesamt = u?.gesamt ?? 0;
  const beendet = u?.beendet ?? false;
  return (
    <div
      data-testid="umfrage"
      className="w-[min(320px,100%)] rounded-cid-lg border border-text-tertiary/20 bg-bg-primary p-3 text-text-primary"
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
        {t("chats.umfrage")}
      </p>
      <p className="mb-2 mt-0.5 text-sm font-bold">{d.frage}</p>
      <ul className="space-y-1.5">
        {d.optionen.map((o, i) => {
          const anzahl = u?.zaehler[i] ?? 0;
          const prozent = gesamt > 0 ? Math.round((anzahl / gesamt) * 100) : 0;
          const meine = u?.meine === i;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={beendet || direkt}
                aria-pressed={meine}
                onClick={() => onAbstimmen(n.id, i)}
                className={`relative flex min-h-[40px] w-full items-center justify-between gap-2 overflow-hidden rounded-cid border px-3 py-1.5 text-left text-sm disabled:cursor-default ${
                  meine ? "border-ca font-semibold" : "border-text-tertiary/25"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-cal"
                  style={{ width: `${prozent}%` }}
                />
                <span className="relative">{o}</span>
                <span className="relative shrink-0 text-xs text-text-secondary">
                  {anzahl} · {prozent}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-text-tertiary">
        {t("chats.stimmen", { count: gesamt })}
        {d.frist && (
          <>
            {" · "}
            <IconClock size={12} aria-hidden="true" />
            {beendet
              ? t("chats.umfrage_beendet")
              : t("chats.umfrage_bis", { datum: langDatum(d.frist, i18n.language) })}
          </>
        )}
      </p>
    </div>
  );
}

function TreffpunktKarte({ daten }: { daten: TreffpunktDaten }) {
  const { t } = useTranslation("communaute");
  return (
    <div
      data-testid="treffpunkt"
      className="w-[min(320px,100%)] rounded-cid-lg border border-text-tertiary/20 bg-bg-primary p-3 text-text-primary"
    >
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
        <IconMapPin size={13} aria-hidden="true" />
        {t("chats.treffpunkt")}
      </p>
      <p className="mt-0.5 text-sm font-bold">{daten.ort}</p>
      {daten.zeit && <p className="text-sm text-text-secondary">{daten.zeit}</p>}
      {daten.link && nurHttps(daten.link) && (
        <a
          href={daten.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-sm font-semibold text-ca hover:underline"
        >
          {t("chats.karte_oeffnen")}
        </a>
      )}
    </div>
  );
}

export default function NachrichtBlase(props: Props) {
  const { nachricht: n, direkt, dienste, hervorgehoben } = props;
  const { t, i18n } = useTranslation("communaute");
  const [offen, setOffen] = useState(false);
  const [uebersetzt, setUebersetzt] = useState<string | null>(null);
  const uebersetzen = useUebersetzen();

  if (n.art === "system") {
    return (
      <p
        data-testid="system-zeile"
        className="mx-auto my-1 max-w-[90%] rounded-full bg-bg-secondary px-3 py-1 text-center text-xs text-text-tertiary"
      >
        {n.text}
      </p>
    );
  }

  const ziel: "de" | "fr" = i18n.language.startsWith("fr") ? "fr" : "de";
  const eigen = n.ich;
  const gif = n.art === "gif" ? (n.daten as GifDaten) : null;
  const farbig = n.art === "text";

  function uebersetze() {
    if (uebersetzt !== null) {
      setUebersetzt(null);
      return;
    }
    uebersetzen.mutate({ text: n.text, ziel }, { onSuccess: (txt) => setUebersetzt(txt) });
  }

  const werkzeug =
    "inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-bg-secondary";

  return (
    <div
      id={`nachricht-${n.id}`}
      data-testid={`nachricht-${n.id}`}
      className={`group relative flex flex-col ${eigen ? "items-end" : "items-start"} ${
        hervorgehoben ? "rounded-cid-lg bg-status-warningBg/40" : ""
      }`}
    >
      {!eigen && !direkt && n.vonName && (
        <p className="mb-0.5 px-1 text-[11px] font-bold text-text-tertiary">{n.vonName}</p>
      )}

      <div className="relative max-w-[85%] sm:max-w-[70%]">
        <div
          role="toolbar"
          aria-label={t("chats.aktionen")}
          className={`absolute -top-9 z-10 flex items-center gap-0.5 rounded-full border border-text-tertiary/20 bg-bg-primary px-1 shadow-md ${
            eigen ? "right-0" : "left-0"
          } ${offen ? "flex" : "hidden group-focus-within:flex group-hover:flex"}`}
        >
          {SCHNELL_REAKTIONEN.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={t("chats.reagieren_mit", { emoji: e })}
              onClick={() => props.onReagieren(n.id, e)}
              className={`${werkzeug} text-base`}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            aria-label={t("chats.liken")}
            aria-pressed={n.jaime}
            onClick={() => props.onLike(n.id)}
            className={werkzeug}
          >
            {n.jaime ? (
              <IconHeartFilled size={16} className="text-status-dangerText" />
            ) : (
              <IconHeart size={16} />
            )}
          </button>
          <button
            type="button"
            aria-label={t("chats.antworten")}
            onClick={() => props.onAntworten(n)}
            className={werkzeug}
          >
            <IconArrowBackUp size={16} />
          </button>
          {dienste?.uebersetzung && n.art === "text" && (
            <button
              type="button"
              aria-label={t("chats.uebersetzen")}
              aria-pressed={uebersetzt !== null}
              onClick={uebersetze}
              className={werkzeug}
            >
              <IconLanguage size={16} />
            </button>
          )}
          <button
            type="button"
            aria-label={n.angeheftet ? t("chats.loesen") : t("chats.anheften")}
            onClick={() => props.onAnheften(n.id)}
            className={werkzeug}
          >
            {n.angeheftet ? <IconPinnedOff size={16} /> : <IconPin size={16} />}
          </button>
          {eigen && (
            <button
              type="button"
              aria-label={t("chats.loeschen")}
              onClick={() => props.onLoeschen(n.id)}
              className={`${werkzeug} hover:text-status-dangerText`}
            >
              <IconTrash size={16} />
            </button>
          )}
        </div>

        <div
          onClick={() => setOffen((o) => !o)}
          className={
            farbig
              ? `rounded-[18px] px-3 py-2 text-sm ${
                  eigen
                    ? "rounded-br-md bg-ca text-white"
                    : "rounded-bl-md bg-bg-secondary text-text-primary"
                }`
              : ""
          }
        >
          {n.antwort && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                document
                  .getElementById(`nachricht-${n.antwort?.id}`)
                  ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
              }}
              className={`mb-1 block w-full truncate rounded border-l-2 px-2 py-0.5 text-left text-[11px] ${
                farbig && eigen
                  ? "border-white/60 bg-white/15 text-white/90"
                  : "border-ca bg-bg-tertiary text-text-secondary"
              }`}
            >
              <b>{n.antwort.name || t("chats.du")}</b> · {n.antwort.text}
            </button>
          )}

          {n.art === "text" && (
            <p className="whitespace-pre-wrap break-words">
              <MitErwaehnungen text={n.text} />
            </p>
          )}
          {gif && nurHttps(gif.url) && (
            <img
              src={gif.url}
              alt={gif.titel || t("chats.gif")}
              loading="lazy"
              className="max-h-56 max-w-full rounded-cid-lg"
            />
          )}
          {n.art === "umfrage" && (
            <UmfrageKarte n={n} direkt={direkt} onAbstimmen={props.onAbstimmen} />
          )}
          {n.art === "treffpunkt" && <TreffpunktKarte daten={n.daten as TreffpunktDaten} />}

          {uebersetzt !== null && (
            <p
              data-testid="uebersetzung"
              className={`mt-1 border-t pt-1 text-[13px] italic ${
                eigen ? "border-white/30" : "border-text-tertiary/25"
              }`}
            >
              {uebersetzt}
            </p>
          )}
          {uebersetzen.isError && (
            <p className="mt-1 text-[11px] text-status-dangerText">
              {t("chats.uebersetzen_fehler")}
            </p>
          )}
        </div>
      </div>

      {n.reaktionen.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {n.reaktionen.map((r) => (
            <button
              key={r.emoji}
              type="button"
              aria-pressed={r.ich}
              aria-label={t("chats.reaktion_aria", { emoji: r.emoji, count: r.anzahl })}
              onClick={() => props.onReagieren(n.id, r.emoji)}
              className="inline-flex items-center gap-1 rounded-full border border-text-tertiary/25 bg-bg-primary px-2 py-0.5 text-xs aria-pressed:border-ca aria-pressed:bg-cal"
            >
              <span>{r.emoji}</span>
              <span className="font-semibold text-text-secondary">{r.anzahl}</span>
            </button>
          ))}
        </div>
      )}

      <p className="mt-0.5 flex items-center gap-1.5 px-1 text-[10px] text-text-tertiary">
        {n.angeheftet && <IconPin size={11} aria-label={t("chats.angeheftet_marke")} />}
        {n.likes > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <IconHeartFilled size={10} className="text-status-dangerText" aria-hidden="true" />
            {n.likes}
          </span>
        )}
        <time dateTime={n.zeit} title={langDatum(n.zeit, i18n.language)}>
          {uhrzeit(n.zeit, i18n.language)}
        </time>
        {direkt &&
          eigen &&
          (n.gelesen ? (
            <IconChecks size={13} className="text-ca" aria-label={t("chats.gelesen")} />
          ) : (
            <IconCheck size={13} aria-label={t("chats.gesendet")} />
          ))}
      </p>
    </div>
  );
}
