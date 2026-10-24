import type { ReactNode } from "react";
import { DealUIProvider } from "@/components/providers";
import { Footer, Nav } from "@/components/site-chrome";

/** The public shopping site: header, footer, store picker and the floating assistant. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <DealUIProvider>
      <Nav />
      <main>{children}</main>
      <Footer />
    </DealUIProvider>
  );
}
