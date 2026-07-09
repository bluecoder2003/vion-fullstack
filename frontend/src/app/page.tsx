"use client";

import { useRouter } from "next/navigation";
import { LibraryPage } from "@/components/reader/LibraryPage";

export default function Home() {
  const router = useRouter();

  return (
    <LibraryPage
      onOpenBook={() => router.push("/reader")}
      onOpenSceneDemo={() => router.push("/scene-demo")}
      onOpenEmotionDemo={() => router.push("/emotion-demo")}
    />
  );
}
