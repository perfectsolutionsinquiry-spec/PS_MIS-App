import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!publishableKey) {
  // Fails loudly and early rather than rendering a broken app — a missing
  // key here means nobody could log in anyway.
  document.getElementById("root")!.innerHTML =
    "<p style='font-family:sans-serif;padding:2rem'>Missing VITE_CLERK_PUBLISHABLE_KEY — set it in the environment and rebuild.</p>";
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ClerkProvider publishableKey={publishableKey}>
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
}
