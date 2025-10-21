# 软件开发规划（SDLC）

本计划采用迭代与增量（Agile/Scrum）方法，将项目划分为四个阶段，总周期约 22 周。

## 阶段 I：规划、需求与基础架构搭建（4 周）
- 目标：明确范围，完成架构与 SRS，搭建最小可运行的基础设施。
- 关键任务：
  - 架构蓝图与威胁建模（信令与媒体平面分离）。
  - Asterisk（PJSIP、WSS、SRTP）基础配置与连通性验证。
  - 部署 RTPEngine 与 STUN/TURN（COTURN），配置 1:1 NAT、防火墙、媒体端口（示例：UDP 49152–65535）。
  - Coze API 准备：获取并安全存储 Personal Access Token（建议 KMS/Secret Manager）。
- 产出：架构文档、SRS、基础设施部署手册、连通性验收报告。

## 阶段 II：核心信令实现与 MVP（6 周）
- 目标：实现 Node.js 客户端的 SIP 信令与 Coze API 封装，完成自动接听的 MVP。
- 关键任务：
  - 选择并集成 SIP 库（建议 drachtio 或 node.js-sip）。
  - 实现 REGISTER/OPTIONS 保活、INVITE 处理、100 Trying/200 OK 响应（初期使用模拟 SDP）。
  - 抽象 Coze API 客户端模块：认证、会话启动/关闭。
  - 与 RTPEngine 的控制接口：申请/释放会话、错误回退（重试、熔断）。
- 产出：MVP 版本、端到端呼入-接听-挂断流程（媒体模拟）的演示用例。

## 阶段 III：媒体平面集成与转码（8 周）
- 目标：打通真实媒体路径，完成 SRTP 安全桥接与 Opus ↔ G.711 转码。
- 关键任务：
  - SDP 协商与修改：SIP 侧 SDP 指向 RTPEngine；Coze 侧交换 RTPEngine 提供的 WebRTC ICE/DTLS 参数。
  - 联调：Asterisk ↔ Node.js ↔ RTPEngine ↔ Coze 媒体通路。
  - 转码验证：音质评测、端到端延迟与抖动测量。
  - NAT 穿越：在受限网络（对称 NAT）下使用 TURN 中继验证。
- 产出：媒体联通报告、性能基线与采样录音、监控指标基线（P95 延迟、抖动、丢包率）。

## 阶段 IV：测试、优化与部署（4 周）
- 目标：达成 NFR 指标，完善安全与运维，分阶段上线。
- 关键任务：
  - 压力与容量测试：并发呼叫 N（示例 500），观测 CPU、内存、PPS、网络。
  - 安全审计与渗透测试：DTLS/SRTP 证书与密钥交换、接口鉴权、最小权限。
  - 监控与告警：SIP 状态、媒体 QoS（延迟/抖动/丢包）、RTPEngine/TURN 健康度。
  - 发布策略：金丝雀发布、回滚预案、SLA/SLI/SLO 定义与值班流程。
- 产出：性能与稳定性报告、运维手册与值班手册、上线评审材料。

## 资源分配（估算）
- 项目经理/架构师：总计 13 周（4/3/4/2）
- 后端/VoIP（Node/SIP）：总计 18 周（2/6/8/2）
- 运维/网络（Asterisk/RTPEngine）：总计 17 周（4/3/8/2）
- QA/性能测试：总计 12 周（1/3/4/4）

## 里程碑与验收
- M0：阶段 I 完成，基础设施连通与 SRS 定版
- M1：阶段 II 完成，信令与 Coze API MVP 验收
- M2：阶段 III 完成，端到端媒体与转码稳定
- M3：阶段 IV 完成，NFR 达标并上线
