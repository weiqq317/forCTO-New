# 安全加固与合规

## 1. 传输加密
- SIP：优先 SIP over TLS（5061）或 WSS（443），避免明文信令；禁用弱加密套件。
- 媒体：WebRTC 强制 DTLS-SRTP；SIP 侧建议 SRTP/SDES 或在 RTPEngine 处终止/转换。

## 2. 证书与密钥
- DTLS/SRTP 证书生命周期管理与定期轮换；最小权限存取。
- CoTURN TLS 证书（5349）与 long-term credentials；HMAC 秘钥妥善保管。

## 3. 访问控制
- RTPEngine 控制接口仅监听内网或 UNIX socket；通过防火墙限制来源 IP。
- Asterisk 管理接口（AMI/ARI）如开启需强鉴权与 IP 白名单。

## 4. 防护与审计
- SIP 扫描与暴力破解：fail2ban/iptables 规则，限制 REGISTER/INVITE 速率。
- DDoS：在边界启用速率限制与黑洞策略；TURN 中继端口范围限缩并监控突发连接。
- 日志脱敏：去除或屏蔽敏感字段（Token、密码、指纹等）。

## 5. 数据与合规
- 根据部署地域遵循数据保护法规；录音/留存需获得用户同意。
- 加密存储机密，使用 Vault/KMS/Secret Manager；避免平面文本。

## 6. 安全测试
- 定期渗透测试与依赖漏洞扫描；升级 OpenSSL、PJSIP、rtpengine、coturn 等组件。
- 预案与演练：证书过期、密钥泄漏、TURN 端口耗尽等场景演练。
