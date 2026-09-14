import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intraday Chart",
  description: "1-minute candles for any US equity session.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
