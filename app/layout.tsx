import type { Metadata } from "next";
import "./globals.css";
import { PageShell } from "@/components/page-shell";
import { StoreProvider } from "@/store/provider";

export const metadata: Metadata = {
  title: "UnderTide | Governance Intelligence",
  description: "Web3 governance intelligence for proposals, protocol spaces, and structured DAO decision support.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <PageShell>{children}</PageShell>
        </StoreProvider>
      </body>
    </html>
  );
}
