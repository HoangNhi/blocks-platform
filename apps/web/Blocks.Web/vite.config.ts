import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

function chunkGroupForModule(id: string) {
  const normalizedId = id.replaceAll("\\", "/")

  if (
    normalizedId.includes("/node_modules/@uiw/react-codemirror/") ||
    normalizedId.includes("/node_modules/@codemirror/")
  ) {
    return "codemirror"
  }

  if (normalizedId.includes("/node_modules/lightweight-charts/")) {
    return "charts"
  }

  if (normalizedId.includes("/node_modules/react-virtuoso/")) {
    return "virtual-list"
  }

  if (normalizedId.includes("/src/plugins/tradelab/")) {
    return "tradelab"
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks: chunkGroupForModule,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
