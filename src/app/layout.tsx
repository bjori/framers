import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Greenbrook Framers",
  description: "Tennis team management for the Greenbrook Framers community",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Framers",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0c4a6e" },
    { media: "(prefers-color-scheme: dark)", color: "#082f49" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface text-slate-900 dark:text-slate-100 min-h-dvh flex flex-col">
        <Nav />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
