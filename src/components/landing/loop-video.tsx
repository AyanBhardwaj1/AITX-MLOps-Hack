"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A muted product clip that loops, with a pause button (WCAG 2.2.2). It doesn’t start on its own
 * for people who ask for reduced motion; they see the poster and can press play.
 */
export function LoopVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Autoplay can be refused (power saving, browser policy); the poster and play button remain.
    video.play().catch(() => undefined);
  }, []);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  return (
    <div className="relative h-full w-full">
      <video
        ref={ref}
        src={src}
        poster={poster}
        aria-label={label}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="h-full w-full object-cover object-left-top"
      />
      <button type="button" onClick={toggle} className="btn btn-ink absolute bottom-3 left-3 min-h-[40px] px-3">
        {playing ? "Pause" : "Play"}
        <span className="sr-only"> the screen recording</span>
      </button>
    </div>
  );
}
