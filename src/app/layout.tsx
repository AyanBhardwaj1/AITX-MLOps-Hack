import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Runway for Rho";
const description = "Finds wasted spend in your Rho account and turns it into months of runway.";

/** Absolute base for link-preview URLs: the production domain on Vercel, localhost otherwise. */
function siteUrl(): URL {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(host ? `https://${host}` : `http://localhost:${process.env.PORT ?? 3000}`);
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title,
  description,
  applicationName: title,
  openGraph: { title, description, type: "website", siteName: title },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
