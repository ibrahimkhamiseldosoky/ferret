import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ScrollbarStyles from "./ScrollbarStyles";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ferret - Understand Any Codebase In Minutes",
  description: "Upload a repository and instantly explore its architecture, dependencies, and behavior.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-zinc-900">
        {children}
        <ScrollbarStyles />
      </body>
    </html>
  );
}
