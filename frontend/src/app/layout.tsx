import type { Metadata } from "next";
import { Providers } from "@/providers";
import "../styles/index.css";

export const metadata: Metadata = {
  title: "Vion Reader",
  description: "AI-powered audiobook reader",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-screen overflow-hidden antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
