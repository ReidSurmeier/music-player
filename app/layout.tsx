import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "♫⋆｡‧₊˚♪⊹₊⋆˚♬",
  description: "Reid Surmeier's music player — styled after nagizin.xyz, sourced from Are.na",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
