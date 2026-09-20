import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: "S:ta Maria Församling",
  description: "Digitalt medlemsregistersystem — Göteborg",
};

// Prevents iOS Safari from zooming in when tapping inputs/selects
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" className={cn(geist.variable)}>
      <body className={cn("font-sans antialiased bg-background text-foreground")}>
        {children}
      </body>
    </html>
  );
}
