import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppSettings, ChannelConfig } from "../shared/contracts";
import type { ChannelConnectionStatus } from "./types";
import { createTelegramChannel, createTelegramUserChannel, describeChannel, normalizeChannels } from "./utils";

export function useChannelManager({
  settings,
  settingsDraft,
  setSettings,
  setSettingsDraft,
  setIsBusy,
  setError,
  setStatusMessage,
}: {
  settings: AppSettings;
  settingsDraft: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setSettingsDraft: Dispatch<SetStateAction<AppSettings>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [newChannelDraft, setNewChannelDraft] = useState<ChannelConfig>(() => createTelegramChannel(1));
  const [editingChannelDraft, setEditingChannelDraft] = useState<ChannelConfig | null>(null);
  const [whatsappQrPendingId, setWhatsappQrPendingId] = useState<string | null>(null);
  const [whatsappQrError, setWhatsappQrError] = useState<string | null>(null);
  const [whatsappConnectedById, setWhatsappConnectedById] = useState<Record<string, boolean>>({});
  const [channelStatusById, setChannelStatusById] = useState<Record<string, ChannelConnectionStatus>>({});
  const previousChannelStatusRef = useRef<Record<string, ChannelConnectionStatus>>({});

  async function refreshChannelStatuses(options: { notifyOnDisconnect?: boolean } = {}) {
    const enabledChannels = settingsDraft.channels.filter((channel) => channel.enabled);
    if (enabledChannels.length === 0) {
      setChannelStatusById({});
      previousChannelStatusRef.current = {};
      return;
    }

    const entries = await Promise.all(
      enabledChannels.map(async (channel) => {
        try {
          const status = await window.moonchat.getChannelStatus(channel);
          return [channel.id, status] as const;
        } catch {
          return [
            channel.id,
            {
              ok: false,
              connected: false,
              needsLogin: channel.type !== "telegram",
              message: `${describeChannel(channel.type)} 服务未连接，请检查配置后重试。`,
              checkedAt: new Date().toISOString(),
            },
          ] as const;
        }
      }),
    );
    const nextStatusById = Object.fromEntries(entries);
    const previousStatusById = previousChannelStatusRef.current;
    setChannelStatusById(nextStatusById);
    setWhatsappConnectedById((current) => ({
      ...current,
      ...Object.fromEntries(
        entries
          .filter(
            ([channelId]) =>
              settingsDraft.channels.find((channel) => channel.id === channelId)?.type === "whatsapp_personal",
          )
          .map(([channelId, status]) => [channelId, status.connected]),
      ),
    }));

    if (options.notifyOnDisconnect) {
      const disconnectedChannel = enabledChannels.find((channel) => {
        const previousStatus = previousStatusById[channel.id];
        const nextStatus = nextStatusById[channel.id];
        return previousStatus?.connected && nextStatus && !nextStatus.connected;
      });
      if (disconnectedChannel) {
        const status = nextStatusById[disconnectedChannel.id];
        setError(
          `${disconnectedChannel.name || describeChannel(disconnectedChannel.type)} 已掉线。${status?.message ?? "请检查配置后重试。"}`,
        );
      }
    }

    previousChannelStatusRef.current = nextStatusById;
  }

  useEffect(() => {
    const enabledChannels = settingsDraft.channels.filter((channel) => channel.enabled);
    if (enabledChannels.length === 0) {
      setChannelStatusById({});
      previousChannelStatusRef.current = {};
      return;
    }

    void refreshChannelStatuses();
    const intervalId = window.setInterval(() => {
      void refreshChannelStatuses({ notifyOnDisconnect: true });
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [settingsDraft.channels]);

  function openAddChannelModal() {
    setNewChannelDraft(createTelegramUserChannel(settingsDraft.channels.length + 1));
    setIsAddChannelModalOpen(true);
  }

  function closeAddChannelModal() {
    setIsAddChannelModalOpen(false);
  }

  function openEditChannelModal(channel: ChannelConfig) {
    setEditingChannelDraft({ ...channel });
  }

  function closeEditChannelModal() {
    setEditingChannelDraft(null);
  }

  async function persistChannelSettings(nextChannels: ChannelConfig[], successMessage: string) {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.moonchat.updateSettings({
        ui: settingsDraft.ui,
        telegram: { botToken: "" },
        channels: normalizeChannels(nextChannels),
        ai: settingsDraft.ai,
      });
      setSettings(saved);
      setSettingsDraft(saved);
      setStatusMessage(successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存渠道配置失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function addChannelFromModal() {
    if (!(await ensureWhatsappChannelConnected(newChannelDraft))) {
      return;
    }
    const nextChannels = [...settingsDraft.channels, newChannelDraft];
    await persistChannelSettings(nextChannels, "渠道已添加并启动监听。");
    setIsAddChannelModalOpen(false);
  }

  async function saveEditingChannel() {
    if (!editingChannelDraft) {
      return;
    }
    if (!(await ensureWhatsappChannelConnected(editingChannelDraft))) {
      return;
    }

    const nextChannels = settingsDraft.channels.map((channel) =>
      channel.id === editingChannelDraft.id ? editingChannelDraft : channel,
    );
    await persistChannelSettings(nextChannels, "渠道配置已更新并重启监听。");
    setEditingChannelDraft(null);
  }

  async function removeChannel(channelId: string) {
    const nextChannels = settingsDraft.channels.filter((channel) => channel.id !== channelId);
    setSettingsDraft((current) => ({
      ...current,
      channels: nextChannels,
    }));
    await persistChannelSettings(nextChannels, "渠道已删除。");
  }

  async function toggleChannelEnabled(channel: ChannelConfig) {
    const nextEnabled = !channel.enabled;
    const nextChannels = settingsDraft.channels.map((item) =>
      item.id === channel.id ? { ...item, enabled: nextEnabled } : item,
    );
    setSettingsDraft((current) => ({
      ...current,
      channels: nextChannels,
    }));
    await persistChannelSettings(nextChannels, nextEnabled ? "渠道已启用。" : "渠道已暂停。");
  }

  async function requestTelegramUserCode(channel: ChannelConfig, applySession: (sessionString: string) => void) {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await window.moonchat.requestTelegramUserCode(channel);
      if (result.alreadyAuthorized && result.sessionString) {
        applySession(result.sessionString);
        setStatusMessage("该 Telegram 私人账号已授权，保存渠道即可启动监听。");
        return;
      }

      setStatusMessage(
        result.isCodeViaApp
          ? "验证码已发送到你的 Telegram App，请填入验证码后保存渠道。"
          : "验证码已通过短信发送，请填入验证码后保存渠道。",
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "发送 Telegram 验证码失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function requestWhatsappQr(channel: ChannelConfig, applyQr: (authStatePath: string, qrDataUrl: string) => void) {
    setIsBusy(true);
    setWhatsappQrPendingId(channel.id);
    setWhatsappQrError(null);
    setWhatsappConnectedById((current) => ({ ...current, [channel.id]: false }));
    try {
      const result = await window.moonchat.requestWhatsappQr(channel);
      applyQr(result.authStatePath, result.qrDataUrl);
      setWhatsappConnectedById((current) => ({ ...current, [channel.id]: result.connected }));
      setChannelStatusById((current) => ({
        ...current,
        [channel.id]: {
          ok: true,
          connected: result.connected,
          needsLogin: !result.connected,
          message: result.connected ? "WhatsApp 已连接。" : "等待手机 WhatsApp 扫码登录。",
          checkedAt: new Date().toISOString(),
        },
      }));
      if (!result.qrDataUrl && !result.connected) {
        setWhatsappQrError("暂时没有生成二维码，请稍后再试。");
      }
      if (!result.qrDataUrl && result.connected) {
        setWhatsappQrError(null);
      }
      if (result.qrDataUrl && !result.connected) {
        void pollWhatsappConnection(channel.id);
      }
    } catch (requestError) {
      setWhatsappQrError(requestError instanceof Error ? requestError.message : "生成 WhatsApp 二维码失败。");
    } finally {
      setWhatsappQrPendingId(null);
      setIsBusy(false);
    }
  }

  async function pollWhatsappConnection(channelId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      try {
        const status = await window.moonchat.getWhatsappStatus(channelId);
        setChannelStatusById((current) => ({ ...current, [channelId]: status }));
        if (status.connected) {
          setWhatsappConnectedById((current) => ({ ...current, [channelId]: true }));
          setWhatsappQrError(null);
          return;
        }
      } catch {
        return;
      }
    }
  }

  async function ensureWhatsappChannelConnected(channel: ChannelConfig) {
    if (channel.type !== "whatsapp_personal" || !channel.enabled) {
      return true;
    }
    if (whatsappConnectedById[channel.id]) {
      return true;
    }

    setIsBusy(true);
    setWhatsappQrError(null);
    try {
      const status = await window.moonchat.getWhatsappStatus(channel.id);
      setChannelStatusById((current) => ({ ...current, [channel.id]: status }));
      setWhatsappConnectedById((current) => ({ ...current, [channel.id]: status.connected }));
      if (status.connected) {
        return true;
      }
      setWhatsappQrError("请先用手机 WhatsApp 扫码并完成登录，再保存渠道。");
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  return {
    isAddChannelModalOpen,
    newChannelDraft,
    editingChannelDraft,
    whatsappQrPendingId,
    whatsappQrError,
    whatsappConnectedById,
    channelStatusById,
    openAddChannelModal,
    closeAddChannelModal,
    openEditChannelModal,
    closeEditChannelModal,
    updateNewChannelDraft: (updater: (current: ChannelConfig) => ChannelConfig) =>
      setNewChannelDraft((current) => updater(current)),
    updateEditingChannelDraft: (updater: (current: ChannelConfig) => ChannelConfig) =>
      setEditingChannelDraft((current) => (current ? updater(current) : current)),
    addChannelFromModal,
    saveEditingChannel,
    removeChannel,
    toggleChannelEnabled,
    requestTelegramUserCode,
    requestWhatsappQr,
  };
}
