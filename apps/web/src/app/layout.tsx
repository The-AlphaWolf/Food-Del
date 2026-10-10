import "@fontsource-variable/karla";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import { colors, darkColors } from "@food-del/design-tokens";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DemoGate } from "@/components/demo/gate";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { STATIC_DEMO } from "@/lib/demo";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: colors.paper },
    { media: "(prefers-color-scheme: dark)", color: darkColors.paper },
  ],
  width: "device-width",
  initialScale: 1,
  // Lets the tab bar sit above the home indicator on notched phones.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const site = (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
    </>
  );
  return (
    // The theme is set on <html> before first paint, so React must not "correct" it.
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* Our own constant: sets the theme before first paint so it never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <Providers>{STATIC_DEMO ? <DemoGate>{site}</DemoGate> : site}</Providers>
      </body>
    </html>
  );
}
