# CoStage CE（Community Edition）v0.1

通用实时直播/连麦/协同底座——首个场景：在线辅导课堂。单机 Docker 一键部署。

## 这是什么

一场课的形态：**1 位老师（房主）+ 最多 4 位学生（连麦参与者）+ 不限人数的观众（观看者/匿名）**。

- 老师开房间，分享房间号（或邀请链接）
- 学生输入 ID 进入；名单内学生可在页面申请连麦，老师批准后音视频上麦
- 观众无需账号：打开房间链接即看（老师画面 + 连麦画面 + 白板实时镜像），可发文字消息
- 连麦画面以浮动小窗叠加在主画面上，可拖动、可与主画面交换；所有人看到的布局实时跟随老师

## 功能（v0.1）

- 实时音视频连麦（≤4 学生），15 秒断线保护
- 协同白板：老师/上麦学生实时共笔，观看者/匿名只读实时镜像，掉线自动恢复
- 观看端多路 WHEP 低延迟拉流，布局实时跟随老师端
- 消息（文本+emoji）、全员禁言、发言黑名单/踢出
- 房主管控：批准/拒绝连麦申请、关麦、下麦、踢出；摄像头切换、清晰度四档（480p/720p/1080p/1080p60）、麦克风自控
- 连麦白名单：房主在页面动态编辑；名单内学生即参与者身份（可申请连麦）
- 转推分发：SFU 逐路转推 ZLMediaKit，观看端原生 WebRTC（WHEP），无转码

## v0.1 已知边界

1. 无观看准入：知道房间号即可观看（签名 URL/观看码/Webhook 后置版本提供）
2. 无录制回看
3. 房主白板逐人禁绘+一键清迹未提供
4. 付费发言（speak）后置
5. 单机部署假设（无集群/多节点）
6. 生产建议自备 TLS（nginx 443 或外层网关）

## 快速开始

前置：一台 Linux 主机（Docker + Docker Compose v2），同网段或公网可达的客户端浏览器。

**方式 A（推荐）：部署管理器向导**——解压后运行 `./costage-manager`，浏览器打开 `http://127.0.0.1:8900` 按向导完成安装（自动生成密钥与全部配置，含健康等待）。systemd 示例见文末。

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

## 端口清单

| 端口 | 用途 |
|---|---|
| 80 | 唯一入口：面板 + API/WS + WHEP 同源（Go 单二进制内嵌面板与 ZLM 反代） |
| 7880/tcp | LiveKit 信令 WebSocket（浏览器直连） |
| 7881/tcp、50000-50100/udp | LiveKit 媒体 |
| 8100/udp、8100/tcp | ZLMediaKit WebRTC 媒体 |
| 8080/tcp | ZLMediaKit HTTP（调试用，可不对公网开放） |
| 3478/udp+tcp | TURN（可选，跨网段时启用） |
| （8091） | 业务服务 API（已由 80 同源承载；如映射仅作调试） |

## 跨网段/严格 NAT

同网段学生直连即可。跨网段部署：启用 compose 中的 coturn 服务，并以构建参数注入 TURN（`VITE_TURN_URLS` 等，见 server.Dockerfile 与 .env.example），重新 `docker compose build server`。

## 架构一句话

互动面走 LiveKit SFU（连麦音视频 + 白板数据通道）；转推 bot 把每路音视频逐条转推 ZLMediaKit；观看端以 WHEP 逐路拉流在页面内拼装；消息/白板指令/布局指令走 WebSocket 与 LiveKit 数据通道，永不烧进视频。

## systemd（可选）

    # /etc/systemd/system/costage-manager.service
    [Unit]
    Description=CoStage Deployment Manager
    After=network.target docker.service

    [Service]
    WorkingDirectory=/opt/costage
    ExecStart=/opt/costage/manager --dir /opt/costage --addr 0.0.0.0:8900 --password <你的管理口令>
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target

## 许可与源码

本产品以编译产物发布（无源码、无 License 机制、无功能开关）。 issues 反馈渠道由发布方提供。
