import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { readGoogleMapsApiKey } from "./config/googleMapsKey";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Rotnoden saknas.");
}

createRoot(root).render(
  <StrictMode>
    <App apiKey={readGoogleMapsApiKey(import.meta.env)} />
  </StrictMode>,
);
