import type { Metadata } from "next";
import Script from "next/script";
import { Bebas_Neue, DM_Mono, Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

// Sync with web/src/lib/ui-preferences.ts (KEY + fontScale) so `data-gd-font` applies before first paint.
const UI_PREF_INLINE = `(function(){try{var k="gd-ui-prefs";var raw=localStorage.getItem(k);if(!raw)return;var p=JSON.parse(raw),f=p&&p.fontScale;if(f==="sm"||f==="lg")document.documentElement.setAttribute("data-gd-font",f);}catch(e){}})();`;

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Game Designer",
  description: "素材概念与游戏发想",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className={`${bebas.variable} ${dmMono.variable} ${inter.variable} antialiased`}>
        <Script id="gd-ui-pref-hydration" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: UI_PREF_INLINE }} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
