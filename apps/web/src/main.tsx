import "./styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("KwakoPosv2 React root element #root is missing");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
