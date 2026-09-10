import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/figtree";
import "@fontsource/ibm-plex-mono/latin-400.css";
import App from "./pages/App.page";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
