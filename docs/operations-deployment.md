# 运维与部署建议（Asterisk / RTPEngine / CoTURN）

本文档提供最小可行部署建议与示例配置片段（见 config-samples/）。请根据实际环境进行加固与优化。

## 1. 网络与防火墙
- 建议 1:1 NAT（公网 IP ↔ 私网主机）或公网直连。
- 放行端口（示例，按需调整）：
  - SIP：UDP 5060（或 TCP/TLS/WS/WSS 对应端口），WSS 建议走 443。
  - 媒体：UDP 49152–65535（Asterisk/RTPEngine），根据部署范围减少暴露面。
  - TURN：UDP/TCP 3478、5349（TLS），中继 UDP 端口范围（参考 CoTURN 配置）。

## 2. Asterisk（PJSIP）
- 启用 PJSIP，配置传输（UDP/TCP/TLS/WS/WSS），建议 WSS 以便浏览器或 WebRTC 相关组件使用。
- 在 extensions.conf 中将来电路由到 Node.js 客户端的分机。
- directmedia 建议关闭，由 RTPEngine 统一中继媒体。

## 3. RTPEngine
- 功能：
  - SRTP ↔ RTP 转换，DTLS 终止，SDP 修饰。
  - Opus ↔ G.711 转码。
  - ICE/STUN/TURN 支持（TURN 由独立 CoTURN 提供更高可用性）。
- 建议：
  - 独立部署（多网卡模式）：外网口用于 WebRTC，内网口用于 Asterisk。
  - CPU 调优：为转码与加解密预留核心；开启多进程与绑定 CPU。
  - 日志与统计：开启详细统计，便于容量规划与 QoS 监控。

## 4. CoTURN（STUN/TURN）
- 建议独立部署，启用长时凭证机制（long-term credentials），配合监控与限速策略。
- 尽量启用 TLS（5349），并合理规划中继端口范围，配合防火墙放行。

## 5. 证书与机密管理
- DTLS/SRTP 证书：妥善管理签发与轮换，避免过期导致通话失败。
- API Token/密码：使用 Vault/KMS/Secret Manager，避免平面文本存储。

## 6. 监控与告警
- Asterisk：注册状态、通话并发、失败率。
- RTPEngine：呼叫并发、PPS、转码负载、延迟与抖动。
- CoTURN：中继使用率、失败率、带宽与端口耗尽情况。

## 7. 配置示例
参见 config-samples/ 目录：
- Asterisk：pjsip.conf、extensions.conf
- RTPEngine：rtpengine.conf（示例）
- CoTURN：turnserver.conf（示例）

以上配置需结合实际公网/内网地址、证书、口令和容量规划进行调整。
