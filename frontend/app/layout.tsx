import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/** Plus Jakarta Sans: geometric, friendly, still reads as a financial product. */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SwiftBrokers — AI Insurance Assistant",
  description: "Chat with Nomi and get health insurance quotations in seconds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        // Browser extensions inject attributes on <body> before hydration.
        suppressHydrationWarning
        className="flex min-h-full flex-col font-sans"
      >
        {children}
      </body>
    </html>
  );
}
