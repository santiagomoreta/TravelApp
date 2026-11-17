import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { language } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel Planner",
  description: "Organiza tus viajes en un solo lugar.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={language} suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
