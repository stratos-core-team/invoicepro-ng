import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PostHogProvider } from "@posthog/react";
import App from "./App.tsx";
import "./index.css";
import posthog, { initPostHog } from "./analytics/posthog";

// Initialize once, outside React, so StrictMode cannot run it twice
initPostHog();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    </BrowserRouter>
  </React.StrictMode>
);