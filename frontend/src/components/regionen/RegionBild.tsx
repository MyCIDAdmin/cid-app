import type { Region } from "../../types/regionen";

/** Banner der Region, sonst eine Fläche in der Regionsfarbe (kein Bild nötig). */
export default function RegionBild({
  region,
  hoehe = "h-28",
}: {
  region: Pick<Region, "banner_url" | "farbe">;
  hoehe?: string;
}) {
  if (region.banner_url) {
    return (
      <img
        src={region.banner_url}
        alt=""
        className={`${hoehe} w-full rounded-t-cid-lg object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${hoehe} w-full rounded-t-cid-lg`}
      style={{ backgroundColor: region.farbe }}
    />
  );
}
