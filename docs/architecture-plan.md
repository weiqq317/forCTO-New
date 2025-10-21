# 高性能 SIP 客户端与 Coze WebRTC 实时语音服务集成架构与开发规划报告

本报告旨在为实现一个 SIP 客户端软件提供全面的技术路线、系统架构、开发规划及软件需求说明书（SRS）。该客户端将对接 Asterisk 实现电话接听功能，并自动桥接至 Coze 的 WebRTC 实时语音服务，实现自动化通话代理功能。

## I. 最佳系统架构和技术路线（问题 1）

要成功实现 Asterisk 经典的 SIP/RTP 环境与 Coze 现代的 WebRTC/SRTP 环境之间的无缝对接，必须采用解耦的高性能三层架构。单一组件（如仅 Asterisk 或仅 Node.js）无法同时高效处理信令、媒体安全和复杂的网络地址转换（NAT）穿越问题。

### 1.1 核心架构挑战：协议栈桥接

项目的核心挑战在于协议栈的不兼容性，这要求在信令和媒体传输层面进行精确的转换和管理：

- 信令转换与传输：Asterisk 主要使用 SIP over UDP/TCP 进行信令传输，而 WebRTC 客户端（包括 Coze 服务）通常要求使用 SIP over WSS 或通过 DTLS-SRTP/ICE 建立连接。应用层必须能够协调这两种信令流。
- 媒体加密强制性：WebRTC 标准强制要求所有媒体流使用 SRTP 加密。传统的 SIP/Asterisk 环境可能使用未加密的 RTP。系统必须在两个协议域之间执行 SRTP 终止、密钥交换和 RTP/SRTP 桥接，以确保媒体的机密性和完整性。
- NAT 穿越的复杂性：WebRTC 严重依赖 ICE、STUN 和 TURN 机制来克服 NAT 限制，实现媒体流的连接。必须引入专用媒体代理来处理 ICE/TURN 流量，确保 Coze 服务可稳定连接。
- 编解码器兼容性：Asterisk 侧通常默认使用 G.711 或 G.729，而 WebRTC 最佳实践与现代服务推荐使用 Opus。强制性的转码能力对于维持媒体连续性至关重要。

### 1.2 建议采用的三层解耦架构

由 Asterisk、Node.js 客户端和高性能媒体网关（RTPEngine）组成：

#### 1.2.1 核心信令/PBX 层（Asterisk）
- 充当核心信令服务器和注册器。
- 职责：
  - SIP 注册管理：接受 Node.js 客户端的 PJSIP 注册请求。
  - 拨号计划执行：根据 extensions.conf 将来电路由到 Node.js 应用的分机号。
  - 对外连接：维护与 PSTN 链路或 SIP 中继的连接。

#### 1.2.2 应用/信令编排层（Node.js 客户端）
- 专注业务逻辑与信令编排，发挥非阻塞 I/O 优势。
- 职责：
  - 自动接听逻辑：接收来自 Asterisk 的 INVITE，触发自动应答。
  - Coze API 管理：HTTP 交互与认证，启动实时语音会话。
  - 媒体代理指令：向 RTPEngine 发送控制指令，分配媒体资源并建立桥接会话。

#### 1.2.3 高性能媒体网关层（RTPEngine）
- 负责所有媒体流量、加密桥接与转码，卸载 CPU 密集型任务。

#### 组件与协议对照

| 组件 | 主要角色 | 关键协议/标准 | 关键功能 |
|---|---|---|---|
| Asterisk PBX | 核心信令服务器/注册器 | SIP/UDP/TCP, PJSIP | 用户注册，拨号计划执行，PSTN/中继接口 |
| 应用客户端 (Node.js) | 自动化逻辑与信令编排 | WSS/SIP, HTTP/Coze API | 自动应答，Coze API 管理，媒体代理指令 |
| 媒体网关 (RTPEngine) | 高性能媒体代理 | RTP/UDP, SRTP/DTLS-SRTP, ICE/TURN | SRTP/RTP 桥接，NAT 穿越，编解码器转码（Opus ↔ G.711） |

### 1.3 详细信令和媒体流链（呼入电话）

1) 呼叫发起与路由：呼叫到达 Asterisk。拨号计划将 SIP INVITE 路由至 Node.js 客户端分机。

2) 客户端信令处理：Node.js（UAS）接收 INVITE，执行自动接听，并：
- 通过 Coze API 启动会话，获取 WebRTC 会话信息。
- 通过控制接口（HTTP 或 Unix Socket）向 RTPEngine 发出请求，分配桥接会话与 ICE 候选。

3) 媒体代理分配：RTPEngine 分配 UDP 端口和 ICE 候选，分别用于 SIP 侧 RTP/G.711 与 WebRTC 侧 SRTP/Opus。

4) SIP 会话建立：Node.js 构建 200 OK，将 SDP 指向 RTPEngine 的 SIP 侧地址与端口。Asterisk 收到后开始向 RTPEngine 发送媒体。

5) Coze WebRTC 集成：Node.js 将 RTPEngine 提供的 WebRTC 侧 SDP/ICE 信息交给 Coze。完成 DTLS-SRTP 密钥交换后，Coze 与 RTPEngine 建立安全媒体流。

6) 实时 AI 处理：RTPEngine 作为中继执行 SRTP 解密与 Opus ↔ G.711 转码，保证 Asterisk 与 Coze 间的实时语音交互。

---

## II. 技术栈评估与选择（问题 2）

### 2.1 Node.js 的适用性与关键限制
- 适用于高并发 I/O：SIP 信令、与 Coze 的 HTTP API 通信。
- 可用库：drachtio、node.js-sip 等。
- 限制：单线程事件循环不适合持续性的媒体处理（SRTP 加解密、编解码器转码），会造成阻塞与抖动，影响实时性。

### 2.2 最终建议：Node.js 用于编排，Go/C++ 用于媒体
- Node.js 仅负责信令、呼叫状态管理与 API 编排。
- 媒体处理完全卸载给 RTPEngine。
- 若需自定义媒体算法，考虑 N-API 绑定 C/C++ 库，在工作线程中执行。

### 2.3 替代技术栈的考量
- Go：Goroutines 并发、低延迟，适合高吞吐与 CPU 密集场景。
- Elixir/Erlang：电信领域成熟，极强并发与容错，适合高可用与水平扩展。
- 选型权衡：结合团队技能与维护成本，Node.js + RTPEngine 是务实选择。

---

## III. 媒体平面管理与 RTP 策略（问题 3）

### 3.1 RTPEngine 的必要性
- 专用媒体网关不可或缺：用于 SRTP/RTP 转换、转码与 NAT 穿越。
- Asterisk 主要负责 PBX/呼叫管理，不适合作为高性能、无状态媒体代理。

### 3.2 RTPEngine 在项目中的核心功能

#### 3.2.1 NAT 穿越与中继（TURN）
- WebRTC 依赖 ICE；在受限网络（如对称 NAT）下需要 TURN 中继。
- 需要部署高性能 STUN/TURN（建议 COTURN），保证低抖动与低延迟。

#### 3.2.2 安全桥接：SRTP/RTP 转换
- WebRTC 端采用 DTLS-SRTP；SIP 端可能为 RTP 或 SDES-SRTP。
- RTPEngine 终止 WebRTC 端 SRTP、解密并转发为 SIP 端 RTP，反向同理。
- 即便 Asterisk 可处理 SRTP，复杂 NAT 与高并发下的性能瓶颈更适合由 RTPEngine 承担。

#### 3.2.3 编解码器转码
- WebRTC 偏好 Opus，SIP 常用 G.711。
- RTPEngine 提供 Opus ↔ G.711 的实时双向转码，确保兼容与音质。

---

## IV. 完整的软件开发规划（问题 4）

采用迭代与增量（Agile/Scrum）模型，分四个阶段，预计总时长约 22 周。

### 阶段 I：规划、需求与基础架构搭建（4 周）
- 产出：架构蓝图、SRS、基础设施准备。
- Asterisk 配置：启用 PJSIP、WSS、SRTP。
- 媒体基础设施：部署 RTPEngine 与 STUN/TURN（COTURN），配置 1:1 NAT、防火墙与媒体端口（如 UDP 49152-65535）。
- Coze API：获取并安全存储 Personal Access Token。

### 阶段 II：核心信令实现与 MVP（6 周）
- SIP 客户端（Node.js）：注册、保活、INVITE 处理。
- 自动应答：收到 INVITE 返回 100 Trying / 200 OK（先用模拟 SDP）。
- Coze API 封装：身份认证、会话启动。
- 媒体编排接口：与 RTPEngine 的会话申请与释放。

### 阶段 III：媒体平面集成与转码（8 周）
- SRTP/RTP 桥接：Node.js + Asterisk + RTPEngine 联调，SDP 正确指向 RTPEngine，完成 DTLS-SRTP。
- Coze WebRTC：与 RTPEngine 联调，确保 Coze ↔ RTPEngine 的 SRTP 媒体流建立。
- 转码测试：验证 Opus ↔ G.711 实时转码质量与稳定性。
- NAT 穿越：在各类 NAT（包含对称 NAT）下验证 STUN/TURN。

### 阶段 IV：测试、优化与部署（4 周）
- 性能基准：并发呼叫负载测试，延迟与抖动符合 NFR。
- 安全审计：DTLS/SRTP 证书与密钥交换验证。
- 文档与培训：操作手册、故障排除、运维交接。
- 分阶段部署：金丝雀发布 → 全量推广。

---

## V. 软件需求说明书（SRS）关键要素（问题 5）

### 5.1 整体描述
- 系统上下文：SIP UAS 应用，通过 PJSIP 注册到 Asterisk，作为媒体信令协调中心；通过 HTTP 与 Coze 通信；利用 RTPEngine 桥接 SIP/RTP 与 Coze WebRTC/SRTP。
- 假设与约束：Coze 遵循 WebRTC 规范（ICE/STUN/TURN、Opus）；系统部署需具备足够带宽与低延迟网络。

### 5.2 功能性要求（FRs）

| ID | 名称 | 需求描述 |
|---|---|---|
| FR-01 | SIP 注册与保活 | 使用指定凭证通过 PJSIP 注册到 Asterisk，并周期性 REGISTER 维持状态 |
| FR-02 | 自动化呼叫接收 | 收到 Asterisk 路由的 INVITE 后自动接听并返回 200 OK，无需人工 |
| FR-03 | Coze 会话启动 | 接受呼叫后使用 Coze API 启动实时语音会话，获取 WebRTC 连接参数（SDP Offer） |
| FR-04 | 媒体桥接编排 | 在信令协商中指示 RTPEngine 建立桥接，修改 SDP 指向 RTPEngine |
| FR-05 | 编解码器转码 | 强制支持 G.711 ↔ Opus 的实时双向转码 |
| FR-06 | 呼叫终止同步 | 处理 BYE，并通知 Coze 终止会话，同时释放 RTPEngine 资源 |
| FR-07 | 媒体协商错误处理 | 识别并处理 SDP 失败、SRTP 密钥交换失败、TURN 失败等关键错误 |

### 5.3 非功能性要求（NFRs）

| 类别 | 要求 | 可接受阈值 | 重要性 |
|---|---|---|---|
| 性能（延迟） | 端到端语音延迟（SIP 终端 ↔ Coze AI） | 平均 ≤ 150 ms | 对话流畅性关键；> 250 ms 将严重影响体验 |
| 性能（抖动） | 数据包到达间隔抖动 | ≤ 30 ms（标准差） | 确保音频连续性，要求媒体服务器高 PPS |
| 可扩展性 | 并发呼叫数 | 目标 N（例如 500） | 影响 Node.js I/O 承载与 RTPEngine/TURN 容量规划 |
| 安全性（媒体） | 加密标准 | WebRTC 强制 DTLS-SRTP；SIP 侧建议 SRTP/SDES 或 TLS | 满足标准并保障公网传输安全 |
| 可用性 | 系统运行时间 | 99.99% | 满足 24/7 业务连续性 |
| 网络穿越 | NAT 支持 | 必须支持 STUN/TURN，中继对称 NAT | 确保复杂网络环境下可连接 |

强调：端到端延迟 ≤ 150 ms 与抖动 ≤ 30 ms 为最高优先级 NFR。

---

## VI. 结论与战略建议

- 强制实施三层解耦混合架构（Asterisk / Node.js / RTPEngine），信令与媒体分离。
- Node.js 仅用于信令与编排；SRTP 终止、转码等媒体处理由 RTPEngine 承担。
- 必须部署 RTPEngine 与专用 STUN/TURN 服务器（建议 COTURN），保障复杂网络环境下可靠性。
- 以端到端延迟与抖动为核心指标，阶段 III/IV 围绕性能与互操作性开展联调与压力测试。
