"use client";

import { useRouter } from "next/navigation";
import { SceneDemoPage } from "@/components/reader/SceneDemoPage";

export default function SceneDemo() {
  const router = useRouter();

  return <SceneDemoPage onBack={() => router.push("/")} />;
}
