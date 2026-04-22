# MoonChat

本地优先的聊天聚合桌面应用，一期先支持 `Telegram Bot`，并围绕消息沉淀、AI 自动回复、学习任务和分层记忆系统来建设。

## 当前骨架包含

- `Electron + React + TypeScript + Vite` 桌面应用基础结构
- `SQLite + better-sqlite3 + Drizzle ORM` 本地数据层
- Telegram Bot 接入服务骨架
- AI 回复编排服务骨架
- 记忆系统和学习任务的初版 schema
- IPC 接口和桌面端基础仪表盘

## 开发命令

```bash
npm install
npm run dev
```

## 配置方式

这是一个面向终端用户的桌面客户端，业务配置不依赖 `.env`。

- AI 配置在应用内“设置”页填写
- Telegram Bot Token 在应用内“设置”页填写
- 配置会保存在本地 `data/settings.json`

`.env` 不再作为用户配置入口

## 一期目标

- Telegram Bot 收发与本地消息入库
- 会话列表、用户窗口、消息查询
- AI 自动回复开关
- 手动/定时学习聊天记录
- 分层 AI 记忆和用户画像记忆

## 目录结构

```text
electron/
  ipc/
  services/
src/
  components/
  shared/
```

## 下一步建议

1. 安装依赖并启动桌面壳
2. 在应用设置页填写 Telegram Bot token 和 AI 配置
3. 跑通收到消息 -> 入库 -> UI 展示
4. 加入 AI provider 的真实实现
