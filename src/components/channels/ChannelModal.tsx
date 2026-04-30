import type { ChannelConfig } from "../../shared/contracts";
import {
  createTelegramChannel,
  createTelegramUserChannel,
  createWhatsappPersonalChannel,
} from "../../app/utils";

export function ChannelModal({
  mode,
  draft,
  channelCount,
  isBusy,
  whatsappQrPendingId,
  whatsappQrError,
  whatsappConnectedById,
  onClose,
  onDraftChange,
  onSubmit,
  onRequestTelegramUserCode,
  onRequestWhatsappQr,
}: {
  mode: "add" | "edit";
  draft: ChannelConfig;
  channelCount: number;
  isBusy: boolean;
  whatsappQrPendingId: string | null;
  whatsappQrError: string | null;
  whatsappConnectedById: Record<string, boolean>;
  onClose: () => void;
  onDraftChange: (updater: (current: ChannelConfig) => ChannelConfig) => void;
  onSubmit: () => void;
  onRequestTelegramUserCode: (
    channel: ChannelConfig,
    applySession: (sessionString: string) => void,
  ) => void;
  onRequestWhatsappQr: (
    channel: ChannelConfig,
    applyQr: (authStatePath: string, qrDataUrl: string) => void,
  ) => void;
}) {
  const title = mode === "add" ? "添加渠道" : "编辑渠道";
  const titleId = mode === "add" ? "add-channel-title" : "edit-channel-title";
  const submitLabel = mode === "add" ? "添加" : "保存";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="pane-header">
          <div>
            <h2 id={titleId}>{title}</h2>
          </div>
        </div>
        <div className="settings-grid modal-grid">
          <label className="settings-field">
            <span>渠道名称</span>
            <input value={draft.name} onChange={(event) => onDraftChange((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="settings-field">
            <span>渠道类型</span>
            <select
              value={draft.type}
              disabled={mode === "edit"}
              onChange={(event) => onDraftChange((current) => createDraftForType(event.target.value, current, channelCount))}
            >
              <option value="telegram">TelegramBot</option>
              <option value="telegram_user">Telegram 私人账号</option>
              <option value="whatsapp_personal">WhatsApp 私人账号</option>
            </select>
          </label>

          {draft.type === "telegram" ? (
            <label className="settings-field settings-field-wide">
              <span>Bot Token</span>
              <input
                type="password"
                value={draft.botToken ?? ""}
                onChange={(event) => onDraftChange((current) => ({ ...current, botToken: event.target.value }))}
              />
            </label>
          ) : draft.type === "telegram_user" ? (
            <TelegramUserFields
              draft={draft}
              isBusy={isBusy}
              onDraftChange={onDraftChange}
              onRequestTelegramUserCode={onRequestTelegramUserCode}
            />
          ) : (
            <WhatsappFields
              draft={draft}
              isBusy={isBusy}
              whatsappQrPendingId={whatsappQrPendingId}
              whatsappQrError={whatsappQrError}
              whatsappConnectedById={whatsappConnectedById}
              onDraftChange={onDraftChange}
              onRequestWhatsappQr={onRequestWhatsappQr}
            />
          )}
        </div>
        <div className="settings-actions">
          <button className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" onClick={onSubmit} disabled={isBusy}>
            {submitLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function TelegramUserFields({
  draft,
  isBusy,
  onDraftChange,
  onRequestTelegramUserCode,
}: {
  draft: ChannelConfig;
  isBusy: boolean;
  onDraftChange: (updater: (current: ChannelConfig) => ChannelConfig) => void;
  onRequestTelegramUserCode: (
    channel: ChannelConfig,
    applySession: (sessionString: string) => void,
  ) => void;
}) {
  return (
    <>
      <div className="settings-field settings-field-wide helper-card">
        <strong>Telegram 私人账号登录说明</strong>
        <p>首次登录：填写手机号并点击发送验证码；收到验证码后填入验证码再保存。</p>
        <p>登录成功后会保存 session，后续一般不需要再次输入验证码或 2FA 密码。</p>
      </div>
      <label className="settings-field settings-field-wide">
        <span>手机号</span>
        <input
          value={draft.phoneNumber ?? ""}
          placeholder="+8613800000000"
          onChange={(event) => onDraftChange((current) => ({ ...current, phoneNumber: event.target.value }))}
        />
      </label>
      <label className="settings-field">
        <span>验证码</span>
        <input
          value={draft.loginCode ?? ""}
          onChange={(event) => onDraftChange((current) => ({ ...current, loginCode: event.target.value }))}
        />
      </label>
      <label className="settings-field">
        <span>2FA 密码（如有）</span>
        <input
          type="password"
          value={draft.twoFactorPassword ?? ""}
          onChange={(event) => onDraftChange((current) => ({ ...current, twoFactorPassword: event.target.value }))}
        />
      </label>
      <div className="settings-field settings-field-wide">
        <button
          className="ghost-button"
          onClick={() =>
            onRequestTelegramUserCode(draft, (sessionString) =>
              onDraftChange((current) => ({ ...current, sessionString })),
            )
          }
          disabled={isBusy || !draft.phoneNumber}
        >
          发送验证码
        </button>
      </div>
    </>
  );
}

function WhatsappFields({
  draft,
  isBusy,
  whatsappQrPendingId,
  whatsappQrError,
  whatsappConnectedById,
  onDraftChange,
  onRequestWhatsappQr,
}: {
  draft: ChannelConfig;
  isBusy: boolean;
  whatsappQrPendingId: string | null;
  whatsappQrError: string | null;
  whatsappConnectedById: Record<string, boolean>;
  onDraftChange: (updater: (current: ChannelConfig) => ChannelConfig) => void;
  onRequestWhatsappQr: (
    channel: ChannelConfig,
    applyQr: (authStatePath: string, qrDataUrl: string) => void,
  ) => void;
}) {
  return (
    <>
      <div className="settings-field settings-field-wide helper-card">
        <strong>WhatsApp 私人账号接入说明</strong>
        <p>基于 WhatsApp Web 接入，可能会掉线或受 WhatsApp 风控影响。</p>
      </div>
      <div
        className={
          draft.lastQrDataUrl
            ? "settings-field settings-field-wide qr-preview-card"
            : "settings-field settings-field-wide qr-action-card"
        }
        aria-busy={whatsappQrPendingId === draft.id}
      >
        {draft.lastQrDataUrl ? (
          <>
            <img src={draft.lastQrDataUrl} alt="WhatsApp 登录二维码" />
            <span>
              {whatsappConnectedById[draft.id]
                ? "已扫码登录，可以保存渠道"
                : "手机 WhatsApp → 已关联设备 → 扫码"}
            </span>
          </>
        ) : (
          <>
            <button
              className="ghost-button"
              onClick={() =>
                onRequestWhatsappQr(draft, (authStatePath, qrDataUrl) =>
                  onDraftChange((current) => ({
                    ...current,
                    authStatePath,
                    lastQrDataUrl: qrDataUrl,
                  })),
                )
              }
              disabled={isBusy}
            >
              {whatsappQrPendingId === draft.id ? "生成中..." : "生成二维码"}
            </button>
            {whatsappQrPendingId === draft.id ? (
              <span className="qr-loading-text">正在向 WhatsApp 请求二维码</span>
            ) : null}
            {whatsappQrError ? <span className="qr-error-text">{whatsappQrError}</span> : null}
          </>
        )}
      </div>
    </>
  );
}

function createDraftForType(type: string, current: ChannelConfig, channelCount: number) {
  const index = channelCount + 1;
  if (type === "telegram_user") {
    return {
      ...createTelegramUserChannel(index),
      id: current.id,
      name:
        current.name.trim() && current.name !== "TelegramBot"
          ? current.name
          : `Telegram 私人账号 ${index}`,
    };
  }

  if (type === "whatsapp_personal") {
    return {
      ...createWhatsappPersonalChannel(index),
      id: current.id,
      name:
        current.name.trim() &&
        current.name !== "TelegramBot" &&
        !current.name.startsWith("Telegram 私人账号")
          ? current.name
          : `WhatsApp 私人账号 ${index}`,
    };
  }

  return {
    ...createTelegramChannel(index),
    id: current.id,
    name:
      current.name.trim() &&
      !current.name.startsWith("Telegram 私人账号") &&
      !current.name.startsWith("WhatsApp 私人账号")
        ? current.name
        : `TelegramBot ${index}`,
  };
}
