import type { Metadata, Viewport } from "next";
import { Archivo, Caveat, Inter } from "next/font/google";
import "./globals.css";

const grotesk = Archivo({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

const hand = Caveat({
  subsets: ["latin"],
  variable: "--font-hand",
  display: "swap",
});

const ui = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Idea Capture — set up your voice second brain",
  description:
    "A step-by-step setup wizard that connects Siri on your iPhone to your Notion, so you can capture ideas by voice without opening an app.",
};

export const viewport: Viewport = {
  themeColor: "#f2e7da",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${hand.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
