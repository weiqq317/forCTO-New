# 软件开发任务清单（Derived from SRS & SDLC）

本文档依据 `docs/srs.md` 与 `docs/sdlc-plan.md`，将项目的功能需求（FRs）、非功能需求（NFRs）以及阶段性交付拆解为可执行的任务列表，便于开发团队跟踪进度并确保所有工作项闭环。

## 1. 阶段性任务总览

| 阶段 | 时间 | 里程碑 | 关键任务（概述） |
|---|---|---|---|
| 阶段 I | 4 周 | M0 | 架构蓝图、SRS 定版、基础设施（Asterisk/RTPEngine/CoTURN）部署与连通验证 |
| 阶段 II | 6 周 | M1 | Node.js SIP 客户端 MVP、Coze API 封装、RTPEngine 控制接口（模拟媒体） |
| 阶段 III | 8 周 | M2 | 端到端媒体打通、SRTP ↔ RTP 转换、Opus ↔ G.711 转码、NAT 穿越验证 |
| 阶段 IV | 4 周 | M3 | 性能压测、NFR 验证、安全审计、监控告警、上线与运营交付 |

## 2. 功能需求（FR）任务拆解

| FR | 任务描述 | 所属阶段 | 产出/验证 |
|---|---|---|---|
| FR-01 | 实现 PJSIP 注册、REGISTER 自动续订、OPTIONS 保活；配置凭证管理 | 阶段 II | 自动化注册脚本、Asterisk 日志验证 |
| FR-02 | INVITE 消息处理、自动回复 100 Trying / 200 OK；呼叫状态机 | 阶段 II | 呼叫单元测试、演示脚本 |
| FR-03 | Coze API 封装：令牌管理、会话创建、错误重试 | 阶段 II | API SDK 模块、集成测试报告 |
| FR-04 | RTPEngine 控制接口：offer/answer/delete、SDP 修饰、错误处理 | 阶段 II & III | 控制层模块、SDP 对比结果 |
| FR-05 | 实现/验证 Opus ↔ G.711 转码流水线（RTPEngine 配置与测试） | 阶段 III | 媒体抓包、音质评估报告 |
| FR-06 | 呼叫终止流程：BYE 处理、Coze 会话终止、RTPEngine 资源释放 | 阶段 II & III | 呼叫生命周期测试用例 |
| FR-07 | 异常处理：SDP/ICE/DTLS/TURN 失败检测、重试、告警 | 阶段 III & IV | 故障注入脚本、监控告警配置 |

## 3. 非功能需求（NFR）任务拆解

| NFR | 任务 | 验证方式 |
|---|---|---|
| 延迟 ≤ 150 ms | 端到端延迟基线测量、优化媒体路径、使用低延迟 TURN | 压测结果、Prometheus/Grafana 仪表盘 |
| 抖动 ≤ 30 ms | 监控 RTCP 统计、优化网络 QoS、调整转码线程 | 抖动分布图、告警阈值 |
| 并发 N（示例 500） | 容量规划、水平扩展 RTPEngine/TURN、事件循环监控 | sipp 压测报告、资源利用率图表 |
| 媒体加密 | 确保 DTLS-SRTP、SRTP/SDES（可选）、证书管理 | 渗透测试报告、证书轮换计划 |
| 可用性 99.99% | HA 架构设计、健康探测、自动恢复、Runbook | 演练结果、SLO/SLA 定义 |
| NAT 穿越 | 部署 CoTURN、高可用策略、对称 NAT 测试 | NAT 场景测试矩阵 |

## 4. 跨阶段基础设施与运维任务

- 基础设施 IaC（Terraform/Ansible 等）模板。
- 机密管理：PAT、SIP 密码、证书存储与轮换。
- CI/CD 流程定义：单元测试、集成测试、静态检查。
- 监控/日志：接入 Prometheus、Loki/ELK、告警渠道（PagerDuty/钉钉）。
- 文档维护：架构图、运行手册、排障 Runbook（参见 `docs` 目录）。

## 5. 验收清单（Definition of Done）

- ✅ 功能：FR-01 ~ FR-07 全部通过手动与自动化测试。
- ✅ 非功能：延迟/抖动/并发指标达到或优于目标值。
- ✅ 安全：证书管理、API 令牌保护、渗透测试已完成。
- ✅ 运维：监控、告警、Runbook、应急预案、值班计划就绪。
- ✅ 文档：SRS、架构、实施计划、配置示例及时更新并归档。

## 6. 后续优化方向（上线后）

- 增量纳入更多媒体特性（录音、实时文本转录）。
- 针对 AI 对话质量的 A/B 测试与反馈闭环。
- 自动扩缩容策略（基于并发指标动态调整 RTPEngine/TURN 节点）。
- 引入服务质量评分（MOS）自动化评估。
