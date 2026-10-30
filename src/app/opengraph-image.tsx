import { ImageResponse } from "next/og";

export const alt = "Runway for Rho: finds wasted spend in your Rho account and turns it into months of runway";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const stat = (value: string, label: string, color: string) => (
  <div style={{ display: "flex", flexDirection: "column", padding: "28px 32px", background: "#ffffff", borderRadius: 24, border: "2px solid #e2e8f0", flex: 1 }}>
    <div style={{ fontSize: 60, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 26, color: "#64748b", marginTop: 6 }}>{label}</div>
  </div>
);

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f6f7f9", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: "#0f766e", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 700 }}>
            R
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, color: "#0f172a" }}>Runway for Rho</div>
        </div>
        <div style={{ fontSize: 40, color: "#0f172a", marginTop: 40, lineHeight: 1.25, maxWidth: 1000 }}>
          Finds the wasted spend in your Rho account and turns it into months of runway.
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: "auto" }}>
          {stat("12.2 mo", "runway, P10–P90 range", "#0f172a")}
          {stat("$2,570/mo", "waste found in ~10 ms", "#0f766e")}
          {stat("100%", "precision on planted waste", "#b45309")}
        </div>
      </div>
    ),
    size,
  );
}
