# 环境变量与配置说明

参见仓库根目录 .env.sample。建议将机密变量存于安全存储（Vault/KMS/Secrets Manager），并在部署时注入。

- SIP_USERNAME / SIP_PASSWORD：Asterisk 上为 Node.js UAS 分配的账户凭证。
- SIP_SERVER / SIP_PORT：Asterisk PJSIP 传输地址与端口。
- COZE_API_BASE：Coze 平台 API 基址。
- COZE_PERSONAL_ACCESS_TOKEN：Coze 的 PAT（请勿明文存储）。
- COZE_SPACE_ID：目标空间/应用标识（按平台定义）。
- RTPE_HOST / RTPE_PORT：RTPEngine 控制接口地址与端口（NG 协议）。
- TURN_URI / TURN_USERNAME / TURN_PASSWORD：如需向端侧提供 TURN 中继信息。
- LOG_LEVEL：日志级别（debug/info/warn/error）。
