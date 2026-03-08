import type { Metadata } from "next";
import { Instrument_Sans, Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "./providers";

const instrumentSans = Instrument_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "candid. -- AI Website Stress Testing",
  description:
    "50 AI personas test your website the way real humans do. Accessibility, security, usability, mobile -- the full report in 60 seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${instrumentSans.variable} ${sourceSerif.variable} ${ibmPlexMono.variable} antialiased`}
        style={{ backgroundColor: "#0a0a0c", color: "#e8e6e3" }}
      >
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
