import type { Metadata, Viewport } from "next";
import { Figtree, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const display = Schibsted_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["500", "700", "800"] });
const body = Figtree({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Vault: real deals from stores you can trust", template: "%s · Vault" },
  description: "Price drops, flash sales and last-minute fares from verified US stores, checked and collected in one place.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c111c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
