# CoStage CE（Community Edition）v0.2.1

通用实时直播/连麦/协同底座——首个场景：在线辅导课堂。单机 Docker 一键部署。

## 这是什么

一场课的形态：**1 位老师（房主）+ 最多 4 位学生（连麦参与者）+ 不限人数的观众（观看者/匿名）**。

- 老师开房间，分享房间号（或邀请链接）
- 学生输入 ID 进入；名单内学生可在页面申请连麦，老师批准后音视频上麦
- 观众无需账号：打开房间链接即看（老师画面 + 连麦画面 + 白板实时镜像），可发文字消息
- 连麦画面以浮动小窗叠加在主画面上，可拖动、可与主画面交换；所有人看到的布局实时跟随老师

## 功能（v0.2.1）

- 实时音视频连麦（≤4 学生），15 秒断线保护
- 内嵌 TURN 中继（可选）：跨网段/严格 NAT 时浏览器媒体中继，ICE 凭据自动签发（无需构建参数）
- 协同白板：老师/上麦学生实时共笔，观看者/匿名只读实时镜像，掉线自动恢复
- 观看端多路 WHEP 低延迟拉流，布局实时跟随老师端
- 消息（文本+emoji）、全员禁言、发言黑名单/踢出
- 房主管控：批准/拒绝连麦申请、关麦、下麦、踢出；摄像头切换、清晰度四档（480p/720p/1080p/1080p60）、麦克风自控
- 连麦白名单：房主在页面动态编辑；名单内学生即参与者身份（可申请连麦）
- 转推分发：SFU 逐路转推 ZLMediaKit，观看端原生 WebRTC（WHEP），无转码
- **JavaScript SDK**（发布包 `sdk/`）：`costage-sdk-<ver>.min.js` 一行 `<script>` 引入即得全局 `CoStageJS`，另有 ESM 版与 TypeScript 类型；第三方业务系统可零依赖嵌入直播/连麦/白板能力

## JavaScript SDK（`sdk/`）

| 文件 | 用途 |
|---|---|
| `costage-sdk-v0.2.1.min.js` | UMD 单文件（**混淆**），`<script src>` 直引 → 全局 `CoStageJS` |
| `costage-sdk-v0.2.1.mjs` | ESM 版（**混淆**），供 vite/webpack 等打包器 `import` |
| `types/**` | TypeScript 声明（未混淆，供编辑器补全） |
| `README.md` | SDK 用法、终结点配置、拓扑 A/B 部署说明 |

```html
<script src="/sdk/costage-sdk-v0.2.1.min.js"></script>
<script>
  const ep = CoStageJS.resolveEndpoints({ rest: location.origin })   // 同源部署可省略
  CoStageJS.initAnonymousViewer({ roomId: 'r-<房主ID>', endpoints: ep, mount: document.body })
</script>
```

> 也在 GitHub Release 提供独立资产 `co-stage-sdk-<ver>.zip`（仅 SDK，不必下载整包）。
> 混淆档位见 `scripts/build-sdk-dist.sh`（关控制流扁平化/死代码注入/自我保护，保留字符串抽取）。

## v0.2.1 修复

- **域名 + TLS 部署下媒体全黑**：管理器渲染 ZLM `[rtc] externIP` 时误把域名写进 ICE 候选（必须是 IP），
  导致 relaybot 开流失败、观看端收不到流。现取 `PublicIP`（IP 优先，其次 DNS 解析），解析不到则留空由 ZLM 自动取网卡 IP。

## v0.2.1 已知边界

1. **同时最多 1 个活跃房间**（服务端硬闸）：开新课须先结束当前房间
2. 无观看准入：知道房间号即可观看（签名 URL/观看码/Webhook 后置版本提供）
3. 无录制回看
4. 房主白板逐人禁绘+一键清迹未提供
5. 付费发言（speak）后置
6. 单机部署假设（无集群/多节点）
7. 生产建议自备 TLS（nginx 443 或外层网关）

> 除「1 个房间 + 无录制回看」两项外，CE 与完整版功能一致；后续新增功能不再做 CE 裁剪。

## 快速开始

前置：一台 Linux 主机（Docker + Docker Compose v2），同网段或公网可达的客户端浏览器。

**方式 A（推荐）：部署管理器向导**——管理器为**独立发布资产**（GitHub Release 的 `co-stage-manager-*-linux-amd64.tar.gz`，或源码仓 `scripts/start-manager.sh fetch` 一键拉取解包）。目标机解包后运行 `./costage-manager`，浏览器打开 `http://127.0.0.1:8900` 按向导完成安装（自动生成密钥与全部配置，含健康等待；自动从 GitHub 拉取本 CE 产品包）。管理器使用说明见资产内 `README_MANAGER.md`，systemd 示例见文末。

**方式 B：手工 Compose**

```bash
# 1. 解压发布包（或克隆后进入 deploy/）
cd deploy

# 2. 配置
cp .env.example .env
#    修改 COSTAGE_LIVEKIT_URL=ws://<本机IP>:7880
vi configs/zlm.ini
#    externIP= 改为 <本机IP>；secret 建议改掉（同步修改 compose 里 relaybot 的 ZLM_SECRET）

# 3. 启动
docker compose up -d

# 4. 访问（单入口：面板 + API/WS + WHEP 同源）
#    面板：http://<本机IP>/
#    老师建房 → 得到房间号；学生入房输入 ID；观众直接开 /room/<房间号>
```

> **HTTPS 与连麦**：摄像头/麦克风采集要求安全上下文（HTTPS 或 localhost）——`http://<IP>` 快速开始**仅可观看/白板**，老师开播与学生连麦须走域名+TLS（`configs/nginx-costage.conf` 样例，生产推荐）或本机 `http://localhost` 调试。

## 端口清单

两种形态宿主端口不同：方式 B（compose）映射固定为 80/8080（由 Docker daemon 绑定，无需 root）；方式 A（部署管理器 native）默认 7860/7900（免 root 绑定），全部可配。

| 端口 | 用途 |
|---|---|
| 80（compose）/ 7860（管理器默认） | 唯一入口：面板 + API/WS + WHEP 同源（Go 单二进制内嵌面板与 ZLM 反代） |
| 7880/tcp | LiveKit 信令 WebSocket（浏览器直连） |
| 7881/tcp、50000-50100/udp | LiveKit 媒体（固定，参与端口矩阵查重） |
| 8100/udp、8100/tcp | ZLMediaKit WebRTC 媒体（管理器形态可配） |
| 8080（compose）/ 7900（管理器默认）/tcp | ZLMediaKit HTTP（调试用，可不对公网开放） |
| 554/tcp、1935/tcp、9000/udp | ZLMediaKit RTSP/RTMP/SRT 拉流广播（默认禁用 0；管理器形态可配，开启后 WHIP 推入的流自动转封装） |
| 3478/udp、3479/tcp | TURN 信令（可配，默认 3478/udp+3479/tcp） |
| 49160-49999/udp | TURN relay 端口段（可配，须避开 LiveKit 50000-50100） |
| （8091） | 业务服务 API（已由入口同源承载；如映射仅作调试） |

## 跨网段/严格 NAT

同网段学生直连即可。跨网段部署：在 `.env` 填入 `TURN_SECRET`（任意强随机串）与 `PUBLIC_IP`（宿主对外 IP，与 `COSTAGE_LIVEKIT_URL` / zlm.ini `externIP` 一致），`docker compose up -d` 重启 server 容器即可——TURN 内嵌于业务服务（3478/udp + 3479/tcp + relay 段 49160-49999/udp），浏览器经 `/api/ice-servers` 自动领取短时凭据，**无需重新构建镜像**。使用部署管理器（方式 A）时在「TURN」页签勾选「启用 TURN 中继」等效。

## 架构一句话

互动面走 LiveKit SFU（连麦音视频 + 白板数据通道）；转推 bot 把每路音视频逐条转推 ZLMediaKit；观看端以 WHEP 逐路拉流在页面内拼装；消息/白板指令/布局指令走 WebSocket 与 LiveKit 数据通道，永不烧进视频。

## systemd（可选）

    # /etc/systemd/system/costage-manager.service
    [Unit]
    Description=CoStage Deployment Manager
    After=network.target docker.service

    [Service]
    WorkingDirectory=/opt/costage
    ExecStart=/opt/costage/costage-manager --dir /opt/costage --addr 0.0.0.0:8900 --password <你的管理口令>
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target

## 第三方组件与许可

CoStage CE 仅以编译产物分发（见 `LICENSE`）。包内第三方组件的署名与许可全文随包提供：

- `third-party/LICENSE.livekit.txt` + `third-party/NOTICE.livekit.txt` —— **LiveKit server**，Apache-2.0
  （Apache-2.0 §4(d) 要求随分发复制上游 NOTICE）
- `third-party/LICENSE.zlmediakit.txt` —— **ZLMediaKit**（`MediaServer`），MIT
- `third-party/LICENSE.tldraw.txt` —— **tldraw**（面板 / JS SDK 内的白板引擎），**tldraw license**：
  ⚠ 非开源许可，**用于生产环境须先向 tldraw Inc. 购买商业许可**（开发/测试不受限），且要求随分发附全文
- 完整清单（含 Go/Pion/React 等依赖）与逐条说明见包根 **`THIRD-PARTY.md`**

## 许可与源码

本产品以编译产物发布（无源码、无 License 机制、无功能开关）。 issues 反馈渠道由发布方提供。
