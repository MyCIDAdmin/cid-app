/** „Neuer Chat“ : Personen wählen (eine = Direktchat, mehrere = Gruppe, standardmäßig privat) —
 * und „Gruppen entdecken“ zum Beitreten. Ersetzt das getrennte Anlegen auf zwei Seiten. */
import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import {
  useCreerConversation,
  useCreerGroupe,
  useGroupes,
  useInviterAuGroupe,
  useRechercherMembres,
  useRejoindreGroupe,
} from "../../hooks/useCommunaute";
import { useMitreisende } from "../../hooks/useChats";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";
import ChatAvatar from "./ChatAvatar";
import Dialog from "./Dialog";
import { FELD, KNOPF, KNOPF_LEISE } from "./ui";

interface Person {
  id: string;
  prenom: string;
  nom: string;
  photo?: string | null;
}

interface Props {
  start: "neu" | "entdecken";
  onClose: () => void;
  onOeffne: (kanal: "direkt" | "gruppe", id: string) => void;
}

export default function NeuerChatDialog({ start, onClose, onOeffne }: Props) {
  const { t } = useTranslation("communaute");
  const moiId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState(start);
  const [q, setQ] = useState("");
  const [gewaehlt, setGewaehlt] = useState<Person[]>([]);
  const [nom, setNom] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [privat, setPrivat] = useState(true);
  const [fehler, setFehler] = useState("");

  const suche = useRechercherMembres(q, tab === "neu");
  const mitreisende = useMitreisende(tab === "neu");
  const gruppen = useGroupes();
  const konversation = useCreerConversation();
  const neueGruppe = useCreerGroupe();
  const einladen = useInviterAuGroupe();
  const beitreten = useRejoindreGroupe();

  const ids = new Set(gewaehlt.map((p) => p.id));
  const treffer = (suche.data ?? []).filter((m) => m.id !== moiId && !ids.has(m.id)).slice(0, 8);
  const mehrere = gewaehlt.length >= 2;
  const bereit = gewaehlt.length === 1 || (mehrere && nom.trim() !== "");
  const laeuft = konversation.isPending || neueGruppe.isPending || einladen.isPending;

  const hinzu = (leute: Person[]) =>
    setGewaehlt((alt) => [
      ...alt,
      ...leute.filter((p) => p.id !== moiId && !alt.some((a) => a.id === p.id)),
    ]);

  async function starte(e: React.FormEvent) {
    e.preventDefault();
    if (!bereit) return;
    setFehler("");
    try {
      if (!mehrere) {
        const k = await konversation.mutateAsync(gewaehlt[0].id);
        onOeffne("direkt", k.id);
      } else {
        const ids2 = gewaehlt.map((p) => p.id);
        const g = await neueGruppe.mutateAsync({
          nom: nom.trim(),
          description: beschreibung.trim(),
          type_groupe: privat ? "prive" : "public",
          membres_invites: privat ? ids2 : undefined,
        });
        if (!privat) await einladen.mutateAsync({ id: g.id, membres: ids2 });
        onOeffne("gruppe", g.id);
      }
    } catch (err) {
      setFehler(extractApiErrorMessage(err, t("chats.fehler_aktion")));
    }
  }

  const reiter = (k: "neu" | "entdecken", text: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === k}
      onClick={() => setTab(k)}
      className="flex-1 border-b-2 border-transparent py-2 text-sm font-semibold text-text-secondary aria-selected:border-ca aria-selected:text-ca"
    >
      {text}
    </button>
  );

  return (
    <Dialog titel={t("chats.neuer_chat")} onClose={onClose} breit>
      <div role="tablist" className="flex px-4">
        {reiter("neu", t("chats.tab_neu"))}
        {reiter("entdecken", t("chats.gruppen_entdecken"))}
      </div>

      {tab === "neu" ? (
        <form onSubmit={starte} className="space-y-3 overflow-y-auto p-4">
          {gewaehlt.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label={t("chats.ausgewaehlt")}>
              {gewaehlt.map((p) => (
                <li
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-full bg-cal py-1 pl-3 pr-1 text-xs font-semibold text-cad"
                >
                  {p.prenom} {p.nom}
                  <button
                    type="button"
                    aria-label={t("chats.entfernen_person", { name: `${p.prenom} ${p.nom}` })}
                    onClick={() => setGewaehlt((alt) => alt.filter((a) => a.id !== p.id))}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/60"
                  >
                    <IconX size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(mitreisende.data ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(mitreisende.data ?? []).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => hinzu(r.mitglieder)}
                  className={KNOPF_LEISE}
                >
                  {t("chats.alle_mitreisenden", { titel: r.titel })}
                </button>
              ))}
            </div>
          )}

          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("chats.person_suchen")}
            aria-label={t("chats.person_suchen")}
            className={FELD}
          />
          <ul className="max-h-48 overflow-y-auto">
            {treffer.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => hinzu([m])}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-cid px-2 text-left text-sm hover:bg-bg-secondary"
                >
                  <ChatAvatar name={`${m.prenom} ${m.nom}`} photo={m.photo} groesse="sm" />
                  {m.prenom} {m.nom}
                </button>
              </li>
            ))}
            {suche.isSuccess && treffer.length === 0 && (
              <li className="p-2 text-sm text-text-tertiary">{t("chats.nichts_gefunden")}</li>
            )}
          </ul>

          {mehrere && (
            <div className="space-y-2 rounded-cid-lg bg-bg-secondary p-3">
              <p className="text-xs font-semibold text-text-secondary">
                {t("chats.gruppe_wird_angelegt")}
              </p>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder={t("chats.gruppenname")}
                aria-label={t("chats.gruppenname")}
                maxLength={120}
                className={FELD}
              />
              <input
                type="text"
                value={beschreibung}
                onChange={(e) => setBeschreibung(e.target.value)}
                placeholder={t("chats.beschreibung")}
                aria-label={t("chats.beschreibung")}
                className={FELD}
              />
              <label className="flex min-h-[40px] items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={privat}
                  onChange={(e) => setPrivat(e.target.checked)}
                  className="h-4 w-4"
                />
                {t("chats.nur_eingeladene")}
              </label>
            </div>
          )}

          {fehler && (
            <p role="alert" className="text-sm text-status-dangerText">
              {fehler}
            </p>
          )}
          <button type="submit" disabled={!bereit || laeuft} className={`${KNOPF} w-full`}>
            {mehrere ? t("chats.gruppe_anlegen") : t("chats.chat_starten")}
          </button>
        </form>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <ul className="space-y-1">
            {(gruppen.data?.results ?? []).map((g) => (
              <li key={g.id} className="flex items-center gap-3 rounded-cid-lg px-2 py-2">
                <ChatAvatar name={g.nom} art="gruppe" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-text-primary">
                    {g.nom}
                  </span>
                  <span className="block truncate text-xs text-text-tertiary">
                    {t("chats.mitglieder_anzahl", { count: g.nombre_membres })}
                    {g.type_groupe === "prive" ? ` · ${t("chats.marke_privat")}` : ""}
                  </span>
                </span>
                {g.est_membre ? (
                  <button
                    type="button"
                    onClick={() => onOeffne("gruppe", g.id)}
                    className={KNOPF_LEISE}
                  >
                    {t("chats.oeffnen")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={beitreten.isPending}
                    onClick={() =>
                      beitreten.mutate(g.id, { onSuccess: () => onOeffne("gruppe", g.id) })
                    }
                    className={KNOPF}
                  >
                    {t("chats.beitreten")}
                  </button>
                )}
              </li>
            ))}
            {gruppen.isSuccess && (gruppen.data?.results ?? []).length === 0 && (
              <li className="p-2 text-sm text-text-tertiary">{t("chats.keine_gruppen")}</li>
            )}
          </ul>
          {gruppen.isLoading && (
            <p className="p-2 text-sm text-text-tertiary">{t("chats.laden")}</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
