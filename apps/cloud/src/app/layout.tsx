import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Sean — Control Plane",
  description:
    "Hosted control plane for Agent Sean, the self-hosted autonomous SEO agent.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)] antialiased">
        {children}
      </body>
    </html>
  );
}
