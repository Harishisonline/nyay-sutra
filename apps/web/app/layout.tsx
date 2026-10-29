import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_COOKIE } from "@/lib/session";

const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "NYAY-SUTRA · Know your rights, in your language",
    template: "%s · NYAY-SUTRA",
  },
  description:
    "A voice-first legal rights assistant for Maharashtra citizens. Ask a question in Marathi, Hindi, Hinglish, or English. Get the exact Act and section number, with a printable complaint draft.",
  applicationName: "NYAY-SUTRA",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e08a1f",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} data-theme={theme}>
      <body>
        <a href="#main" className="skip-to-content">
          Skip to content
        </a>
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
