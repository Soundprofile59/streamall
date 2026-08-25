import type { Metadata, Viewport } from "next";
import { CatalogBrowser } from "@/client/catalog-browser";
import "./globals.css";
import "./ui-refresh.css";
import "./interaction-refresh.css";
import "./search-preview.css";
import "./star-rating.css";
import "./catalog-browser.css";

export const metadata: Metadata = {
  title: "Streamall",
  description: "Votre discothèque personnelle intelligente et multi-source",
  applicationName: "Streamall",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Streamall" },
  formatDetection: { telephone: false },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#08090c", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}<CatalogBrowser /></body>
    </html>
  );
}
