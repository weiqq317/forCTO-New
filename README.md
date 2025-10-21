# 高性能 SIP 客户端与 Coze WebRTC 实时语音服务集成

本项目为“高性能 SIP 客户端与 Coze WebRTC 实时语音服务集成”架构与开发规划的文档仓库。目标是实现一个基于 Node.js 的 SIP 客户端，注册到 Asterisk，自动接听并桥接至 Coze 的 WebRTC 实时语音服务，通过 RTPEngine 实现 SRTP/RTP 安全桥接与编解码器转码（Opus ↔ G.711）。

- 📚 文档索引：见 docs/README.md，涵盖所有架构、实现与运维文档
- 🧱 系统架构与技术路线：见 docs/architecture-plan.md
- 🧭 软件开发规划（SDLC）：见 docs/sdlc-plan.md
- 📄 软件需求说明书（SRS）：见 docs/srs.md
- 🛠️ Node.js 客户端实现蓝图与集成细节：见 docs/node-client-blueprint.md、docs/rtpengine-control-protocol.md 等
- 🗂️ 示例配置：见 config-samples/（Asterisk、RTPEngine、CoTURN），详情参阅 config-samples/README.md
- 🔐 环境变量模板：见 .env.sample

分支：feat/sip-asterisk-coze-webrtc-rtpengine-architecture-plan

注意：当前仓库提供规划与文档，应用代码将在后续迭代中根据 SDLC 计划逐步引入（阶段 II 起）。
