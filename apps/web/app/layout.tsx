import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Happy Hotels SKO 2027",
  description: "Live demo booking concierge"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
