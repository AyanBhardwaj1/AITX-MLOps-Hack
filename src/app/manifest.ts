import type { MetadataRoute } from "next";

/** Lets a founder add Runway to a phone's home screen; it opens on the app, like one. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Runway",
    short_name: "Runway",
    description: "Know the day your cash runs out, and the spend pulling it closer.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f766e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
