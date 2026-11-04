import type { Metadata } from "next";
import localFont from "next/font/local";
import "@/styles/globals.css";

const onest = localFont({
  src: "./fonts/Onest.woff2",
  variable: "--font-onest",
  weight: "400 700",
  display: "swap",
});
const gaegu = localFont({
  src: [
    { path: "./fonts/Gaegu-300.woff2", weight: "300" },
    { path: "./fonts/Gaegu-400.woff2", weight: "400" },
    { path: "./fonts/Gaegu-700.woff2", weight: "700" },
  ],
  variable: "--font-gaegu",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMono.woff2",
  variable: "--font-geist-mono",
  weight: "400 500",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dalil design system",
  description: "A guide that points, draws and waits. Black for status, paper for teaching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${onest.variable} ${gaegu.variable} ${geistMono.variable} h-full overflow-x-clip antialiased`}>
      <body className="min-h-full overflow-x-clip font-sans text-text-primary">
        {children}
      </body>
    </html>
  );
}
