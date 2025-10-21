# 示例配置说明

本目录提供 Asterisk、RTPEngine、CoTURN 等组件的基础配置示例，便于快速搭建联调环境。所有配置需根据实际的公网/内网地址、证书、口令以及容量规划进行调整后方可投入使用。

## 目录结构

- `asterisk/`
  - `pjsip.conf`：SIP 传输、终端注册示例。
  - `extensions.conf`：呼入路由至 Node.js UAS 的拨号计划样例。
  - `http.conf`：启用 HTTP/WSS 服务所需的基础配置。
  - `rtp.conf`：RTP 端口范围、ICE 支持等媒体参数。
- `rtpengine/rtpengine.conf`：媒体网关示例，含监听端口、内外网接口、转码配置。
- `coturn/turnserver.conf`：TURN 服务器示例，包含长时凭证、端口范围与日志设置。

## 使用建议

1. **安全**：所有密码、令牌、证书路径需替换为生产级别的强随机值，并配合机密管理方案。
2. **网络**：确保防火墙/NAT 映射与此处定义的端口范围一致；必要时使用 1:1 NAT 或公网直连。
3. **联调**：Asterisk/RTPEngine/CoTURN 建议部署在可监控环境中，结合 `docs/perf-nfrs-validation.md` 做性能基线测试。
4. **版本兼容**：请根据所使用的软件版本对配置语法进行微调，并关注官方升级指南。
