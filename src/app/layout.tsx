import type { Metadata, Viewport } from "next";
import { CatalogBrowser } from "@/client/catalog-browser";
import { MoodMatrixDialog } from "@/client/mood-matrix-dialog";
import { SearchModeBridge } from "@/client/search-mode-bridge";
import "./globals.css";
import "./ui-refresh.css";
import "./interaction-refresh.css";
import "./search-preview.css";
import "./star-rating.css";
import "./catalog-browser.css";
import "./catalog-import.css";
import "./collection-view.css";
import "./album-info.css";
import "./v05-controls.css";
import "./v07-search.css";
import "./v07-library.css";
import "./v08-search.css";
import "./v081-integration.css";
import "./v082-layout.css";
import "./v083-mood-matrix.css";
import "./build-badge.css";

const APP_VERSION = "0.8.3";

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
  const buildSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local").slice(0, 7);
  const buildLabel = `v${APP_VERSION} · ${buildSha}`;

  return (
    <html lang="fr">
      <body>
        {children}
        <CatalogBrowser />
        <SearchModeBridge />
        <MoodMatrixDialog />
        <div className="build-badge" title={`Streamall ${buildLabel}`} aria-label={`Version Streamall ${buildLabel}`}>
          {buildLabel}
        </div>
      </body>
    </html>
  );
}
