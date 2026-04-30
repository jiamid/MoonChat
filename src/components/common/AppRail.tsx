import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import ForumIcon from "@mui/icons-material/Forum";
import HubIcon from "@mui/icons-material/Hub";
import LightModeIcon from "@mui/icons-material/LightMode";
import logoSrc from "../../../logo.png";
import type { AppView, ThemeMode } from "../../app/types";

export function AppRail({
  view,
  themeMode,
  onViewChange,
  onThemeModeChange,
}: {
  view: AppView;
  themeMode: ThemeMode;
  onViewChange: (view: AppView) => void;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}) {
  const nextThemeMode = themeMode === "dark" ? "light" : "dark";

  return (
    <aside className="rail">
      <div className="rail-main">
        <div className="brand-mark">
          <img src={logoSrc} alt="MoonChat" className="brand-mark-image" />
        </div>
        <button className={view === "ai" ? "rail-button active" : "rail-button"} onClick={() => onViewChange("ai")}>
          <span className="rail-button-icon" aria-hidden="true">
            <AutoAwesomeIcon fontSize="inherit" />
          </span>
          <span className="rail-button-label">AI</span>
        </button>
        <button className={view === "chat" ? "rail-button active" : "rail-button"} onClick={() => onViewChange("chat")}>
          <span className="rail-button-icon" aria-hidden="true">
            <ForumIcon fontSize="inherit" />
          </span>
          <span className="rail-button-label">消息</span>
        </button>
        <button
          className={view === "channels" ? "rail-button active" : "rail-button"}
          onClick={() => onViewChange("channels")}
        >
          <span className="rail-button-icon" aria-hidden="true">
            <HubIcon fontSize="inherit" />
          </span>
          <span className="rail-button-label">渠道</span>
        </button>
      </div>

      <div className="rail-footer">
        <div
          className="theme-switch"
          data-mode={themeMode}
          onClick={() => onThemeModeChange(nextThemeMode)}
          role="button"
          tabIndex={0}
          aria-label={themeMode === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
          aria-pressed={themeMode === "dark"}
          title={themeMode === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onThemeModeChange(nextThemeMode);
            }
          }}
        >
          <span className="theme-switch-thumb" aria-hidden="true" />
          <span className="theme-switch-option theme-switch-option-light" aria-hidden="true">
            <LightModeIcon fontSize="inherit" />
          </span>
          <span className="theme-switch-option theme-switch-option-dark" aria-hidden="true">
            <DarkModeIcon fontSize="inherit" />
          </span>
        </div>
      </div>
    </aside>
  );
}
