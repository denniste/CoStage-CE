# CoStageJS —— 直播客户端 JavaScript Library 设计稿（Mode 2，待立项）

> 状态：**设计稿，未施工**（2026-09-12）。目标读者：CoStage 前端维护者 + 业务系统集成方。
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

## 3. 公开 API（v1 定稿建议）

```ts
interface CoStageRoomOptions {
  server:  string              // CoStage 入口（https://live.example.com）
  token:   string              // 业务系统换取的 access JWT；匿名观看传匿名票或走 initAnonymous
  roomId:  string
}

const room = CoStageJS.initRoomMaster(options)   // join + WS + LiveKit 全连，返回 RoomHandle

interface RoomHandle {
  // —— UI 挂载（可选；不挂载则纯 headless，状态走 on* 事件）——
  attachRoomMasterVideo(div: HTMLElement): void   // 主视频 + 连麦视频面板（costage-tile 等）
  attachWhiteBoard(div: HTMLElement): void        // 白板画布（tldraw 实例由库管理）
  attachChat(div: HTMLElement): void              // v1.1 预定
  // —— 事件订阅 ——
  onCallin(cb: (req: {userId: string; displayName: string}) => void): void
  onWhiteBoardData(cb: (data: unknown) => void): void
  onTextMessage(cb: (msg: {userId: string; text: string; ts: number}) => void): void
  onSeatChange(cb: (seats: SeatSnapshot[]) => void): void
  onConnectionState(cb: (s: 'connecting'|'connected'|'reconnecting'|'closed') => void): void
  // —— 房主控制（身份由 JWT 决定，服务端权威校验）——
  closeAnonymousViewer(): Promise<void>           // = POST access private
  openAnonymousViewer(): Promise<void>
  closeCallin(): Promise<void>                    // = apply-open false
  acceptCallin(userId: string): Promise<void>
  kick(userId: string): Promise<void>
  getWhiteList(): Promise<string[]>
  setWhiteList(list: string[]): Promise<void>
  // —— 设备 ——
  switchCamera(deviceId?: string): Promise<void>
  switchResolution(r: 'low'|'std'|'high'): Promise<void>
  muteMic(muted: boolean): Promise<void>
  // —— 观看端 ——
  initAnonymousViewer(opts): RoomHandle           // 匿名票引导 + WHEP 播放（无 publish 能力）
  // —— 生命周期 ——
  destroy(): void                                 // 断 WS/LK、释放 tracks、解绑 DOM
}
```

与原草图的差异（评审用）：`initRoomMaster` 收敛鉴权与连接为一次调用；补 `destroy`/
`onSeatChange`/`onConnectionState`/`muteMic`/`initAnonymousViewer`（缺了它们宿主无法做
可靠生命周期与观看端）；白名单读写按 JWT 身份走 REST（`getWhiteList/setWhiteList`）。

## 4. 抽离路径（施工分期，依赖 appStore 拆分）

| Phase | 内容 | 出口条件 |
|---|---|---|
| a | **行为不变重构**：从 SPA 抽 `roomClient` 核心（appStore 的 join/rejoin/WS 分发/LiveKit 封装迁入 core；SPA 改为消费 core） | SPA 全功能回归绿（现有测试+页面化）；appStore ≤ 红线 |
| b | core 定稿导出 + 打包（ESM/UMD）+ d.ts 类型 + 独立版本号 | demo 页用 window.CoStageJS 跑通开播+观看 |
| c | 商城内 demo 自建页（员工开播页 + 顾客观看页，替换跳转链路） | 端到端验收 |

## 5. 风险与开放问题

1. **WS 协议成为公共契约**：四类下行事件/席位 JSON 一旦有第三方依赖即冻结——需版本协商
   （握手带 `protoVersion`）与变更日志；
2. **tldraw 体积**：白板是最大依赖（~MB 级）——挂载才加载（动态 import），或 v1 白板仅数据通道
   + 宿主自选画布库；
3. **i18n/文案**：库内 UI 面的文案暴露 hooks（宿主注入字典），默认 zh；
4. **样式作用域**：`costage-` 前缀 + shadow DOM 可选挂载模式（隔离宿主样式互染）；
5. **API 面公开化范围**：连麦审批/踢人/禁言等已全部走 REST+JWT（服务端权威），无需新后端；
   如需"观看端拉房间列表"等管理能力再评估。
