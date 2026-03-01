import type { Metadata } from "next";
import { JetBrains_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "trashmy.tech -- AI Website Stress Testing",
  description:
    "20 AI personas test your website the way real humans do. Accessibility, security, usability, mobile -- the full report in 60 seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${jetbrainsMono.variable} ${dmSans.variable} antialiased`}
        style={{ backgroundColor: "#08090d", color: "#d4d7e0" }}
      >
        {children}
      </body>
    </html>
  );
}
