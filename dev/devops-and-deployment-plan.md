# DevOps 与部署运营计划

**项目名称**：SIP 客户端与 Coze WebRTC 实时语音服务集成  
**版本**：v1.0  
**发布日期**：2025-10-22  
**作者**：DevOps 团队

---

## 1. 文档修订记录

| 版本 | 日期 | 作者 | 说明 |
| --- | --- | --- | --- |
| v1.0 | 2025-10-22 | DevOps 团队 | 首次发布 |

---

## 2. 目标

- 建立一致、可复制的部署流程，支持多环境并保障高可用。
- 实现端到端 CI/CD，自动化测试与安全检查。
- 提供可观测性、日志、告警与容量管理方案。

---

## 3. 环境拓扑

### 3.1 逻辑架构

```
[Callers] → [Internet] → [Enterprise Edge]
    ↓                       ↓
[Asterisk Cluster] ↔ [SIP 客户端 (Node.js) Cluster]
                                ↓
                      [RTPEngine Cluster]
                                ↓
                        [Coze WebRTC Service]

支撑组件：COTURN / Redis / PostgreSQL / Prometheus / Grafana / Loki / Alertmanager / Vault
```

### 3.2 环境区分

| 环境 | 目的 | 部署特点 |
| --- | --- | --- |
| DEV | 开发调试 | 最小规模，使用 Mock 服务，可单节点 |
| STG | 集成验证 | 与生产一致的拓扑，隔离网络 |
| PERF | 压力测试 | 独立资源，支持网络扰动模拟 |
| PROD | 生产 | 高可用、跨可用区、自动扩展 |

---

## 4. 基础设施与配置

### 4.1 基础设施即代码（IaC）

- Terraform/Ansible 管理计算、网络、存储、负载均衡。
- Kubernetes (K8s) 作为主部署平台（可选 VM/Bare Metal）。
- Helm 管理应用部署，分环境 values 文件。

### 4.2 网络与安全

- 将 Node.js 与 RTPEngine 部署于专用子网。
- 使用安全组/防火墙开放必要端口：
  - SIP: 5060/5061
  - Node.js API: 8080/8443
  - RTPEngine 控制: 22222 (UDP/TCP)
  - 媒体端口范围: UDP 49152-65535
- 使用 mTLS/TLS 保护控制接口。
- 访问 Coze API 使用出站 NAT 网关，限制安全策略。

### 4.3 配置管理

- 配置以 Git 仓库管理（加密敏感内容）。
- 使用 HashiCorp Vault/KMS 存储 PAT、证书、私钥。
- 环境变量通过 Kubernetes Secrets / ConfigMap 注入。

---

## 5. CI/CD 流程

### 5.1 CI 管道

1. **代码提交** → 触发 Git Hooks
2. **静态检查**：ESLint、Prettier、TypeScript（如适用）
3. **单元测试**：Jest/Mocha
4. **安全扫描**：npm audit、Snyk、CodeQL
5. **打包镜像**：Docker Build，生成 SBOM
6. **镜像扫描**：Trivy/Clair
7. **发布制品**：推送至镜像仓库（Harbor/ECR/GCR）

### 5.2 CD 管道

1. **部署申请**：Jira/变更单批准
2. **配置渲染**：Helm + Values
3. **部署 DEV/STG**：Argo CD/Flux
4. **自动化测试**：集成与 E2E
5. **发布审批**：PM/运维/安全签字
6. **灰度发布**：Canary/Blue-Green
7. **全量发布**：观察 30 分钟后扩大流量

---

## 6. 发布策略

| 策略 | 说明 | 适用场景 |
| --- | --- | --- |
| 蓝绿部署 | 同时运行新旧版本，切换流量 | 大版本升级、风险控制 |
| 金丝雀发布 | 10%-30%-70%-100% 分阶段放量 | 常规迭代、可快速回滚 |
| 滚动更新 | 节点逐个替换 | 小规模补丁、低风险 |

**回滚流程**：
1. 发现异常 → 触发 `kubectl rollout undo` 或切回旧版本。
2. 通知干系人，冻结发布。
3. 分析根因 → 修复 → 重新发布。

---

## 7. 可观测性

### 7.1 指标监控

- **应用指标**：呼叫数、成功率、延迟、抖动、丢包、Coze API 成功率。
- **系统指标**：CPU、内存、网络带宽、RTPEngine 端口使用率。
- **业务指标**：AI 对话成功率、转人工率（未来）。

### 7.2 日志管理

- 结构化 JSON 日志 → Loki/ELK。
- 日志字段：timestamp、level、call_id、session_id、event、latency。
- 保留策略：生产 90 天，归档 180 天。

### 7.3 链路追踪

- OpenTelemetry SDK + Jaeger/Tempo。
- Trace 关键节点：Asterisk INVITE → Node.js → RTPEngine → Coze。

### 7.4 告警

- 使用 Alertmanager / PagerDuty。
- 分级：P1（立即响应）、P2（2 小时）、P3（当日内）。
- 告警源：指标、日志、Synthetic Call、系统事件。

---

## 8. 容量与性能管理

- **扩容策略**：
  - Node.js：HPA 根据 CPU/自定义指标（呼叫数）。
  - RTPEngine：基于并发媒体会话数、端口使用率。
  - TURN：监控中继会话数，自动伸缩。
- **容量规划**：
  - 初始配置满足 200 并发。
  - 设置 70% 利用率为扩容阈值。
- **容量评估周期**：每月一次，通过报告评估。

---

## 9. 安全运营

- 定期轮换 PAT、TLS 证书。
- 实施最小权限原则（RBAC、IAM）。
- 启用 WAF/IPS 保护外部接口。
- 安全事件响应流程：
  1. 检测 → 2. 分级 → 3. 通知 → 4. 隔离 → 5. 根因分析 → 6. 恢复 → 7. 复盘。

---

## 10. 灾难恢复

- **RPO**：≤ 5 分钟（配置、状态数据可通过 Redis/数据库持久化）。
- **RTO**：≤ 30 分钟。
- **措施**：
  - 多数据中心部署，异地备份。
  - 定期备份配置、证书、数据库。
  - 演练场景：节点故障、网络故障、区域性故障。

---

## 11. 运维流程

- 详见《operations-runbook.md》。
- 包含日常检查、合成监控、值班安排、问题升级。

---

## 12. 合规与审计

- 访问日志、操作日志保存 ≥ 1 年。
- 支持审计查询：谁在何时执行何操作。
- 与安全团队协作进行年度审计与穿透测试。

---

> 本计划需与项目管理、测试策略文档同步维护；任何架构、基础设施或流程变更需更新本文件并通知相关团队。