import { IconPlane, IconUsersGroup } from "@tabler/icons-react";

import type { ChatArt } from "../../types/chats";
import { avatarFarbe, initialen } from "../../utils/chatsDesign";

const GROESSE = { sm: "h-8 w-8 text-[10px]", md: "h-11 w-11 text-xs", lg: "h-16 w-16 text-base" };

interface Props {
  name: string;
  art?: ChatArt;
  photo?: string | null;
  /** true = grüner Punkt ; undefined/null = keiner. */
  online?: boolean | null;
  groesse?: keyof typeof GROESSE;
}

/** Runder Avatar : Foto oder Initialen (Person), Flugzeug (Reise), Gruppe. */
export default function ChatAvatar({ name, art = "direkt", photo, online, groesse = "md" }: Props) {
  const rund = art === "direkt" ? "rounded-full" : "rounded-cid-lg";
  const basis = `relative inline-flex shrink-0 items-center justify-center font-bold text-white ${GROESSE[groesse]} ${rund}`;
  let inhalt;
  let farbe = avatarFarbe(name);
  if (art === "reise") {
    farbe = "bg-gradient-to-br from-[#c2410c] to-[#6a0609]";
    inhalt = <IconPlane size={groesse === "lg" ? 28 : 20} aria-hidden="true" />;
  } else if (photo) {
    inhalt = <img src={photo} alt="" className={`h-full w-full object-cover ${rund}`} />;
  } else if (art === "gruppe") {
    inhalt = initialen(name) || <IconUsersGroup size={20} aria-hidden="true" />;
  } else {
    inhalt = initialen(name);
  }
  return (
    <span className={`${basis} ${farbe}`} aria-hidden="true">
      {inhalt}
      {online && (
        <span
          data-testid="online-punkt"
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-bg-primary bg-status-successText"
        />
      )}
    </span>
  );
}
