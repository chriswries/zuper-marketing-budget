import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  root.render(
    <div style={{ fontFamily: "system-ui", padding: "4rem", textAlign: "center", color: "#333" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Configuration Error</h1>
      <p>The application could not start because required environment variables are missing.</p>
      <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#888" }}>
        Missing: {!url && "VITE_SUPABASE_URL"}{!url && !key && ", "}{!key && "VITE_SUPABASE_PUBLISHABLE_KEY"}
      </p>
    </div>
  );
} else {
  import("./App").then(({ default: App }) => {
    root.render(<App />);
  });
}
