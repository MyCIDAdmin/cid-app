/**
 * 2 Kacheln sous le hero de la Startseite (demande utilisateur du 2026-10-06, point 11) — GIF
 * animé ou image, titre/texte et lien optionnels, pleine largeur ou demi-largeur. Contenu géré
 * dans le module "Hero-Video" (AdminConfigurationSitePage). Une Kachel inactive ou sans média
 * n'est pas affichée.
 */
import { Link } from "react-router-dom";

import type { ConfigurationSitePublic } from "../../types/communaute";
import { istInternerPfad, sicherUrl } from "../../utils/sicherUrl";

interface Kachel {
  media: string;
  titre: string;
  texte: string;
  lien: string;
  pleine: boolean;
}

function kachelsDepuis(config: ConfigurationSitePublic): Kachel[] {
  return ([1, 2] as const)
    .map((i) => ({
      active: config[`kachel${i}_active`],
      media: config[`kachel${i}_media`],
      titre: config[`kachel${i}_titre`],
      texte: config[`kachel${i}_texte`],
      lien: config[`kachel${i}_lien`],
      pleine: config[`kachel${i}_largeur`] === "pleine",
    }))
    .filter((k): k is typeof k & { media: string } => k.active && Boolean(k.media));
}

function Contenu({ kachel }: { kachel: Kachel }) {
  return (
    <>
      <img src={kachel.media} alt={kachel.titre} className="w-full object-cover" loading="lazy" />
      {(kachel.titre || kachel.texte) && (
        <div className="p-3 text-center">
          {kachel.titre && <h3 className="text-sm font-bold text-text-primary">{kachel.titre}</h3>}
          {kachel.texte && <p className="mt-1 text-xs text-text-secondary">{kachel.texte}</p>}
        </div>
      )}
    </>
  );
}

export default function HeroKacheln({ config }: { config: ConfigurationSitePublic | undefined }) {
  if (!config) return null;
  const kacheln = kachelsDepuis(config);
  if (kacheln.length === 0) return null;
  const classe = "block overflow-hidden rounded-cid-lg bg-bg-primary shadow-card transition";
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="hero-kacheln">
      {kacheln.map((kachel, index) => {
        const span = kachel.pleine ? "md:col-span-2" : "";
        const intern = istInternerPfad(kachel.lien);
        const extern = intern ? null : sicherUrl(kachel.lien);
        if (!intern && !extern) {
          return (
            <div key={index} className={`${classe} ${span}`}>
              <Contenu kachel={kachel} />
            </div>
          );
        }
        return intern ? (
          <Link key={index} to={kachel.lien} className={`${classe} ${span} hover:shadow-lg`}>
            <Contenu kachel={kachel} />
          </Link>
        ) : (
          <a
            key={index}
            href={extern ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`${classe} ${span} hover:shadow-lg`}
          >
            <Contenu kachel={kachel} />
          </a>
        );
      })}
    </div>
  );
}
