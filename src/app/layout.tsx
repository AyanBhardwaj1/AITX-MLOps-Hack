import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runway for Rho",
  description: "Finds wasted spend in your Rho account and turns it into months of runway.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
