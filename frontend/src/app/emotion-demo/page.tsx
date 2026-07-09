"use client";

import { useRouter } from "next/navigation";
import { EmotionDemoPage } from "@/components/reader/EmotionDemoPage";

export default function EmotionDemo() {
  const router = useRouter();
  return <EmotionDemoPage onBack={() => router.push("/")} />;
}
