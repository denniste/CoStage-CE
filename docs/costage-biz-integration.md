# CoStage 业务系统接入指南（P0：开播/观看/连麦裁决 + 撤权）

> 配套演示系统：[`demo/`](../demo/)（Django 实现的 BizHub 运营控制台）。
> 契约源头：CoStage 主仓 `server/costage-server-api-request.md` §4.1/§4.4（能力评估）
> 与 `server/costage-server-api-implementation-plan.md`（施工方案）。
> 本文面向**业务系统开发者**：接 CoStage 当执行层，需要实现什么、调用什么、怎么验收。
> 更新日期：2026-09-12，对齐 CoStage HEAD `5811ad7`（含 SPA trusted 交接入口）。
> 配套演示：`demo/` 已升级为**惠民超市**（完整超市电商），本文 §8 为其商品直播实战。

---

## 1. 架构与职责边界

```
浏览器/客户端                     BizHub（业务系统，本仓 demo）                CoStage（执行层）
    │  Bearer 票证                     │                                          │
    ├─────────── 登录/业务操作 ────────►│                                          │
    │                                  │◄── ① POST /biz/v1/decide（HMAC 签名）────┤
    │                                  │    建房/进房/申请/批准/上麦 5 个动作前询问   │
    │                                  ├── 裁决：业务角色+状态 → allow/reason ─────►│
    │                                  │                                          │
    │                                  ├── ② POST /api/v1/service/revoke ────────►│
    │                                  │    禁播 → 结束直播/下麦/踢观看/撤权戳       │
    │◄── 403 AUTHZ_DENIED / REVOKED ───┼──────────────────────────────────────────┤
```

- **业务系统是唯一真相源**：谁可开播、谁只能看、谁可连麦，全部由业务系统裁决；
  CoStage 只做"问一次 → 执行"，自身不再内置角色规则。
- **两个集成面**：① 决策端点（业务系统实现，CoStage 出站询问）；② 撤权端点
  （CoStage 提供，业务系统调用）。
- **fail-closed**：决策端点不可达/超时/非 200/响应坏 JSON 时，CoStage 拒绝动作
  （返回 403 `SERVICE_UNAVAILABLE`）。业务系统过载时可主动返回
  `{"allow":true}` 软降级，或运维临时开启 `COSTAGE_AUTHZ_FAIL_MODE=open` 逃生阀。

## 2. CoStage 侧启用配置

全部默认关闭；**不配置 = 现状行为零变更**（已实测）。

| 环境变量 | 说明 | 演示值 |
|---|---|---|
| `COSTAGE_AUTHZ_URL` | 业务决策端点地址（空=不启用） | `http://127.0.0.1:7990/biz/v1/decide` |
| `COSTAGE_AUTHZ_SECRET` | 决策签名 HMAC 密钥 | `demo-bizhub-authz-secret` |
| `COSTAGE_AUTHZ_MODE` | `enforce`（默认）/ `shadow`（只记日志恒放行，灰度校准用）/ `off` | `enforce` |
| `COSTAGE_AUTHZ_FAIL_MODE` | 决策不可达时 `closed`（默认，拒绝）/ `open`（放行逃生阀） | `closed` |
| `COSTAGE_AUTHZ_TIMEOUT_MS` | 决策请求超时（默认 3000） | 默认 |
| `COSTAGE_AUTHZ_CACHE_SECONDS` | 决策缓存 TTL（默认 60s；`live.create`/`mic.ready` 恒不缓存；0=禁用） | 默认 |
| `COSTAGE_SERVICE_TOKEN` | 服务间令牌（撤权端点鉴权；空=撤权路由不挂载） | `demo-bizhub-service-token` |

启动日志校验：`[authz] 已启用决策点 url=... mode=enforce failMode=closed cacheTTL=1m0s`。

## 3. 决策 API（CoStage → 业务系统）

CoStage 在 5 个动作**执行前**出站询问；`allow=false` 则该动作失败（HTTP 403）且**不落库**。

### 请求

```
POST {COSTAGE_AUTHZ_URL}
Content-Type: application/json
X-CoStage-Timestamp: <unix 秒>
X-CoStage-Signature: sha256=<hex(HMAC-SHA256(secret, "<timestamp>.<raw body>"))>
```

```json
{
  "action": "live.create",        // live.create | room.join | mic.apply | mic.ready | mic.accept
  "userId": "2",                  // 行为主体（CoStage 用户 id；trusted 模式为 x-trusted-<业务userId>）
  "roomId": "r-2",                // create 时为空
  "hostId": "2",                  // 进房/连麦时附带，业务可按房间归属裁决
  "category": "数学",             // 当前分类（join/apply 时附带，可选）
  "targetUserId": "3",            // 仅 mic.accept：被批准人（裁决对象是被批准人而非房主）
  "requestId": "req-<16hex>",     // 幂等键（业务可缓存/去重）
  "ts": 1757500000
}
```

### 响应（200）

```json
{ "allow": true,  "expiresIn": 60 }
{ "allow": false, "reason": "仅教师身份可开播（当前身份：学生）" }
```

- `expiresIn`：决策缓存秒数。allow 缺省=用 CoStage 侧 `COSTAGE_AUTHZ_CACHE_SECONDS`
  （默认 60）；**deny 缺省不缓存**（防"先拒后准"被锁住）；`live.create`/`mic.ready`
  恒不缓存（低频且关键）。
- `reason`：**用户可见拒绝文案**，CoStage 原样回传前端直显（业务系统是文案真相源，
  前端多语言由业务侧自行决定）。建议 ≤50 字、面向终端用户。
- 签名校验失败建议返回 401——CoStage 视同决策失败，按 fail-closed 拒绝动作。

### 幂等与重放

- `requestId` 由 CoStage 生成（`req-<random>`），同一动作重试同键；业务侧可据此去重。
- 时间戳超出容忍窗即拒（demo 实现为 ±300s），防重放。

### 参考实现

本仓 `demo/liveops/services.py`：`verify_signature()`（签名/时间戳）与
`decide()`（演示规则集）——生产系统可按语言等价移植，签名算法 10 行。

## 4. 撤权 API（业务系统 → CoStage）

```
POST {COSTAGE_BASE_URL}/api/v1/service/revoke
Content-Type: application/json
X-CoStage-Service-Token: <COSTAGE_SERVICE_TOKEN>
```

```json
{ "userId": "2", "scope": "all", "roomId": "", "reason": "业务禁播" }
```

| 字段 | 说明 |
|---|---|
| `userId` | CoStage 用户 id |
| `scope` | `live` 结束其直播 / `mic` 强制下麦+出队+拉黑 / `watch` 踢断观看 WS+移出 LiveKit / `all` 三者叠加+**落撤权戳** |
| `roomId` | 空=扫描全部活跃房；指定=仅作用该房（live 只认该用户为房主的房） |
| `reason` | 审计留痕 |

**响应 200**：

```json
{ "status": "ok", "result": {
    "roomClosed": true,          // live：房间已走状态机终态（非旁路）
    "micReleased": true,         // mic：席位已释放（含拉黑）
    "kickedWs": 2,               // watch：踢断的观看连接数
    "stamps": ["*"],             // scope=all 时落全量撤权戳
    "skipped": []                // 跳过的动作及原因（如房间不存在）
} }
```

错误：`403 {"code":"FORBIDDEN"}` 令牌错误（常量时间比较）；`400 {"code":"INVALID_SCOPE"}`；
令牌未配置时整组路由不挂载（404，fail-safe）。

**撤权戳的生效路径**：`scope=all` 写 Redis `revoke:{uid}`（默认 TTL 24h）；
CoStage 在**每个认证请求**上检查该戳（`apiauth` 层），命中即 403
`{"code":"REVOKED","error":"账号状态已变更，请重新登录"}`——**未过期的 access token
立即失效**，不等 12h 自然过期。Token 空缺时路由不挂载。

## 5. 前端可见的错误码

| code | 场景 | 前端 fallback（CoStage 已内置） |
|---|---|---|
| `AUTHZ_DENIED` | 决策拒绝（建房/进房/连麦 403） | `params.reason`（业务文案）直显 → 本地化模板「操作被业务规则拒绝」 |
| `REVOKED` | 撤权戳命中 | 本地化模板「账号状态已变更，请重新登录」 |
| `SERVICE_UNAVAILABLE` | 决策端点不可达 fail-closed | 本地化模板「鉴权服务暂不可用，请稍后再试」 |

## 6. 演示走查（demo/ + 8 条验收）

前置：CoStage 与 BizHub 均已启动（`demo/run.sh` 起 BizHub 于 127.0.0.1:7990），
CoStage 带第 2 节 env 重启。种子映射：admin(uid=1)=教师、user01-04(uid=2-5)=学生。

| # | 验收项 | 操作 | 预期 |
|---|---|---|---|
| 1 | 未授权开播 | user01 登录 CoStage 开播（学生身份） | 建房失败 403「仅教师身份可开播（当前身份：学生）」，目录**不产生房间**，BizHub 决策日志出现拒绝记录 |
| 2 | 授权开播 | BizHub 控制台把 user01「升为教师」→ 重新开播 | 成功，目录出房间 |
| 3 | 决策缓存 | 同一学生连续两次进房 | BizHub 日志只 +1 条（60s 缓存命中） |
| 4 | 禁播即时生效 | BizHub 对 user01「禁播并强制下线」 | 其直播走状态机结束（观看端收终态）；user01 任意操作 403 REVOKED；重登仍 403（戳 24h TTL） |
| 5 | 封禁者不得观看 | user02 禁播后进他人房间 | 403，文案「该账号已被封禁…」 |
| 6 | fail-closed | 停掉 BizHub 再开播 | 403 SERVICE_UNAVAILABLE「鉴权服务暂不可用」，非 internal |
| 7 | 服务令牌 | `curl` 无/错令牌调 revoke | 403；令牌未配置时该路由 404 |
| 8 | 双语文案 | CoStage 前端切英文复现 #1 | 模板文案英文；业务 reason 按业务下发原文直显 |

## 7. 生产注意事项

- **HTTPS + 密钥管理**：`COSTAGE_AUTHZ_URL` 跨机时走 HTTPS；两把 secret
  （`AUTHZ_SECRET`/`SERVICE_TOKEN`）走密钥管理系统，勿进代码库。
- **灰度**：先 `COSTAGE_AUTHZ_MODE=shadow` 上线（只记日志恒放行），比对
  "业务会拒绝"与实际行为后再切 `enforce`；回滚=清空 `COSTAGE_AUTHZ_URL` 重启。
- **可用性**：决策端点是无状态水平扩展单元；P99 应 <100ms（CoStage 侧 3s 超时、
  不重试——决策在请求关键路径上）。缓存命中 <5ms。
- **shadow 日志**：CoStage 以 `[authz][shadow]` 前缀记录每次"本应拦截"的询问。
- **用户映射**：trusted 模式下 CoStage 自动开户 `x-trusted-<业务userId>`；
  决策请求的 `userId` 即该值，业务系统直接按自有 userId 裁决，无需查表翻译。
- **已知缺口（P1 建议）**：撤权是单向的——`scope=all` 落的戳（默认 TTL 24h）没有
  解除接口，业务侧"解除封禁"后该用户仍会 403 REVOKED 到戳过期为止（重新登录无效，
  戳按 userId 而非票校验）。生产接入建议：P1 增加 un-revoke 端点，或把戳 TTL 与业务
  封禁审核周期对齐调短（`RevokeUser` 的 ttl 参数已可配）。

## 8. 惠民超市实战（demo/，Mode 1：独立应用 + 用户同步 + JWT 跳转）

> 集成形态定稿（2026-09-12）：CoStage 是**独立完整的直播应用**，自带 SPA 独立入口
> （生产=live.example.com 一类独立域名/vhost），业务系统**不承载、不改写、不代理**
> CoStage 的任何页面。集成只走三件事：①api_key 管理面同步用户；②决策端点裁决；
> ③需要直播时换 JWT 跳转到 CoStage 入口。前端的深度定制路线见
> [`costage-js-library-design.md`](costage-js-library-design.md)（Mode 2，JS library，待立项）。

用户同步（api_key 管理面，超市场景）：
- 顾客注册 → `PUT /api/v1/service/users/mall-<id>`（canLive=false，role=guest）
- 员工建档 → 同端点（canLive=true，role=teacher）
- 换票 userId 与同步 external_id 同源（`mall-<id>`），CoStage 侧自动对上同一账号

直播权限双层闸：**业务决策闸**（authz，业务系统是真相源）+ **CoStage 本地 can_live 标志**
（独立运行兜底，`PUT users/{externalID} {"canLive":false}` 即停播权）——两层都过才放行。

## 8.1 演示环境拓扑（dev 模拟 vhost）

| 入口 | 反代目标 | 用途 | 生产对应 |
|---|---|---|---|
| https://192.168.31.2/ （443） | 7860 | CoStage 独立应用（SPA+API+WS） | live.example.com |
| https://192.168.31.2:82/ | 7990 | 惠民超市（商城+后台+决策端点） | shop.example.com |

## 8.2 惠民超市实战细节（方案 A：trusted 换票）

业务系统 = 一家单店超市（顾客商城 + 员工后台），接入 CoStage 做**商品直播**：
店员开播卖货，顾客/匿名观看。

### 8.1 身份：店员换票（CoStage 侧需 trusted 模式）

```
店员点后台「开播卖货」
  └► 超市后端 POST /api/v1/auth/exchange
     body: {userId:"x-trusted-<工号>", displayName:"店员花名", role:"teacher",
            ts:<unix秒>, nonce:<uuid>, sig:hex(HMAC-SHA256(TRUSTED_SECRET,
            "v1|x-trusted-<工号>|teacher|<ts>|<nonce>"))}
  └► 200 {accessToken, refreshToken, user{...}}（CoStage 自动开户，角色钳 teacher）
  └► 302 跳转 https://<CoStage入口>/#sso=<access>&rst=<refresh>&u=<b64url(user)>
       SPA 启动时写票进 localStorage 并清 hash（CoStage web ssoIntake，HEAD 5811ad7）→ 已登录
  └► 店员在 CoStage「我的房间」开播（房间号 = r-x-trusted-<工号>）
```

要点：nonce 一次性（CoStage Redis NX 防重放）；ts 偏差 ±30s 内；role 必须在
`COSTAGE_TRUSTED_ROLES` 白名单内否则被钳成 guest；**超市不存任何 CoStage 口令**。

### 8.2 规则：决策裁决（demo/supermarket/livegate.py）

| 动作 | 规则 |
|---|---|
| `live.create` / `mic.apply` / `mic.ready` | 仅员工（x-trusted-* 且角色∈店员/经理） |
| `mic.accept` | 操作者是员工，且**被批准者**也须是员工 |
| `room.join` | 一律放行（顾客 60s 缓存；匿名/未登记者归 CoStage accessMode 管辖） |

### 8.3 观看：商城「直播中」条

超市首页实时拉 `GET /api/rooms` 过滤 `hostId` 以 `x-trusted-` 开头且 `state=live`
的房间，渲染「直播中」入口链接到 `https://<CoStage入口>/room/<roomId>`——
浏览器无票即走 SPA 匿名观看流（anon-token），登录顾客同理。

### 8.4 演示走查

1. `staff01 / staff123456` 登录超市后台 → 「● 开播卖货」→ 落地 CoStage 已是
   `店员·staff01`（右侧 my 显示花名）→ 开播
2. 商城首页出现「直播中 · 店员·staff01 的直播间」→ 无痕窗口点进去匿名看
3. CoStage 侧把房设私密 → 匿名端清屏（accessMode 语义照旧）
4. BizHub 决策日志可见每次 live.create/room.join 询问
