# 编解码器策略（Codec Policy）

## 1. 原则
- SIP 侧优先使用 G.711（PCMU/PCMA），兼容性最佳。
- WebRTC 侧优先使用 Opus，音质与带宽自适应能力强。
- 转码任务完全由 RTPEngine 承担，Node.js 不做任何媒体处理。

## 2. SDP 过滤建议
- SIP → 保留 0（PCMU）、8（PCMA），禁用不必要的负载类型。
- WebRTC → 优先 111（opus/48000/2），可携带 `fmtp`：`minptime=10; useinbandfec=1`。

## 3. 采样率与时延
- Opus 默认 48k；与 G.711 (8k) 转码将带来少量延迟。确保端到端延迟仍满足 ≤ 150 ms 的 NFR。

## 4. 负载与容量
- 转码是 CPU 密集型任务：合理规划 RTPEngine 实例数量与 CPU 绑核策略。
- 在容量逼近上限时，优先策略为：
  1) 降低转码比例（尽量直通同编解码器）；
  2) 按优先级限流新呼叫；
  3) 弹性扩容 RTPEngine。
