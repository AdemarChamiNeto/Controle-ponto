import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import App from "./App";
import { store } from "./store";
import "./styles.css";
import { initConsent } from "./consent";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);

// GA4/Clarity só depois do aceite (e só se os IDs estiverem configurados no build)
initConsent("/privacidade.html");
