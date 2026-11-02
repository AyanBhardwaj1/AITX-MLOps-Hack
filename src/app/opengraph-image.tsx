import { ImageResponse } from "next/og";

export const alt = "Runway: know the day your startup's cash runs out, and find the spend pulling it closer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview in the site's one motif: a runway distance-marker board counting down. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f7f9", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 52, height: 52, background: "#0f172a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }}>
              R
            </div>
            <div style={{ fontSize: 34, fontWeight: 700, color: "#0f172a" }}>Runway</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 700, color: "#0f172a", lineHeight: 1, letterSpacing: -2 }}>Know the day your</div>
            <div style={{ fontSize: 76, fontWeight: 700, color: "#0f172a", lineHeight: 1, letterSpacing: -2 }}>cash runs out</div>
            <div style={{ fontSize: 30, color: "#0f172a", marginTop: 28 }}>Read-only, from your bank feed. Every Monday, in Slack.</div>
          </div>
        </div>
        <div style={{ width: 380, background: "#0f766e", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 240, height: 240, background: "#0f172a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 150, fontWeight: 700 }}>
            12
          </div>
        </div>
      </div>
    ),
    size,
  );
}
