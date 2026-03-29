import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Traak",
  description: "Prediction market portfolio tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <header className="border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6 lg:px-8">
              <Link href="/portfolio" className="text-base font-semibold tracking-wide text-slate-100">
                Traak
              </Link>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
