# Node.js 客户端实现蓝图

该客户端作为 SIP UAS 注册到 Asterisk，自动接听来电，并通过 RTPEngine 与 Coze WebRTC 服务建立媒体桥接。以下为建议的模块化设计与关键流程。

## 模块分层

- config/ 配置管理
  - 读取环境变量与密钥（SIP 账户、Asterisk 地址、Coze Token、RTPEngine 控制接口）。
- sip/ SIP 信令层
  - 库选择：
    - drachtio + drachtio-srf（强大、可扩展，需部署 drachtio server）；或
    - node.js-sip（轻量，直接处理 SIP over UDP/TCP）；或
    - 对接 Asterisk 走 UDP/TCP；若需 WSS，可引入 ws 层或改为 drachtio 模式。
  - 功能：REGISTER/OPTIONS 保活、INVITE/ACK/BYE 处理、SDP 读写。
- coze/ Coze API 客户端
  - 认证与会话管理：启动/关闭实时语音会话，交换 WebRTC SDP/ICE/DTLS 参数。
  - 错误处理与重试：令牌过期、网络抖动。
- rtpengine/ 控制接口
  - 与 RTPEngine 通信（HTTP/UDP/Unix Socket，根据部署），申请/更新/释放媒体会话。
  - SDP 修饰：为 SIP 侧/Coze 侧生成各自的 SDP（候选地址、编解码器约束）。
- core/ 呼叫编排
  - 呼叫状态机：Ringing → Answered → Bridged → Terminating。
  - 超时与回退策略：SDP 协商失败、ICE 失败、DTLS 失败、TURN 不可用。
- telemetry/ 观测
  - 指标与日志：事件循环延迟、SIP 与媒体 QoS 指标、失败率。

## 关键流程（呼入）
1. SIP 层收到 INVITE → 回复 100 Trying。
2. Coze 客户端：启动会话，获取 WebRTC SDP Offer。
3. RTPEngine：申请会话，生成 SIP 侧 SDP（G.711、RTP）与 WebRTC 侧 SDP（Opus、SRTP/ICE）。
4. SIP 层：构造 200 OK，SDP 指向 RTPEngine 的 SIP 侧媒体端口。
5. Coze：完成与 RTPEngine 的 ICE/DTLS 协商，建立 SRTP。
6. 媒体桥接：RTPEngine 进行 SRTP 解密与 Opus ↔ G.711 转码，媒体流稳定后 SIP ACK 完成。
7. BYE：收到任一侧终止 → 通知对端、关闭 Coze 会话、释放 RTPEngine 资源。

## 错误处理
- SDP 协商失败：回落为 488 Not Acceptable Here 或 500 Server Internal Error，并记录详细信息。
- SRTP/DTLS 失败：尝试重协商；超过阈值则挂断并告警。
- TURN 失败：切换备用 TURN；必要时降级策略；同时上报运维。

## 配置（环境变量建议）
- SIP_*：SIP 用户名、密码、Asterisk 地址与端口。
- COZE_*：API 基址、PAT/Token、模型/空间标识。
- RTPE_*：控制接口地址、超时、编解码器策略。
- TLS_*：证书路径（若启用 WSS/TLS）。

## 安全
- 所有机密存储于 Vault/KMS/Secrets Manager。
- 严格最小权限、证书定期轮换、日志脱敏。

## 观测与调试
- 指标：P50/P95 延迟、抖动、丢包、RTPEngine 转码 CPU 使用率。
- 日志：按呼叫 ID 关联 SIP 与媒体事件，便于故障回溯。

该蓝图与 docs/architecture-plan.md、docs/srs.md 相互呼应，可作为阶段 II 的实现参考。
