import "@fontsource-variable/karla";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Food-Del · India's iconic delicacies, delivered fresh",
    template: "%s · Food-Del",
  },
  description:
    "Order Kolkata's sandesh, Hyderabad's Osmania biscuits, Old Delhi's sohan halwa and Mysore pak — made to order and delivered fresh across India on the day you choose.",
  applicationName: "Food-Del",
  openGraph: { type: "website", siteName: "Food-Del", locale: "en_IN" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FFF9F0",
  width: "device-width",
  initialScale: 1,
  // Lets the tab bar sit above the home indicator on notched phones.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="flex min-h-dvh flex-col antialiased">
        <Providers>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <MobileTabBar />
        </Providers>
      </body>
    </html>
  );
}
