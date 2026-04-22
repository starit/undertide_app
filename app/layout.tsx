import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "./globals.css";
import { PageShell } from "@/components/page-shell";
import { StoreProvider } from "@/store/provider";
import { getServerLocale } from "@/lib/i18n-server";

export const metadata: Metadata = {
  metadataBase: new URL("https://undertide.xyz"),
  title: {
    default: "UnderTide | Web3 Governance Intelligence",
    template: "%s | UnderTide",
  },
  description: "Web3 governance intelligence for proposals, protocol spaces, and structured DAO decision support.",
  applicationName: "UnderTide",
  keywords: [
    "Web3 governance",
    "DAO proposals",
    "Snapshot spaces",
    "governance intelligence",
    "protocol governance",
    "DAO analytics",
    "governance research",
    "crypto governance",
  ],
  alternates: {
    canonical: "/",
  },
  category: "technology",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: "https://undertide.xyz",
    siteName: "UnderTide",
    title: "UnderTide | Web3 Governance Intelligence",
    description: "Track DAO proposals, governance spaces, and structured protocol decision signals across Web3.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "UnderTide | Web3 Governance Intelligence",
    description: "Track DAO proposals, governance spaces, and structured protocol decision signals across Web3.",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <StoreProvider>
            <PageShell locale={locale}>{children}</PageShell>
          </StoreProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
