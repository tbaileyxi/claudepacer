import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClaudePacer — Stop driving Claude without a speedometer",
  description:
    "See your live Claude burn rate and weekly budget at a glance. Know before you hit a cap.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "ClaudePacer",
    description: "Stop driving Claude without a speedometer or gas gauge.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-900 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
