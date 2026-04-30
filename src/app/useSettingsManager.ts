import { useState, type Dispatch, type SetStateAction } from "react";
import type { AppSettings } from "../shared/contracts";
import { defaultSettings } from "./constants";
import type { ThemeMode } from "./types";

export function useSettingsManager({
  setIsBusy,
  setError,
  setStatusMessage,
}: {
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(defaultSettings);

  async function refreshSettings() {
    const savedSettings = await window.moonchat.getSettings();
    setSettings(savedSettings);
    setSettingsDraft(savedSettings);
  }

  async function handleSaveModelSettings() {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.moonchat.updateSettings({
        ui: settingsDraft.ui,
        telegram: settingsDraft.telegram,
        channels: settingsDraft.channels,
        ai: {
          provider: "openai",
          apiKey: settingsDraft.ai.apiKey.trim(),
          baseUrl: settingsDraft.ai.baseUrl.trim(),
          model: settingsDraft.ai.model.trim(),
          temperature: Number(settingsDraft.ai.temperature),
          ragToolEnabled: settingsDraft.ai.ragToolEnabled,
          systemPrompt: settingsDraft.ai.systemPrompt.trim(),
          autoReplySystemPrompt: settingsDraft.ai.autoReplySystemPrompt.trim(),
        },
      });
      setSettings(saved);
      setSettingsDraft(saved);
      setStatusMessage("模型配置已保存并重载。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存模型配置失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleThemeModeChange(nextThemeMode: ThemeMode) {
    if (nextThemeMode === settings.ui.themeMode) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.moonchat.updateSettings({
        ...settings,
        ui: { themeMode: nextThemeMode },
      });
      setSettings(saved);
      setSettingsDraft(saved);
    } catch (themeError) {
      setError(themeError instanceof Error ? themeError.message : "切换主题失败。");
    }
  }

  return {
    settings,
    settingsDraft,
    setSettings,
    setSettingsDraft,
    refreshSettings,
    handleSaveModelSettings,
    handleThemeModeChange,
  };
}
