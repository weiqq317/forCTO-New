# SDP 示例与约束

本文给出典型的 SIP 侧（G.711/RTP）与 WebRTC 侧（Opus/SRTP）SDP 片段，并说明 RTPEngine 修改点。

## 1. SIP 侧 SDP（示例，G.711/PCMU）

```
v=0
o=- 3747 2 IN IP4 10.0.0.10
s=-
c=IN IP4 10.0.0.10
t=0 0
m=audio 17384 RTP/AVP 0 8 101
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:101 telephone-event/8000
a=ptime:20
```

RTPEngine 常见修改：
- replace-origin / replace-session-connection：将 o=/c= 地址替换为 RTPEngine 的媒体地址。
- codec 过滤：仅保留与策略匹配的编解码器（如仅保留 0/8）。

## 2. WebRTC 侧 SDP（示例，Opus/SRTP）

```
v=0
o=- 46117327 2 IN IP4 0.0.0.0
s=-
t=0 0
a=group:BUNDLE 0
m=audio 9 UDP/TLS/RTP/SAVPF 111 0 8 101
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:abc123
a=ice-pwd:xyz789
a=ice-options:trickle
a=fingerprint:sha-256 12:34:...:AB
 a=setup:actpass
 a=mid:0
 a=rtcp-mux
 a=rtpmap:111 opus/48000/2
 a=rtpmap:0 PCMU/8000
 a=rtpmap:8 PCMA/8000
 a=rtpmap:101 telephone-event/8000
 a=fmtp:111 minptime=10;useinbandfec=1
 a=candidate:1 1 udp 2122260223 192.0.2.50 54321 typ host
 a=candidate:2 1 udp 1686052607 203.0.113.50 60000 typ srflx raddr 10.0.0.5 rport 44444
```

说明：
- 必须为 UDP/TLS/RTP/SAVPF；强制 SRTP 与 DTLS 指纹。
- ICE 候选将由 RTPEngine 生成并与 Coze 端协商。

## 3. RTPEngine 介入点
- offer：输入 SIP 侧 SDP，返回修饰后的 SIP SDP（媒体地址、端口、可能的编解码器过滤）。
- answer：用于 WebRTC 侧，生成 DTLS/SRTP 与 ICE 参数，完成双向匹配。
- delete：释放媒体资源。

## 4. 编解码器策略
- SIP 侧：G.711（PCMU/PCMA）优先，简化互通。
- WebRTC 侧：Opus 优先，保留 PCMU/PCMA 作为边缘回退。
- 若需强制转码：在 RTPEngine 内开启（与构建选项相关）。
