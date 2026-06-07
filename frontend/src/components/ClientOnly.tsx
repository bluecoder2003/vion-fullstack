"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders children only after the component has mounted on the client.
 * Use this as a boundary to prevent server-side rendering of components
 * that rely on browser-only APIs (AudioContext, WebSocket, epubjs, etc.).
 */
export function ClientOnly({ children, fallback = null }: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? <>{children}</> : <>{fallback}</>;
}
