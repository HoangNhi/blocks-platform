import { Toaster } from "sonner";
import Router from "./Router";
import { KnowledgeHubCacheBoundary } from "@/features/knowledgehub/hooks/KnowledgeHubCacheBoundary";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <KnowledgeHubCacheBoundary>
        <Router />
      </KnowledgeHubCacheBoundary>

      <Toaster position="bottom-right" richColors />
    </div>
  );
}

export default App;
