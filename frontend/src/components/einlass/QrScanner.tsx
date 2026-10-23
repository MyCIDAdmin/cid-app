/**
 * Kamera-Scan für QR-Codes direkt im Browser. Nutzt die eingebaute `BarcodeDetector`-Erkennung,
 * wo es sie gibt (Chrome/Android), sonst jsQR auf einem Canvas-Bild. Die Kamera läuft nur, solange
 * diese Komponente eingeblendet ist. Derselbe Code wird innerhalb weniger Sekunden nur einmal
 * gemeldet.
 */
import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface ErkannterCode {
  rawValue: string;
}
interface Detektor {
  detect: (quelle: HTMLVideoElement) => Promise<ErkannterCode[]>;
}
type DetektorKlasse = new (optionen: { formats: string[] }) => Detektor;

const TAKT_MS = 250;
const WIEDERHOLSPERRE_MS = 3000;

export default function QrScanner({ onCode }: { onCode: (text: string) => void }) {
  const { t } = useTranslation("tickets");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCodeRef = useRef(onCode);
  const [fehler, setFehler] = useState<"nicht_verfuegbar" | "verweigert" | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let beendet = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let letzter = { text: "", zeit: 0 };

    const melden = (text: string) => {
      const jetzt = Date.now();
      if (text === letzter.text && jetzt - letzter.zeit < WIEDERHOLSPERRE_MS) return;
      letzter = { text, zeit: jetzt };
      onCodeRef.current(text);
    };

    async function starten() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFehler("nicht_verfuegbar");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setFehler("verweigert");
        return;
      }
      const video = videoRef.current;
      if (beendet || !video) {
        stream.getTracks().forEach((spur) => spur.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay-Sperre : der Videorahmen wird trotzdem gelesen, sobald er läuft.
      }
      const Klasse = (window as unknown as { BarcodeDetector?: DetektorKlasse }).BarcodeDetector;
      const detektor = Klasse ? new Klasse({ formats: ["qr_code"] }) : null;
      let laeuft = false;
      timer = window.setInterval(async () => {
        if (laeuft || video.readyState < 2 || video.videoWidth === 0) return;
        laeuft = true;
        try {
          if (detektor) {
            const codes = await detektor.detect(video);
            if (codes[0]?.rawValue) melden(codes[0].rawValue);
          } else {
            const canvas = canvasRef.current;
            const kontext = canvas?.getContext("2d", { willReadFrequently: true });
            if (canvas && kontext) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              kontext.drawImage(video, 0, 0, canvas.width, canvas.height);
              const bild = kontext.getImageData(0, 0, canvas.width, canvas.height);
              const treffer = jsQR(bild.data, bild.width, bild.height);
              if (treffer?.data) melden(treffer.data);
            }
          }
        } catch {
          // Einzelbild nicht lesbar : das nächste Bild versucht es erneut.
        } finally {
          laeuft = false;
        }
      }, TAKT_MS);
    }

    void starten();
    return () => {
      beendet = true;
      if (timer !== undefined) window.clearInterval(timer);
      stream?.getTracks().forEach((spur) => spur.stop());
    };
  }, []);

  if (fehler) {
    return (
      <p
        role="alert"
        className="rounded-cid bg-status-warningBg p-3 text-sm text-status-warningText"
      >
        {t(fehler === "verweigert" ? "scan_kamera_verweigert" : "scan_kamera_fehlt")}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-cid bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label={t("scan_kamera")}
        className="mx-auto aspect-square max-h-72 w-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
