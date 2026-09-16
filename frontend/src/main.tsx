import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./i18n";
import "./index.css";
import { queryClient } from "./queryClient";

// Applique la classe `dark` sur <html> avant le premier rendu React (évite un flash en thème
// clair au chargement pour un utilisateur ayant choisi le sombre — voir uiStore.ts). Lecture
// directe du localStorage : le store Zustand n'est pas encore instancié à ce stade, et c'est de
// toute façon la même clé ("cid-ui") que celle utilisée par son middleware `persist`.
try {
  const stockage = localStorage.getItem("cid-ui");
  const theme = stockage ? JSON.parse(stockage)?.state?.theme : null;
  if (theme === "dark") document.documentElement.classList.add("dark");
} catch {
  // localStorage indisponible (navigation privée stricte, etc.) — thème clair par défaut.
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
