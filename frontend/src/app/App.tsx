import { useState } from "react";
import { ReaderProvider } from "./components/reader/ReaderContext";
import { LibraryPage } from "./components/reader/LibraryPage";
import { ReaderPage } from "./components/reader/ReaderPage";
import { SceneDemoPage } from "./components/reader/SceneDemoPage";
import { Toaster } from "sonner";

export default function App() {
  const [view, setView] = useState<"library" | "reader" | "scene-demo">("library");

  return (
    <ReaderProvider>
      <div className="size-full overflow-hidden h-screen">
        {view === "library" ? (
          <LibraryPage
            onOpenBook={() => setView("reader")}
            onOpenSceneDemo={() => setView("scene-demo")}
          />
        ) : view === "scene-demo" ? (
          <SceneDemoPage onBack={() => setView("library")} />
        ) : (
          <ReaderPage onBack={() => setView("library")} />
        )}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "#333",
              color: "#e0e0e0",
              border: "1px solid #444",
            },
          }}
        />
      </div>
    </ReaderProvider>
  );
}
