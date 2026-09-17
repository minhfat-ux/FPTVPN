import React from "react";
import { createRoot } from "react-dom/client";
import "highlight.js/styles/atom-one-dark.css";
import "./styles.css";
import { I18nProvider } from "./i18n";
import { AppProvider } from "./state/store";
import { ChatProvider } from "./state/chat";
import { VoiceProvider } from "./voice/VoiceProvider";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Không tìm thấy #root");

createRoot(container).render(
  <React.StrictMode>
    <I18nProvider>
      <AppProvider>
        <ChatProvider>
          <VoiceProvider>
            <App />
          </VoiceProvider>
        </ChatProvider>
      </AppProvider>
    </I18nProvider>
  </React.StrictMode>,
);
