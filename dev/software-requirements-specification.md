# 软件需求说明书（SRS）

**项目名称**：SIP 客户端与 Coze WebRTC 实时语音服务集成  
**版本**：v1.0  
**发布日期**：2025-10-22  
**作者**：系统分析团队

---

## 1. 引言

### 1.1 编写目的

本 SRS 衡量 SIP 智能客服软件的完整功能、接口、性能与约束条件，作为项目研发、测试、运维的统一基准。读者包括产品经理、系统架构师、开发工程师、QA、运维团队及第三方合作伙伴。

### 1.2 系统范围

- 构建一个可注册到 Asterisk PBX 的 SIP User Agent Server (UAS)。
- 自动接听来电并桥接至 Coze WebRTC 实时语音服务，实现 AI 语音客服。
- 提供可配置、可监控、可扩展的企业级实时通信能力。

### 1.3 定义、缩略语与缩写

| 缩写 | 全称 | 说明 |
| --- | --- | --- |
| SIP | Session Initiation Protocol | 会话发起协议 |
| RTP/SRTP | (Secure) Real-time Transport Protocol | 实时传输（安全）协议 |
| DTLS | Datagram Transport Layer Security | 基于 UDP 的 TLS |
| ICE | Interactive Connectivity Establishment | 交互式连接建立 |
| UAS | User Agent Server | SIP 用户代理服务器 |
| PAT | Personal Access Token | Coze 平台访问令牌 |

### 1.4 参考文档

- 《SIP 客户端与 Coze WebRTC 实时语音服务集成架构与开发规划报告》
- 《产品需求文档（PRD）》
- Coze API 文档、Asterisk 官方文档、RTPEngine 控制接口手册

### 1.5 文档概览

- 第 2 章：系统总体描述与环境假设
- 第 3 章：系统功能需求（分模块）
- 第 4 章：外部接口需求
- 第 5 章：系统属性（性能、安全、可用性等）
- 第 6 章：其他需求与附录

---

## 2. 总体描述

### 2.1 产品透视

该系统位于 Asterisk PBX 与 Coze WebRTC 服务之间，承担信令编排与媒体桥接指挥角色：

- 向 Asterisk 注册分机，接收来电。
- 与 Coze API 交互，发起 WebRTC 会话。
- 控制 RTPEngine 完成媒体转换与 NAT 穿越。

### 2.2 系统功能概览

- SIP 注册与保活
- 自动接听与呼叫状态管理
- Coze 会话管理（创建、续租、结束）
- 媒体会话编排（SDP 改写、转码控制）
- 监控、日志与告警
- 配置与密钥管理

### 2.3 用户类别与特征

| 用户类别 | 描述 | 技术熟悉度 |
| --- | --- | --- |
| 系统管理员 | 负责部署与配置 | 高 |
| 呼叫中心运营 | 配置业务流程、监控指标 | 中 |
| QA 工程师 | 设计测试与验收 | 中 |
| AI 策略团队 | 设计脚本、监控 AI 效果 | 中 |

### 2.4 运行环境

- **操作系统**：Linux (Ubuntu 22.04 LTS 或同级)
- **运行时**：Node.js 20.x LTS
- **依赖组件**：Asterisk 20 LTS、RTPEngine 最新稳定版、COTURN、Redis（可选）
- **部署**：容器化/Kubernetes 优先，亦可采用裸机/VM
- **网络**：IPv4/IPv6，具备公网 IP 或 1:1 NAT，开放 UDP 端口 49152-65535（可配置）

### 2.5 设计与实现约束

- 必须遵从企业安全策略（TLS、证书轮换、访问控制）。
- 必须兼容 Asterisk PJSIP；不允许修改核心 PBX 逻辑。
- 媒体处理不得在 Node.js 主线程执行。
- 必须满足 WebRTC 规范（SRTP、ICE、DTLS）。

### 2.6 假设与依赖

- Coze 提供稳定 API、PAT 管理与 WebRTC 支持。
- 运维团队可提供 TURN 服务器与证书管理。
- 客户网络允许必要的端口转发。

---

## 3. 系统功能需求

每个功能模块均包含触发条件、业务规则、异常处理与验收标准。

### 3.1 F-01：SIP 注册与保活

- **说明**：客户端使用 PJSIP 协议注册至 Asterisk。
- **输入**：SIP 用户名、密码、域、服务器地址、端口。
- **处理**：
  - 启动时发送 REGISTER。
  - 设置注册周期（默认 3600s），在 80% 生命周期时续订。
  - 维护 OPTIONS/keepalive。
- **输出**：注册成功状态、失败告警。
- **异常处理**：
  - 注册被拒绝 → 重试 3 次并告警。
  - 服务器不可达 → 触发后备服务器。
- **验收标准**：在模拟网络丢包 5% 情况下仍能保持注册不掉线。

### 3.2 F-02：自动应答与呼叫建立

- **说明**：处理 Asterisk 转发的 INVITE，自动应答。
- **流程**：
  1. 收到 INVITE → 立即响应 `100 Trying`。
  2. 调用 Coze API 生成会话 → 获取 SDP。
  3. 向 RTPEngine 请求媒体桥接，获取 SIP 侧和 WebRTC 侧候选。
  4. 发送 `200 OK`（包含 SIP 侧 SDP）→ 等待 ACK。
- **业务规则**：
  - 响铃时长可配置（默认 1s）。
  - 若 Coze 会话创建失败 → 返回 `480 Temporarily Unavailable`。
- **验收标准**：平均响应时间 ≤ 2 秒；呼叫建立成功率 ≥ 98%。

### 3.3 F-03：媒体会话编排

- **说明**：负责 Node.js 与 RTPEngine 的交互，完成媒体路径建立。
- **处理步骤**：
  - 发起 `offer` 命令（SIP 端 SDP）→ 获得桥接信息。
  - 将 RTPEngine 返回的 SDP 写入 200 OK。
  - Coze 侧使用 `answer` 命令完成 WebRTC 侧协商。
  - 通话结束时发送 `delete` 释放资源。
- **验收标准**：
  - RTPEngine 建立媒体桥接平均耗时 ≤ 300 ms。
  - 支持并发至少 200 路桥接。

### 3.4 F-04：会话生命周期管理

- **说明**：确保 SIP、Coze 与 RTPEngine 状态同步。
- **事件**：INVITE、ACK、UPDATE、BYE、CANCEL。
- **动作**：
  - BYE → 通知 Coze 结束会话，调用 RTPEngine `delete`。
  - CANCEL → 停止尚未完成的媒体请求。
- **验收标准**：任何异常终止需在 5 秒内完成资源清理。

### 3.5 F-05：监控与告警

- **指标**：注册状态、呼叫并发、延迟、抖动、丢包、错误率。
- **日志**：SIP 信令、Coze API 调用、RTPEngine 控制、系统事件。
- **告警规则**：
  - 注册失败率 > 2%（5 分钟窗口）
  - 延迟 > 120 ms（连续 3 个采样周期）
  - RTPEngine 资源耗尽（利用率 > 85%）

### 3.6 F-06：配置与密钥管理

- **需求**：
  - 支持多环境配置（DEV/STG/PROD）。
  - 敏感信息通过 Vault/KMS 管理。
  - 配置变更需记录审计。

### 3.7 F-07：扩展与接口

- 预留 REST API 提供通话状态查询、指标导出。
- 预留 Webhook 机制（未来转人工/业务系统）。

---

## 4. 外部接口需求

### 4.1 SIP 接口

- **协议**：SIP/UDP、SIP/TCP、可选 SIP/TLS。
- **端口**：默认 5060 (UDP/TCP)，5061 (TLS)。
- **消息**：REGISTER、INVITE、ACK、BYE、CANCEL、OPTIONS。
- **SDP**：遵循 RFC 8866，支持 G.711 A-law/µ-law。

### 4.2 RTPEngine 控制接口

- **协议**：UDP/TCP JSON，或 UNIX Domain Socket（推荐）。
- **命令**：`offer`、`answer`、`delete`、`query`。
- **参数**：Call-ID、from-tag、to-tag、SDP、ICE 配置、转码策略。
- **响应**：JSON 包含媒体端口、编解码器、ICE 候选。

### 4.3 Coze API 接口

- **认证**：PAT / OAuth2。
- **端点**：
  - `POST /v1/realtime/sessions`（创建会话）
  - `DELETE /v1/realtime/sessions/{id}`（终止）
  - WebSocket/WSS 信令通道
- **数据格式**：JSON + SDP Offer/Answer。

### 4.4 运维/监控接口

- **指标暴露**：Prometheus `/metrics`。
- **日志收集**：Loki/ELK 兼容的 JSON 日志。
- **管理接口**：健康检查 `/healthz`、就绪 `/readyz`。

---

## 5. 系统属性

### 5.1 性能需求

| 指标 | 目标 | 测试场景 |
| --- | --- | --- |
| 呼叫建立成功率 | ≥ 98% | 200 并发呼叫压测 |
| 平均媒体延迟 | ≤ 150 ms | 运营商网络延迟 60 ms 场景 |
| 抖动 | ≤ 30 ms | 模拟 NAT、网络抖动 |
| 资源利用率 | CPU ≤ 70%，内存 ≤ 65% | 200 并发场景 |

### 5.2 安全需求

- 所有外部接口需使用 TLS1.2 及以上。
- SRTP/DTLS 强制启用，禁止明文媒体流。
- PAT、证书需支持自动轮换与吊销。
- 系统提供角色访问控制（管理员、只读、观察者）。
- 关键操作（配置、重启）记录审计日志。

### 5.3 可用性与可靠性

- 年度可用性 ≥ 99.99%；
- 支持热升级与滚动发布，单节点故障不影响整体服务；
- 节点支持无状态部署，通过共享存储/缓存维护会话信息；
- 提供自动重试、重连、降级策略。

### 5.4 可维护性

- 代码遵循统一规范（ESLint、Prettier）；
- 提供单元测试（≥ 70% 覆盖）、集成测试、端到端测试；
- 文档化配置项、API、流程；
- 支持灰度发布、功能开关。

### 5.5 可移植性与扩展性

- 支持 Docker 容器部署；
- 与云平台（AWS/GCP/Azure）兼容；
- 轻量化设计，支持多地域部署；
- 媒体网关层可水平扩展。

---

## 6. 其他需求

### 6.1 合规与隐私

- 符合 GDPR/本地隐私法规；
- 对录音、转写提供脱敏与加密存储；
- 依据保留策略（默认 180 天）进行归档与删除。

### 6.2 国际化

- 语音编解码支持多语种；
- 可根据 Coze AI 配置多语言脚本。

### 6.3 灾备

- 跨可用区部署；
- 定期演练 RTPEngine、Coze 故障时的恢复流程；
- 关键配置与证书备份。

---

## 7. 用例说明（示例）

### 用例 UC-01：自动接听并建立 AI 会话

- **参与者**：Asterisk、Node.js 客户端、Coze、RTPEngine
- **前置条件**：注册成功；Coze token 有效；RTPEngine 正常运行
- **主场景**：
  1. Asterisk 向 Node.js 发送 INVITE
  2. Node.js 回复 `100 Trying`
  3. Node.js 调用 Coze API 创建会话
  4. Node.js 调用 RTPEngine `offer`
  5. Node.js 回复 `200 OK`
  6. Asterisk 发送 ACK，媒体开始流动
  7. Coze 与 RTPEngine 完成 DTLS 握手，AI 与用户对话
- **后置条件**：会话元数据记录在监控系统
- **扩展**：若 Coze API 失败 → Node.js 回复错误并释放资源

### 用例 UC-02：通话结束与资源回收

- **主场景**：
  1. Asterisk/用户发送 BYE
  2. Node.js 回复 200 OK
  3. Node.js 通知 Coze 结束会话
  4. Node.js 调用 RTPEngine `delete`
  5. 更新监控指标

---

## 8. 附录

- **数据字典**：
  - `call_id`：字符串，SIP 会话唯一标识
  - `coze_session_id`：字符串，Coze 会话标识
  - `rtp_bridge_id`：字符串，RTPEngine 会话标识
- **网络端口清单**：
  - Node.js 应用：HTTP 8080（API）、HTTPS 8443（可选）
  - RTPEngine 控制端口：默认 22222（可配置）
  - RTPEngine 媒体端口：UDP 49152-65535
  - TURN 端口：TCP/UDP 3478，TLS 5349

> 本 SRS 为项目基线文档，任何需求变更需按照变更管理流程评审与更新。