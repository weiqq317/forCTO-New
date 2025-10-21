# Asterisk WSS/SRTP 配置指引（PJSIP）

本指南说明如何在 Asterisk 中启用 PJSIP + WSS（WebSocket Secure）与 SRTP，以支持与 WebRTC/浏览器或代理对接。

## 1. 模块与前置条件
- 确保编译或安装了：
  - chan_pjsip、res_pjsip、res_pjsip_transport_websocket
  - res_http_websocket、res_crypto
- 确保系统具备可用的 TLS 证书（可自签或受信 CA）。

## 2. http.conf（WSS 依赖）
示例（config-samples/asterisk/http.conf）：
```
[general]
enable=yes
bindaddr=0.0.0.0
bindport=8088
; 若启用 TLS：
; tlsenable=yes
; tlsbindaddr=0.0.0.0:7443
; tlscertfile=/etc/asterisk/keys/asterisk.crt
; tlsprivatekey=/etc/asterisk/keys/asterisk.key
```

## 3. pjsip.conf 传输
可参考 config-samples/asterisk/pjsip.conf：
```
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060

[transport-wss]
type=transport
protocol=wss
bind=0.0.0.0:7443
; 证书同 http.conf
```

## 4. SRTP 与编解码器
- 在 endpoint 上启用：
```
[endpoint-nodejs]
...
allow=ulaw,alaw,opus
media_encryption=sdes  ; 或使用 dtls（端侧配合）
```
- 建议在大规模并发时由 RTPEngine 终止 SRTP 并转发至 SIP 侧 RTP，降低 Asterisk 负载。

## 5. rtp.conf
示例（config-samples/asterisk/rtp.conf）：
```
[general]
rtpstart=49152
rtpend=65535
icesupport=yes
```

## 6. 其他
- directmedia=no，将媒体统一交由 RTPEngine 中继。
- 若与浏览器直连，需考虑 CORS 与 WSS 证书链完整性。
