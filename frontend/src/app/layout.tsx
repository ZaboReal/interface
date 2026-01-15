import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CommandBar } from "@/components/layout/CommandBar";
import { Scanlines } from "@/components/layout/Scanlines";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "INTERFACE_SYS v1.0 - Collaborative Review",
  description: "Real-time collaborative document review platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="h-screen flex flex-col overflow-hidden">
        <Providers>
          <Scanlines />
          <Header />
          <div className="flex flex-1 min-h-0">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 terminal-grid">
              {children}
            </main>
          </div>
          <CommandBar />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
