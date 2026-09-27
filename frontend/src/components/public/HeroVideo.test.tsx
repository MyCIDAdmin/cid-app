import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HeroVideo from "./HeroVideo";

describe("HeroVideo", () => {
  it("rend la vidéo en autoplay/muet/boucle avec l'URL fournie", () => {
    render(<HeroVideo videoUrl="https://cid-media.example/hero.mp4" />);

    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "https://cid-media.example/hero.mp4");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect((video as HTMLVideoElement).muted).toBe(true);
  });
});
