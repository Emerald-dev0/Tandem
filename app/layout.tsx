import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tandem — Your dev stack. One chat.",
  description:
    "Tandem is your development ecosystem, connected in one place. Create repositories, ship deploys and manage infrastructure — directly from Telegram.",
  openGraph: {
    title: "Tandem — Your dev stack. One chat.",
    description:
      "Create repos, ship deploys and manage infrastructure — directly from Telegram.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B2E9E",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='22' fill='%232AABEE'/%3E%3Cpath d='M11 24.5 35 14l-4 21-8-6.5-4.5 4.5.8-7L34 15.8 16.6 27.2z' fill='%23fff'/%3E%3C/svg%3E"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
