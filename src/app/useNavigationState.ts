import { useState } from "react";
import { aiTabStorageKey, workspaceViewStorageKey } from "./constants";
import type { AiTab, AppView } from "./types";
import { readStoredAiTab, readStoredView } from "./utils";

export function useStoredWorkspaceView() {
  const [view, setViewState] = useState<AppView>(() => readStoredView());

  const setView = (nextView: AppView) => {
    setViewState(nextView);
    window.localStorage.setItem(workspaceViewStorageKey, nextView);
  };

  return [view, setView] as const;
}

export function useStoredAiTab() {
  const [aiTab, setAiTabState] = useState<AiTab>(() => readStoredAiTab());

  const setAiTab = (nextAiTab: AiTab) => {
    setAiTabState(nextAiTab);
    window.localStorage.setItem(aiTabStorageKey, nextAiTab);
  };

  return [aiTab, setAiTab] as const;
}
