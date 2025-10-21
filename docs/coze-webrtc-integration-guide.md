# Coze WebRTC 集成指引（通用框架）

说明：Coze 平台的具体 API/参数名称以官方文档为准。本文提供与 RTPEngine/Node.js 协作的通用流程与注意事项。

## 1. 目标
- 在接听到来电后，通过 Coze 的实时语音能力建立 WebRTC 会话，并将媒体桥接到 RTPEngine，实现 SIP ↔ WebRTC 互通。

## 2. 会话生命周期（典型）
1) 创建会话（HTTP API）
- Authorization：Bearer <Personal Access Token>
- 请求体：
  - 模型/空间 ID（可选，取决于平台定义）
  - 媒体参数：偏好 `opus`、`rtcp-mux`、`BUNDLE`、`ICE trickle`
  - TURN 参数（如由 Coze 侧分发）
- 响应：
  - WebRTC SDP Offer（或指引使用 WSS 开启 SDP 交换）
  - 会话 ID（用于后续结束/查询）

2) SDP/ICE 交换
- 将 RTPEngine 生成/修饰的 WebRTC 侧 SDP 与 ICE 候选返回给 Coze；
- 支持 Trickle ICE 的情况下，按需增量发送候选；
- 验证 DTLS 指纹与协商的 `setup`（actpass/passive）角色。

3) 会话维持
- 心跳/保活（如平台要求）；
- 对错误事件（ICE 断开、DTLS 失败）进行重协商或结束处理。

4) 结束会话
- 接收到 SIP BYE 或本端挂断时：
  - 调用 Coze API 结束会话（传入会话 ID）。
  - 向 RTPEngine 发送 `delete` 释放媒体。

## 3. 安全与鉴权
- 使用 PAT/Token 进行 HTTP/WSS 鉴权；避免在日志中输出 Token。
- 若使用 WSS 作为信令通道，确保证书链与域名校验正确。

## 4. 日志与追踪
- 以 `call-id` 作为主关联 ID，将 SIP/RTPEngine/Coze 的关键日志打点关联，便于排障。

## 5. 注意事项
- WebRTC 编解码器以 `opus` 为主，采样率 48k；SIP 侧多为 G.711 8k，转码开销由 RTPEngine 负责。
- Coze 提供的 TURN 服务器（如有）与自建 CoTURN 的策略需统一；避免双重中继造成延迟上升。
- 若 Coze 支持服务端录音/转写，可考虑在 Coze 端完成，减少媒体回传链路。
