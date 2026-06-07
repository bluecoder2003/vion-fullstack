"use client";

import { ClientOnly } from "@/components/ClientOnly";
import { ReaderProvider } from "@/components/reader/ReaderContext";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly>
      <ReaderProvider>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "#1a1a1a",
              color: "#e0e0e0",
              border: "1px solid #333",
              borderRadius: "8px",
              fontSize: "13px",
            },
          }}
        />
      </ReaderProvider>
    </ClientOnly>
  );
}
