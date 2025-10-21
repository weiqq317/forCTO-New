# 软件需求说明书（SRS）

## 1. 简介
本 SRS 定义了“高性能 SIP 客户端与 Coze WebRTC 实时语音服务集成”的功能与非功能性需求。系统通过 Node.js 进行信令与业务编排，连接 Asterisk（PBX）与 Coze（WebRTC），媒体平面由 RTPEngine 负责安全桥接与转码。

## 2. 整体描述
### 2.1 系统上下文
- 角色与边界：
  - Asterisk：核心 PBX/注册器，负责来电路由与会话控制。
  - Node.js 客户端：SIP UAS，自动接听，编排 Coze API 与 RTPEngine。
  - RTPEngine：媒体代理，SRTP ↔ RTP 转换、Opus ↔ G.711 转码、ICE/TURN 中继。
  - Coze：WebRTC 实时语音服务，提供 AI 语音交互能力。

### 2.2 假设与约束
- Coze 遵循 WebRTC 规范，支持 ICE/STUN/TURN 与 Opus。
- 部署网络满足低延迟与低抖动要求；防火墙/NAT 正确放行媒体端口。
- 采用集中式机密管理（KMS/Secret Manager）存储访问凭证。

## 3. 功能性需求（FRs）
| ID | 名称 | 需求描述 |
|---|---|---|
| FR-01 | SIP 注册与保活 | 使用 PJSIP 向 Asterisk 注册，自动续订 REGISTER，支持 OPTIONS 保活 |
| FR-02 | 自动化呼叫接收 | 收到 INVITE 自动返回 100 Trying 与 200 OK，无人工介入 |
| FR-03 | Coze 会话启动 | 接受呼叫后通过 Coze API 启动实时会话，获取 WebRTC SDP/ICE 参数 |
| FR-04 | 媒体桥接编排 | 指示 RTPEngine 建立桥接，修改 SIP/Coze 侧 SDP 以指向 RTPEngine |
| FR-05 | 编解码器转码 | 强制支持 G.711 ↔ Opus 的双向转码，保证兼容与质量 |
| FR-06 | 呼叫终止同步 | 处理 BYE，并调用 Coze API 终止会话，释放 RTPEngine 资源 |
| FR-07 | 媒体协商错误处理 | 识别并处理 SDP 失败、DTLS/SRTP 失败、TURN 失败，提供重试与告警 |

## 4. 非功能性需求（NFRs）
| 类别 | 指标 | 目标阈值 | 说明 |
|---|---|---|---|
| 延迟 | 端到端语音 | 平均 ≤ 150 ms | 保障对话自然流畅 |
| 抖动 | 到达间隔抖动 | ≤ 30 ms（标准差） | 防止音频断续与失真 |
| 并发 | 活跃呼叫数 | 目标 N（如 500） | 容量规划依据 |
| 安全 | 媒体加密 | WebRTC 端强制 DTLS-SRTP；SIP 侧建议 SRTP/SDES 或 TLS | 满足公网安全 |
| 可用性 | 运行时间 | 99.99% | 24/7 服务保障 |
| 网络穿越 | NAT 支持 | STUN/TURN（对称 NAT 可连通） | 复杂网络环境可达性 |

## 5. 约束与合规
- 合规：遵循相关电信与数据保护法规（根据部署地域而定）。
- 证书与密钥：DTLS/SRTP 证书生命周期管理、轮换策略、最小权限访问。

## 6. 监控与告警（验收相关）
- 指标：P50/P95/P99 延迟、抖动、丢包率、RTPEngine/Turn 负载、Node.js 事件循环延迟。
- 告警：媒体路径不可达、注册失败、ICE 失败、转码故障、令牌过期。

## 7. 交付与验收
- 文档：架构、运维、故障排除指南。
- 用例：呼入自动接听、媒体打通、转码验证、挂断释放、异常恢复。
- 达标：NFR 指标达到目标阈值，核心 FRs 全部通过。
