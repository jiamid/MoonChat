import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import type { AppSettings, ChannelConfig } from "../shared/contracts";
import type { ChannelConnectionStatus } from "../app/types";
import { describeChannel, getChannelRowStatus } from "../app/utils";
import { EmptyState } from "../components/common/EmptyState";

export function ChannelsPage({
  settingsDraft,
  channelStatusById,
  isBusy,
  onOpenAddChannelModal,
  onOpenEditChannelModal,
  onRemoveChannel,
  onToggleChannelEnabled,
}: {
  settingsDraft: AppSettings;
  channelStatusById: Record<string, ChannelConnectionStatus>;
  isBusy: boolean;
  onOpenAddChannelModal: () => void;
  onOpenEditChannelModal: (channel: ChannelConfig) => void;
  onRemoveChannel: (channelId: string) => void;
  onToggleChannelEnabled: (channel: ChannelConfig) => void;
}) {
  return (
    <section className="settings-layout channels-layout">
      <article className="settings-panel channels-panel">
        <div className="pane-header">
          <div>
            <h1>渠道</h1>
            <p>管理外部消息接入</p>
          </div>
          <button className="ghost-button icon-text-button" onClick={onOpenAddChannelModal}>
            <AddIcon fontSize="small" />
            添加渠道
          </button>
        </div>

        {settingsDraft.channels.length === 0 ? (
          <EmptyState title="暂无渠道" description="添加 TelegramBot 后，消息会在左侧消息列表中出现。" />
        ) : (
          <div className="channel-stack">
            {settingsDraft.channels.map((channel) => {
              const channelStatus = channelStatusById[channel.id] ?? null;
              const rowStatus = getChannelRowStatus(channel, channelStatus);
              return (
                <div className="channel-row" key={channel.id}>
                  <div className="channel-row-name">
                    <strong>{channel.name.trim() || "TelegramBot"}</strong>
                  </div>
                  <div className="channel-row-type">{describeChannel(channel.type)}</div>
                  <div className="channel-row-status" data-status={rowStatus.tone}>
                    <span>{rowStatus.label}</span>
                    {rowStatus.description ? <small>{rowStatus.description}</small> : null}
                  </div>
                  <button
                    className={channel.enabled ? "channel-enable-pill active" : "channel-enable-pill"}
                    onClick={() => onToggleChannelEnabled(channel)}
                    disabled={isBusy}
                    aria-pressed={channel.enabled}
                  >
                    {channel.enabled ? "启用中" : "已暂停"}
                  </button>
                  <button className="ghost-button icon-text-button" onClick={() => onOpenEditChannelModal(channel)}>
                    <EditIcon fontSize="small" />
                    编辑
                  </button>
                  <button
                    className="ghost-button icon-only-button subtle-danger"
                    onClick={() => onRemoveChannel(channel.id)}
                    aria-label="删除渠道"
                    title="删除渠道"
                  >
                    <DeleteIcon fontSize="small" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}
