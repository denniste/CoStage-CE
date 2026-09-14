# CoStageJS —— 直播客户端 JavaScript Library 设计稿（Mode 2）

> 状态：**已施工（Phase a/b/c 全部落地，2026-09-14）**。
> 产物：`@costage/web-sdk`（`web-sdk/dist`：UMD `index.js` + ESM `index.mjs` + `types/`）；
> 首个业务宿主：[`demo/`](../demo/)（惠民超市商城用 `initRoomMaster` 开播、
> `initAnonymousViewer` 观看，替换原「跳 CoStage」链路，见接入文档 §8）。
> 目标读者：CoStage 前端维护者 + 业务系统集成方。
> 前置阅读：`costage-biz-integration.md`（Mode 1：独立应用 + 管理 API + JWT 跳转）。
> 定位：Mode 1 解决"业务系统**链接**到 CoStage"；Mode 2 解决"业务系统**自建**直播页面"——
> 把 CoStage SPA 的客户端内核抽成可复用 JS library，任何 JavaScript 前端都能以自己的
> 视觉与交互订制直播间，不再依赖 CoStage 的页面与样式。

---

## 1. 目标与非目标

**目标**
1. headless 客户端内核：连接管理（REST join + WS 信令 + LiveKit 房间）、状态机（席位/队列/房态）、
   白板数据通道、设备管理（摄像头/麦克风/分辨率）、聊天——全部可编程访问；
2. UI 组件层可选：以 `costage-` 前缀样式的挂载函数（attachXxx(div)），宿主页面完全掌控布局；
3. 双分发形态：npm 包（ESM）+ `window.CoStageJS` 全局（UMD 单文件，`<script>` 直引）；
4. 鉴权随 Mode 1：初始化时传入 CoStage JWT（业务系统经 exchange/申请获得）或匿名票。

**非目标（v1）**
- 不内置页面路由/多房间管理——宿主自管；
- 不承诺与 CoStage SPA 的视觉一致——只约定 `costage-` 前缀类名的默认皮肤，可整体覆盖；
- 不开放服务端管理面（用户/分类同步仍是 Mode 1 的 api_key 服务 API）。

## 2. 分层架构

```
┌─────────────────── 宿主页（超市/任意前端） ───────────────────┐
│  自建布局与样式                                                │
│  ┌──────────────── CoStageJS ─────────────────────────┐      │
│  │ core（headless，无 UI 依赖）                        │      │
│  │  ├─ RestClient    join/apply/accept/ready/… + JWT  │      │
│  │  ├─ SignalClient  WS 重连/rejoin/四类下行事件分发    │      │
│  │  ├─ MediaEngine   LiveKit room/tracks/设备切换      │      │
│  │  ├─ BoardChannel  白板快照+增量（WS datachannel 同源）│      │
│  │  └─ RoomState     席位/队列/房态/匿名开关 状态机      │      │
│  ├─ ui（可选，costage- 前缀）：video/board/chat 面板    │      │
│  └─ 事件面：on* 订阅（连麦请求/白板/文本/席位/连接态）    │      │
└──────────────────────────────────────────────────────────────┘
            │ HTTP(S) /api/*        │ WS /ws/*        │ WebRTC
            ▼                       ▼                 ▼
        costage-server ────── LiveKit / ZLM(WHEP)
```

## 3. 公开 API（v1 已发布形态）

> 权威签名见 `web-sdk/dist/types/index.d.ts`（下列为节选；`endpoints` 是发布版新增项：
> `rest`/`ws`/`media` 三基址离散可配，缺省全空=同源、`ws`/`media` 回退 `rest`）。

```ts
interface RoomMasterOptions {
  endpoints?: { rest?: string; ws?: string; media?: string }  // 缺省=同源（相对路径）
  token: string              // 业务系统 exchange 换取的 access JWT
  userId: string             // CoStage 数字 uid（换票响应 user.id）
  roomId?: string            // 缺省 r-<userId>（房不存在 join 即建房）
  quality?: '480p' | '720p' | '1080p' | '1080p60'
  thumb?: boolean            // 房主端缩略图上传（大厅卡片预览；缺省开）
}
const room = CoStageJS.initRoomMaster(opts)   // join + WS + LiveKit 全连，返回 handle

interface RoomMasterHandle {
  join(): Promise<Snapshot>                       // REST join（首帧快照）
  publishAv(mic?: boolean): Promise<void>         // 显式开播（未调用=不推流）
  stopPublish(): Promise<void>
  attachRoomMasterVideo(div, opts?): { dispose(): void }   // 主位 + 连麦浮窗（可拖动/交换）
  attachWhiteBoard(div, opts?): BoardAttachmentHandle      // tldraw 白板（含自动存盘/基线）
  onState / onConnectionState / onPermissions / onSeatChange
  onTextMessage / onWhiteBoardData / onCallin              // 事件订阅（返回退订函数）
  setRoomProfile({displayName?, category?, description?})  // 房间资料（商城分类联动靠它）
  closeAnonymousViewer() / openAnonymousViewer()           // = POST access private/open
  openCallin() / closeCallin() / acceptCallin(userId) / rejectCallin(userId)
  kick(userId) / forceLeave(userId) / muteSeat(userId, muted) / chatMute(scope, muted)
  getWhiteList() / setWhiteList(list, enabled?)
  sendText(text) / publishStage({boardOpen?, main?, floats?})  // 消息 / 舞台布局广播
  switchCamera(deviceId?) / switchResolution(id) / muteMic(muted) / setCameraEnabled(on)
  endRoom() / leaveRoom() / destroy()             // 生命周期
}

interface AnonymousViewerOptions {                 // 观看端（匿名，零身份；SDK 自取 anon-token）
  endpoints?: { rest?: string; ws?: string; media?: string }
  roomId: string
  mount: HTMLElement                               // 主画面容器
  board?: HTMLElement                              // 可选：白板只读跟随
  onInfo?: (info: RoomInfo) => void                // 每轮快照（~5s）：标题/分类/准入态
  onStageData?: (s) => void                        // 布局镜像 + 白板显隐
  onChat?: (m: ChatMessage) => void                // 匿名消息（服务端 chat→LK 数据面桥）
  unlockText?: string
}
CoStageJS.initAnonymousViewer(opts): { destroy(): void }
```

与原草图的差异（发布版为准）：`initRoomMaster` 收敛鉴权与连接为一次调用，且**开播必须显式
`publishAv()`**（join 只连接、不推流）；改推 `endpoints` 三基址（离散部署不写死同源）；
`attachRoomMasterVideo` 取代草图的 `attachRoomMasterVideo/attachChat` 中的聊天 UI
（消息面板由宿主自绘，SDK 只给 `onTextMessage`/`sendText`）；`switchResolution` 改四档
`480p/720p/1080p/1080p60`；`destroy()` 全异步（返回 Promise）。

## 4. 抽离路径（施工分期，依赖 appStore 拆分）

| Phase | 内容 | 出口条件 | 状态 |
|---|---|---|---|
| a | **行为不变重构**：从 SPA 抽 `roomClient` 核心（appStore 的 join/rejoin/WS 分发/LiveKit 封装迁入 core；SPA 改为消费 core） | SPA 全功能回归绿（现有测试+页面化）；appStore ≤ 红线 | ✅ 已落地（`web/` 直接依赖 `file:../web-sdk`） |
| b | core 定稿导出 + 打包（ESM/UMD）+ d.ts 类型 + 独立版本号 | demo 页用 window.CoStageJS 跑通开播+观看 | ✅ 已落地（`web-sdk/dist`：UMD/ESM/types，`process.env` 产物守卫） |
| c | 商城内 demo 自建页（员工开播页 + 顾客观看页，替换跳转链路） | 端到端验收 | ✅ 已落地（`demo/`：`/staff/live/` 开播台 + `/live/<roomId>/` 观看页 + 边看边买） |

### 4.1 落地形态与宿主接入要点（2026-09-14）

- **宿主要做什么**：①后端换票（trusted exchange）拿 `{token, userId}`；②把终结点表注入
  `window.__COSTAGE_ENDPOINTS__`（或直接传 `endpoints`）；③`<script src="…/index.js">` 后
  `CoStageJS.initRoomMaster / initAnonymousViewer`；④自己的壳（标题/商品/审批 UI）走 on* 事件与句柄方法。
- **release 产物不进 git**：宿主用同步脚本/静态托管把 `dist/`（`index.js` + `index.mjs` + `types/`）
  放到自己的静态目录；tldraw 图标/字体/翻译已内联，无需额外素材路由。
- **跨源**：三基址离散可配（`rest`/`ws`/`media`），CoStage 侧需 `COSTAGE_CORS_ORIGINS` 放行宿主域。
- **页面化验收**：`demo/scripts/smoke-live.cjs`（观看端真实 WHEP 协商；开播台 SDK 桩验控制面接线）。

## 5. 风险与开放问题（含 2026-09-14 落地说明）

1. **WS 协议成为公共契约**：四类下行事件/席位 JSON 一旦有第三方依赖即冻结——需版本协商
   （握手带 `protoVersion`）与变更日志；**仍开放**（当前以「服务端为准 + SDK 与 SPA 平行实现」兜着）。
2. **tldraw 体积（已实测）**：UMD 单文件全量内联（React + tldraw + livekit）≈ **5.7MB**
   （gzip 后约 1/4）——首屏一次拉取、可长缓存。懒加载/分包**仍开放**（需要宿主是打包型前端）；
   `attachWhiteBoard` 才建编辑器实例，宿主可只在需要时挂容器。
3. **i18n/文案**：宿主注入已就位（`attachWhiteBoard({locale})`、观看端 `unlockText`），
   SDK 内其余文案极少；完整字典注入**仍开放**。
4. **样式作用域**：`costage-` 前缀默认皮肤 + 宿主整体覆盖（发布版）；shadow DOM 隔离**仍开放**。
5. **API 面公开化范围**：连麦审批/踢人/禁言等已全部走 REST+JWT（服务端权威），无需新后端；
   如需"观看端拉房间列表"等管理能力再评估。
6. **宿主自建页的功能面**：demo 开播台未做白名单编辑、摄像头预览、多语言切换
   （官方 SPA 有）——按需补，`RoomMasterHandle` 已提供对应方法。
