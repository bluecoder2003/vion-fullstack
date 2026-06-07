"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useReader } from "@/components/reader/ReaderContext";
import { ReaderPage } from "@/components/reader/ReaderPage";

export default function Reader() {
  const router = useRouter();
  const { book } = useReader();

  // Guard: if no book is loaded, send back to library
  useEffect(() => {
    if (book === null) {
      router.replace("/");
    }
  }, [book, router]);

  if (!book) return null;

  return (
    <div className="size-full">
      <ReaderPage onBack={() => router.push("/")} />
    </div>
  );
}
