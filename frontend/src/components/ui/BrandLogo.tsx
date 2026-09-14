/**
 * Blason CID (fichier fourni par l'utilisateur, "Logo CID Couleur" — recadré/carré en
 * `public/brand/logo-cid-couleur.png`) — remplace l'ancien badge texte "CID" partout où
 * la marque apparaît : sidebar (en-tête, en haut à gauche de l'app) et pages d'auth
 * (connexion, inscription, mot de passe oublié/réinitialisation).
 */
export default function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <img
      src="/brand/logo-cid-couleur.png"
      alt="Clubistes in Deutschland"
      className={`shrink-0 rounded-cid bg-white object-contain ${className}`}
    />
  );
}
