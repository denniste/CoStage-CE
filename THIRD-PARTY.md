# Third-party notices / 第三方组件声明

> CoStage Community Edition (CE) is distributed as **compiled artifacts only**. It bundles or links the
> third-party components listed below. This file reproduces the attributions those licenses require and
> ships inside every release tarball (`THIRD-PARTY.md`, plus full license texts in `third-party/`).
>
> CoStage CE（社区版）**仅以编译产物分发**，内含下列第三方组件。本文件汇总各组件所需的署名与声明，
> 并随每个发布包一同提供（`THIRD-PARTY.md`，许可全文在 `third-party/`）。

## 1. Redistributed binaries / 随包分发的二进制

| Component | License | Copyright | Ships as | License text |
|---|---|---|---|---|
| **LiveKit server** | Apache-2.0 | Copyright 2023 LiveKit, Inc. | `bin/livekit-server` | `third-party/LICENSE.livekit.txt`, `third-party/NOTICE.livekit.txt` |
| **ZLMediaKit** (`MediaServer`) | MIT | Copyright (c) 2016-present The ZLMediaKit project authors | `bin/MediaServer` | `third-party/LICENSE.zlmediakit.txt` |

### LiveKit NOTICE (reproduced verbatim, Apache-2.0 §4(d))

```
Copyright 2023 LiveKit, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### ZLMediaKit MIT notice (reproduced verbatim)

```
MIT License

Copyright (c) 2016-present The ZLMediaKit project authors. All Rights Reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Neither binary is modified by CoStage: they are redistributed as published upstream
(`zlmediakit/zlmediakit` container image / LiveKit release tarball).
两个二进制均未修改，按上游发布形态原样分发。

## 2. Linked into `costage-server` / `relaybot` (Go, statically linked into the binaries)

| Component | License | Notes |
|---|---|---|
| `github.com/livekit/protocol`, `github.com/livekit/server-sdk-go/v2` | Apache-2.0 | LiveKit APIs / token signing / webhooks |
| `github.com/pion/webrtc`, `pion/ice`, `pion/dtls`, `pion/srtp`, `pion/stun`, `pion/turn` | MIT | WHIP push, embedded TURN server |
| `github.com/gorilla/websocket` | BSD-3-Clause | business WebSocket gateway |
| `github.com/redis/go-redis/v9` | BSD-2-Clause | Redis client |
| other transitive modules | Apache-2.0 / MIT / BSD | see `server/go.mod` + `go.sum` |

## 3. Bundled into the panel (`web/dist`) and the JavaScript SDK (`sdk/`)

| Component | License | Notes |
|---|---|---|
| `livekit-client` | Apache-2.0 | browser SFU client (inlined in the panel and SDK bundles) |
| `@livekit/protocol` | Apache-2.0 | shared types |
| `react`, `react-dom` | MIT | SDK-embedded UI runtime |
| **`@tldraw/tldraw`, `@tldraw/tlschema`, `@tldraw/assets`** | **tldraw license** (not OSS) | see §4 — **action required before commercial production use** |
| `i18next` | MIT | panel internationalisation |

## 4. ⚠ tldraw license — read before shipping to production

The whiteboard is built on tldraw, which is **not** distributed under an open-source license.
Its terms (verbatim text: `third-party/LICENSE.tldraw.txt`, upstream:
<https://github.com/tldraw/tldraw/blob/main/LICENSE.md>) grant these permissions
*"Use the Software in Development Environments / Modify the Software / Bundle the Software with your own
projects"* **subject to** the following conditions, quoted:

> - Not to use the Software in Production Environments.
> - Not to disable, change, or interfere with the Software's License Key enforcement.
> - Not to remove any copyright or other notices from the Software.
> - Not to make the Software available under a license that supersedes or negates the effect of this License.
> - Not to distribute the Software or modifications of the Software as a standalone product, but only as part of another application.
> - To include a verbatim copy of this License in any distribution of the Software.
> - To comply with tldraw's trademark policy.

with *"Production Environment"* defined as *"any production deployment of the Software that operates on
servers, cloud platforms, web applications, or where the software is used to provide functionality to end
users, customers, or the public."*

**Therefore:** using CoStage (or its JS SDK) as a **production** service requires a commercial license from
tldraw Inc. (<https://tldraw.dev>) — or replacing the whiteboard engine. Development, testing and internal
staging are permitted as-is. Distributions must carry the verbatim license text, so every release ships
`third-party/LICENSE.tldraw.txt`, and CoStage does not remove tldraw notices or watermark enforcement.

**中文要点**：tldraw 不是开源许可。其条款只授权「开发环境使用 / 修改 / 随自有项目打包」，并明确
**禁止用于生产环境**、禁止干预其 License Key 机制与去除水印/版权声明、要求随分发附许可全文。
所以把 CoStage 或其 JS SDK 用于**生产**（对外提供服务的部署）需先向 tldraw Inc. 购买商业许可，
或替换白板引擎；开发/测试/内网预发不受影响。发布包已附 `third-party/LICENSE.tldraw.txt`。

## 5. Runtime dependencies the operator installs (not redistributed by CoStage)

| Component | License | Notes |
|---|---|---|
| Redis (`redis-server`, Ubuntu 24.04 ships 7.0.x) | BSD-3-Clause | seat state, whiteboard baseline |
| nginx / Caddy / any TLS terminator | BSD-2-Clause / Apache-2.0 | operator-provided entry |
| FFmpeg | LGPL-2.1+ / GPL-2.0+ depending on build | **optional**, only for snapshot features; not shipped |

Redis 7.4+ changed to RSALv2/SSPLv1 — pin a BSD-3 release (e.g. 7.0.x/7.2.x) if that matters to you.
Redis 7.4 起改为 RSALv2/SSPLv1，如需规避请使用 7.0.x/7.2.x。

## 6. CoStage itself

CoStage is **not** open source: the CE repository publishes compiled artifacts and documentation only
(`LICENSE` in the distribution repository). Nothing in this file grants rights to CoStage's own code.

CoStage 本体**不是**开源项目：CE 仓仅发布编译产物与文档（见其 `LICENSE`）。

---

_Regenerating the license cache: `scripts/fetch-third-party.sh` (downloads the binaries plus
`LICENSE.livekit.txt`, `NOTICE.livekit.txt`, `LICENSE.zlmediakit.txt`, `LICENSE.tldraw.txt`).
Upstream license URLs: LiveKit <https://github.com/livekit/livekit/blob/master/LICENSE> ·
ZLMediaKit <https://github.com/ZLMediaKit/ZLMediaKit/blob/master/LICENSE> ·
tldraw <https://github.com/tldraw/tldraw/blob/main/LICENSE.md>._
