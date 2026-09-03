import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!publishableKey) {
  // Fails loudly and early rather than rendering a broken app — a missing
  // key here means nobody could log in anyway.
  document.getElementById("root")!.innerHTML =
    "<p style='font-family:sans-serif;padding:2rem'>Missing VITE_CLERK_PUBLISHABLE_KEY — set it in the environment and rebuild.</p>";
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={publishableKey}
        // Clerk's prebuilt <SignIn/> and the account/UserButton portal
        // (Sidebar.tsx) default to Clerk's own generic serif/sans pair —
        // not this app's brand fonts. This is the one place that applies
        // to every Clerk-rendered surface at once, sign-in screen and
        // account portal both, rather than fighting it per-screen.
        appearance={{ variables: { fontFamily: "var(--font-sans)" } }}
      >
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
}
