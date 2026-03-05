import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOUND__",
  description: "A music player built from Reid Surmeier's Are.na channel",
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
