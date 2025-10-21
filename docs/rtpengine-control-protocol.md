# RTPEngine 控制协议与接入

RTPEngine 提供“NG 控制协议”，常见于与 Kamailio/OpenSIPS 协作，但应用也可直接通过 UDP/UNIX 套接字与其交互，发送 bencode 编码的命令（offer/answer/delete）。本文给出要点与 Node.js 接入示例（伪代码）。

参考：`offer`/`answer`/`delete` 命令，核心字段：`sdp`, `call-id`, `from-tag`, `to-tag`, `direction`, `flags`。

## 1. 命令示例（JSON 形态便于理解，实际为 bencode）

- offer（SIP → WebRTC，或首次进来的一侧）：
```
{
  "command": "offer",
  "sdp": "v=0...",
  "call-id": "abc123@example.com",
  "from-tag": "sip-side-tag",
  "direction": "internal",
  "replace": ["origin", "session-connection"],
  "flags": ["trust address", "asymmetric"],
  "codec-set": ["PCMU", "PCMA", "opus"]
}
```
返回：修改后的 SDP（指向 RTPEngine 的媒体地址/端口）。

- answer（与对端协商完成后）：
```
{
  "command": "answer",
  "sdp": "v=0...",
  "call-id": "abc123@example.com",
  "from-tag": "webrtc-side-tag",
  "to-tag": "sip-side-tag",
  "direction": "external",
  "flags": ["ICE", "RTP/AVP to RTP/SAVPF"],
  "codec-set": ["opus", "PCMU", "PCMA"]
}
```

- delete（释放会话）：
```
{
  "command": "delete",
  "call-id": "abc123@example.com",
  "from-tag": "sip-side-tag",
  "to-tag": "webrtc-side-tag"
}
```

注意：实际 NG 协议使用 bencode 编码的 key-value 映射，字段名与示例类似但以短名为主；请以部署版本的 rtpengine 手册为准。

## 2. Node.js UDP 接入（伪代码）

```js
import dgram from 'node:dgram';
// 生产中建议使用成熟 bencode 库
import bencode from 'bencode';

const sock = dgram.createSocket('udp4');
const RTPE_HOST = process.env.RTPE_HOST || '127.0.0.1';
const RTPE_PORT = Number(process.env.RTPE_PORT || 7722);

function sendCommand(obj) {
  return new Promise((resolve, reject) => {
    const payload = bencode.encode(obj); // 实际需符合 NG 协议字段
    sock.send(payload, RTPE_PORT, RTPE_HOST, (err) => {
      if (err) return reject(err);
    });
    sock.once('message', (msg) => {
      try {
        const res = bencode.decode(msg);
        resolve(res);
      } catch (e) { reject(e); }
    });
  });
}

async function offer(callId, fromTag, sdp) {
  const cmd = { 'command': 'offer', 'call-id': callId, 'from-tag': fromTag, sdp };
  return await sendCommand(cmd);
}
```

要点：
- 使用固定的 `call-id` / `from-tag` / `to-tag` 维持会话关联；两侧媒体方向对应不同的 tag。
- 常用 flags：`replace-origin`、`replace-session-connection`、`trust address`、`ICE`、`rtcp-mux` 等。
- 安全：将控制接口限制在内网；必要时使用 UNIX socket 并配合文件权限。

## 3. 错误与重试
- 超时：UDP 无连接，需自实现超时与重试策略（指数退避）。
- 失败响应：解析返回对象中的 `error` 字段，触发回退或中止。

## 4. 编解码与转码策略
- `codec-set` 可控：在指令侧限制允许的编解码器集合，确保与 SRS 一致（SIP: G.711，WebRTC: Opus）。
- 转码开关：需与 RTPEngine 构建与运行参数一致，否则指令端限制不会生效。
