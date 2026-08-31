/**
 * KwakoPos 2.0 React DOM Mounting Entry Point
 * Mounts KwakoPosApp into <div id="root"></div>.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
