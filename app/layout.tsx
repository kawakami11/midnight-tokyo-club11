import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Midnight Tokyo Club",
  description: "Premium JDM tour search, booking, and reservation management built with Next.js and Supabase."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
