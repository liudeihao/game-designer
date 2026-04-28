import type { Metadata } from "next";
import Script from "next/script";
import { Bebas_Neue, DM_Mono, Inter } from "next/font/google";
/** Self-hosted CJK; Inter only ships Latin, so zh-CN fallback was system-only (looks “wrong” at small sizes). */
import "@fontsource-variable/noto-sans-sc";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

// Sync with web/src/lib/ui-preferences.ts (KEY + fontScale + colorScheme) before first paint.
const UI_PREF_INLINE = `(function(){try{var k="gd-ui-prefs";var raw=localStorage.getItem(k);if(!raw)return;var p=JSON.parse(raw),f=p&&p.fontScale,c=p&&p.colorScheme;if(f==="sm"||f==="lg")document.documentElement.setAttribute("data-gd-font",f);if(c==="light"||c==="dark")document.documentElement.setAttribute("data-gd-theme",c);}catch(e){}})();`;

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
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${bebas.variable} ${dmMono.variable} ${inter.variable} antialiased`}>
        <Script id="gd-ui-pref-hydration" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: UI_PREF_INLINE }} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
