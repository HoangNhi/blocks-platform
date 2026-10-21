import { Toaster } from "sonner";
import Router from "./Router";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Router />

      <Toaster position="bottom-right" richColors />
    </div>
  );
}

export default App;
