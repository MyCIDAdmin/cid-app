/**
 * Identifiant d'appareil persistant pour ce navigateur (task #218, 2026-09-24 : "wenn ein
 * Benutzer sich einloggt und eine Session auf einem Gerät aufmacht, müssen alle laufende
 * Sessions im selben Gerät beendet werden") — envoyé comme `device_id` à la connexion
 * (voir api/auth.ts::login) pour que le backend révoque toute session encore active sur CE
 * MÊME appareil (apps.accounts.services.enforce_single_session_per_device). Un utilisateur
 * connecté sur plusieurs appareils différents (téléphone + ordinateur) n'est PAS affecté —
 * seul un doublon sur le même appareil l'est.
 *
 * Délibérément distinct de `device_fingerprint` (2FA "nouvel appareil" conditionnel, SCD
 * §3.3) : un identifiant STABLE généré une seule fois et persisté, pas une empreinte
 * technique du navigateur — voir LoginSerializer côté backend pour la séparation complète.
 *
 * Même stratégie de génération que panierStore.ts::genererLigneId (crypto.randomUUID avec
 * repli), mais toujours en localStorage (jamais sessionStorage, même avec "Rester connecté"
 * décoché — voir authStore.ts) : cet identifiant désigne l'appareil lui-même, pas une
 * session de connexion particulière, il doit donc survivre à la fermeture de l'onglet.
 */
const STORAGE_KEY = "cid-device-id";

function genererId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getDeviceId(): string {
  try {
    const existant = window.localStorage.getItem(STORAGE_KEY);
    if (existant) return existant;

    const id = genererId();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // Navigation privée / localStorage indisponible : pas d'identifiant stable possible.
    // Le backend traite une empreinte absente comme "impossible de déterminer l'appareil"
    // et ne révoque rien dans ce cas (voir enforce_single_session_per_device) — comportement
    // sûr par défaut plutôt qu'une erreur bloquant la connexion.
    return "";
  }
}
