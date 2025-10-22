# SIP 客户端与 Coze WebRTC 实时语音服务集成架构与开发规划报告

**版本**：v1.0  
**作者**：项目管理办公室（PMO）  
**发布日期**：2025-10-22  
**适用范围**：面向 SIP 智能客服系统项目的全体干系人（管理、研发、运维、测试、供应商）

---

## 文档修订记录

| 版本 | 日期 | 作者 | 说明 |
| --- | --- | --- | --- |
| v1.0 | 2025-10-22 | PMO | 首次发布 |

---

## 目录

1. [项目概述](#项目概述)
2. [最佳系统架构与技术路线（问题1）](#最佳系统架构与技术路线问题1)
   1. [核心架构挑战](#核心架构挑战)
   2. [建议的三层解耦架构概览](#建议的三层解耦架构概览)
   3. [信令与媒体流时序（呼入场景）](#信令与媒体流时序呼入场景)
3. [技术栈评估与选择（问题2）](#技术栈评估与选择问题2)
   1. [Nodejs 角色与限制](#nodejs-角色与限制)
   2. [推荐技术栈策略](#推荐技术栈策略)
   3. [替代技术栈考量](#替代技术栈考量)
4. [媒体平面管理与 RTP 策略（问题3）](#媒体平面管理与-rtp-策略问题3)
   1. [RTPEngine 的必要性分析](#rtpengine-的必要性分析)
   2. [RTPEngine 在系统中的职责](#rtpengine-在系统中的职责)
   3. [部署要求与性能基准](#部署要求与性能基准)
5. [软件开发总体规划（问题4）](#软件开发总体规划问题4)
   1. [SDLC 模型与里程碑](#sdlc-模型与里程碑)
   2. [阶段性交付计划](#阶段性交付计划)
   3. [资源与角色分配](#资源与角色分配)
   4. [风险评估与缓解策略](#风险评估与缓解策略)
6. [软件需求说明书（SRS）关键要素（问题5）](#软件需求说明书srs关键要素问题5)
   1. [整体描述](#整体描述)
   2. [功能性需求（FRs）](#功能性需求frs)
   3. [非功能性需求（NFRs）](#非功能性需求nfrs)
   4. [接口需求](#接口需求)
   5. [数据与配置需求](#数据与配置需求)
7. [运维、可观测性与合规要求](#运维可观测性与合规要求)
8. [附录](#附录)

---

## 项目概述

本项目旨在构建一款高性能 SIP 智能客服客户端。该客户端通过 PJSIP 协议注册到 Asterisk PBX，自动接听来电，并将语音会话桥接至 Coze 的 WebRTC 实时语音 AI 服务，实现全自动语音交互与业务流程自动化。系统需具备高可用性、低延迟和优异的网络穿越能力，满足企业级部署需求。

---

## 最佳系统架构与技术路线（问题1）

### 核心架构挑战

1. **信令协议不兼容**：Asterisk 使用传统 SIP over UDP/TCP；Coze WebRTC 侧要求 SIP over WSS 或基于 DTLS-SRTP/ICE 的信令。
2. **媒体加密差异**：WebRTC 强制 SRTP，Asterisk 侧常见 RTP 或 SRTP/SDES。需要安全桥接与密钥管理。
3. **NAT 穿越复杂度**：WebRTC 依赖 ICE/STUN/TURN，需专业媒体代理支撑不同 NAT 类型。
4. **编解码器差异**：Asterisk 侧偏好 G.711/G.729，WebRTC 侧推荐 Opus。必须支持实时转码。

这些挑战决定单一组件无法同时满足信令编排与高性能媒体处理的需求，必须实施解耦架构。

### 建议的三层解耦架构概览

| 层级 | 组件 | 关键职责 | 协议/接口 | 备注 |
| --- | --- | --- | --- | --- |
| 核心信令 / PBX | **Asterisk (PJSIP)** | 注册、呼叫路由、与 PSTN/SIP 中继对接 | SIP/UDP、SIP/TCP、PJSIP | 维持传统电信功能 |
| 应用/信令编排 | **Node.js 客户端** | 自动接听逻辑、Coze API 编排、控制 RTPEngine | SIP over UDP/TCP、WSS、HTTP/REST、WebSocket | 仅处理信令和业务逻辑 |
| 媒体网关 | **RTPEngine** | SRTP/RTP 转换、编解码器转码、ICE/TURN 中继、媒体转发 | RTP/UDP、SRTP/DTLS、ICE、TLS 控制接口 | 卸载所有 CPU 密集任务 |

> 额外组件：COTURN（TURN/STUN 服务器）、Redis（状态缓存，可选）、Prometheus/Grafana（观测）、Kafka（后续扩展）。

### 信令与媒体流时序（呼入场景）

1. **呼叫到达 Asterisk**：Asterisk 拨号计划将 INVITE 路由到 Node.js 注册的分机。
2. **Node.js 自动接听**：处理 INVITE，发送 `100 Trying` 与 `200 OK`，同时发起 Coze 会话。
3. **请求媒体桥接**：Node.js 通过 RTPEngine 控制接口（HTTP/JSON 或 UNIX socket）请求分配媒体资源、ICE 候选。
4. **SDP 协商**：Node.js 修改 SIP SDP 指向 RTPEngine 的 SIP 侧地址；向 Coze 提供 WebRTC 侧 ICE/SDP。
5. **媒体建立**：Coze 与 RTPEngine 完成 DTLS-SRTP 握手；Asterisk 侧 RTP 与 RTPEngine 互通。
6. **实时处理**：RTPEngine 执行 SRTP 解密、RTP 加密、Opus ↔ G.711 转码。
7. **会话结束**：Node.js 处理 BYE，通知 Coze 结束会话，释放 RTPEngine 资源。

---

## 技术栈评估与选择（问题2）

### Nodejs 角色与限制

- **优势**：事件驱动 I/O，适合处理 SIP 信令与 HTTP 调用；生态支持（drachtio、sip.js 等）。
- **限制**：单线程模型不适合 CPU 密集型媒体处理（SRTP 解密、编解码器转码）。若在主线程处理媒体会阻塞事件循环，导致延迟、抖动上升。

### 推荐技术栈策略

1. **Node.js**：专注信令编排、流程控制、Coze API 调度。
2. **RTPEngine**：处理媒体桥接、转码、NAT 穿越，独立部署。
3. **可选 C/C++ 原生插件**：若需自研媒体处理，使用 N-API 绑定至后台线程池。
4. **基础设施**：COTURN（TURN/STUN）、Redis（状态存储）、PostgreSQL（配置管理）、Docker/K8s（部署）。

### 替代技术栈考量

- **Go (Golang)**：高并发、适合媒体处理，自带 Goroutine；可增强未来扩展。
- **Elixir/Erlang (BEAM)**：电信级并发处理、容错卓越。
- **决策建议**：若团队熟悉 Node.js，则保持 Node.js + RTPEngine 组合；如需超大规模并发，可评估 Go/Elixir 方案或混合架构。

---

## 媒体平面管理与 RTP 策略（问题3）

### RTPEngine 的必要性分析

- WebRTC 端强制 SRTP/DTLS；Asterisk 默认 RTP。
- 需在复杂 NAT 环境下保障通话，单纯依赖 Asterisk 无法满足。
- 高并发场景需要无状态媒体代理，防止 PBX 成为瓶颈。

**结论**：RTPEngine 或同等级媒体网关为系统成功的硬性前提。

### RTPEngine 在系统中的职责

1. **NAT 穿越与 TURN 中继**：内置 STUN/TURN 支持，与 COTURN 集成，应对对称 NAT。
2. **安全桥接**：终止 WebRTC 侧 SRTP，转发至 SIP 侧 RTP/SRTP；管理 DTLS 证书与密钥轮换。
3. **编解码器转码**：双向支持 G.711 ↔ Opus，保证不同编解码器之间的兼容。
4. **媒体监控**：提供媒体统计（RTCP、丢包率、延迟），便于 QoS 监测。

### 部署要求与性能基准

- **网络**：提供 1:1 NAT 或公网 IP，开放 UDP 端口（49152-65535 可配置）。
- **性能指标**：
  - 端到端延迟 ≤ 150 ms。
  - 抖动 ≤ 30 ms。
  - 每节点支持目标并发（初期 200 通话，扩展 500+）。
- **高可用**：至少两台 RTPEngine 节点，支持水平扩展与健康检查。

---

## 软件开发总体规划（问题4）

### SDLC 模型与里程碑

采用 **迭代式敏捷（Scrum）+ 阶段性里程碑**：

1. **阶段 I：规划与基础设施**（4 周）
2. **阶段 II：核心信令与 MVP**（6 周）
3. **阶段 III：媒体集成与转码**（8 周）
4. **阶段 IV：测试、优化与部署**（4 周）

### 阶段性交付计划

| 阶段 | 目标 | 关键交付物 | 关键依赖 |
| --- | --- | --- | --- |
| I | 架构落地、环境搭建 | 高级设计、SRS、基础设施清单、Asterisk/RTPEngine 验证环境 | 确认 Coze 认证、网络拓扑 |
| II | 实现信令流与业务编排 | Node.js SIP 客户端 MVP、Coze API 封装、自动接听逻辑、基础监控 | Asterisk 测试账号 |
| III | 媒体桥接与转码 | RTPEngine 联调、SDP 改写模块、Opus↔G.711 转码测试、NAT 穿越方案 | COTURN、SSL 证书 |
| IV | 上线准备 | 性能/压力测试报告、安全审计报告、运维手册、回归测试 | 监控平台、CI/CD |

### 资源与角色分配

| 角色 | 阶段 I | 阶段 II | 阶段 III | 阶段 IV | 总计（人周） |
| --- | --- | --- | --- | --- | --- |
| 项目经理/架构师 | 3 | 4 | 3 | 2 | 12 |
| Node.js / VoIP 开发 | 2 | 6 | 8 | 2 | 18 |
| 运维/网络工程师 | 4 | 3 | 8 | 2 | 17 |
| QA / 测试工程师 | 1 | 3 | 4 | 4 | 12 |

> 资源估算基于 22 周周期，可根据实际团队规模调整。

### 风险评估与缓解策略

| 风险 | 类型 | 影响 | 概率 | 缓解措施 |
| --- | --- | --- | --- | --- |
| Coze API 变更 | 外部依赖 | 中 | 中 | 与 Coze 建立技术对接群，订阅变更通知；设计 API 封装层便于调整 |
| NAT 环境复杂导致媒体失败 | 技术 | 高 | 中 | 提前部署 TURN；在 Stage III 进行多 NAT 场景测试 |
| 编解码器转码性能不足 | 性能 | 高 | 中 | 提前进行性能基准；建立自动扩缩容策略；考虑硬件加速 |
| 证书管理错误导致 SRTP 握手失败 | 运营 | 中 | 低 | 制定证书生命周期管理流程；实现自动更新与预警 |
| Node.js 线程阻塞 | 技术 | 中 | 中 | 使用 worker_threads/N-API offload；控制媒体处理不入主线程 |

---

## 软件需求说明书（SRS）关键要素（问题5）

### 整体描述

- **系统定位**：SIP User Agent Server，通过 PJSIP 注册 Asterisk，承载自动客服逻辑，并对接 Coze WebRTC AI。
- **运行环境**：Linux (Ubuntu 22.04 LTS)，Node.js 20.x，Asterisk 20 LTS，RTPEngine 最新稳定版，COTURN。
- **业务流程概述**：来电 → Asterisk → Node.js 自动接听 → RTPEngine 媒体桥接 → Coze AI 实时对话 → 通话结束 → 资源释放。
- **约束**：Coze 服务需符合标准 WebRTC；系统需部署在低延迟网络；遵守企业安全策略（TLS、密钥管理）。

### 功能性需求（FRs）

| ID | 描述 | 优先级 | 验证方法 |
| --- | --- | --- | --- |
| FR-01 | Node.js 客户端通过 PJSIP 注册 Asterisk，支持自动续订 | 高 | 集成测试、SIP 抓包 |
| FR-02 | 自动接听来电并发送 `200 OK` 响应 | 高 | 功能测试 |
| FR-03 | 成功调用 Coze API，启动实时语音会话并获取 SDP Offer | 高 | 单元测试 + 集成测试 |
| FR-04 | 调用 RTPEngine 控制接口，动态分配媒体会话并修改 SDP | 高 | 集成测试 |
| FR-05 | RTPEngine 提供 G.711 ↔ Opus 双向转码 | 高 | 性能测试、语音质量评估 |
| FR-06 | 通话结束时同步释放 Coze 会话、RTPEngine 资源 | 中 | 功能测试 |
| FR-07 | 对媒体协商失败、SRTP 握手失败等异常提供告警与重试 | 中 | 可靠性测试 |

### 非功能性需求（NFRs）

| 类别 | 指标 | 目标值 | 说明 |
| --- | --- | --- | --- |
| 性能（延迟） | 端到端语音往返延迟 | ≤ 150 ms | 不含 AI 处理时间 |
| 性能（抖动） | 媒体抖动 | ≤ 30 ms 标准差 | 保障语音质量 |
| 可扩展性 | 并发呼叫数 | 初期 ≥ 200，目标 ≥ 500 | 支持水平扩展 |
| 可用性 | 系统可用性 | 99.99% | 年停机 ≤ 52.6 分钟 |
| 安全性 | 媒体加密 | WebRTC 侧强制 SRTP/DTLS；SIP 侧推荐 SRTP/SDES 或 TLS | 符合企业安全策略 |
| 合规性 | 数据保护 | 符合 GDPR/本地隐私法规 | 录音存储策略 |
| 可观测性 | 监控覆盖度 | 100% 核心服务纳入监控 | 指标/日志/追踪 |

### 接口需求

1. **Asterisk 接口**：PJSIP 注册、INVITE/ACK/BYE 信令；使用 TLS/WSS 可选。
2. **RTPEngine 控制接口**：`offer`/`answer`/`delete` 命令（可用 REST/JSON 或 Unix Socket JSON）。
3. **Coze API**：认证（PAT）、会话管理、WebRTC SDP 交换；需支撑 TLS 1.2+。
4. **监控/告警接口**：Prometheus 指标、Alertmanager 告警、Grafana 看板。

### 数据与配置需求

- **配置集中化**：使用环境变量 + 配置文件（YAML/JSON），通过 HashiCorp Vault 或 KMS 管理敏感信息。
- **状态存储**：
  - 注册与会话状态可缓存于 Redis（选项）。
  - 日志/审计：ELK Stack 或 Loki。
- **证书管理**：DTLS/SSL 证书统一由运维团队管理，支持自动更新。

---

## 运维、可观测性与合规要求

1. **部署策略**：建议采用容器化（Docker/Kubernetes），支持滚动升级与蓝绿发布。对关键服务启用 HPA 自动扩展。
2. **监控体系**：
   - 指标：CPU、内存、网络、RTT、丢包率、注册状态、并发通话数。
   - 日志：SIP 信令日志、RTPEngine 媒体日志、Coze API 调用日志。
   - 追踪：可选接入 OpenTelemetry，实现端到端链路跟踪。
3. **告警规则**：
   - 延迟 > 120 ms 持续 5 分钟。
   - 媒体丢包率 > 3%。
   - 注册失败率 > 2%。
4. **安全与合规**：
   - 所有 API 调用需使用 HTTPS/TLS。
   - 对录音/日志进行脱敏与加密存储。
   - 身份认证采用 OAuth2 或 PAT 轮换机制。

---

## 附录

1. **术语表**
   - **SRTP**：Secure Real-time Transport Protocol，安全实时传输协议。
   - **DTLS**：Datagram Transport Layer Security，为 UDP 通信提供安全保障。
   - **ICE**：Interactive Connectivity Establishment，交互式连接建立协议。
   - **TURN/STUN**：Traversal Using Relay NAT / Session Traversal Utilities for NAT。
   - **SDP**：Session Description Protocol，会话描述协议。

2. **参考文献与标准**
   - RFC 3261 - SIP: Session Initiation Protocol
   - RFC 3711 - The Secure Real-time Transport Protocol (SRTP)
   - RFC 5764 - SRTP for DTLS
   - RFC 7587 - RTP Payload Format for the Opus Speech Codec
   - WebRTC 1.0: Real-Time Communication Between Browsers (W3C Recommendation)

---

**结论**：通过实施三层解耦架构（Asterisk + Node.js + RTPEngine）、严格的媒体平面管理以及明确的开发计划和 SRS，要实现 SIP 与 Coze WebRTC 的深度集成是可行且可控的。项目团队需遵循本报告的架构原则、开发路线与风险管控策略，以确保系统在高并发、低延迟和高可靠性方面达到企业级标准。