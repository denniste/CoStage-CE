/* ==========================================================================
   CoStage — i18n (EN default / ZH) + dynamic section renderers.
   Zero dependencies.
   ========================================================================== */
'use strict';

/* ---------------- static dictionary (data-i18n attributes) ---------------- */

const I18N = {
  en: {
    'nav.features': 'Features',
    'nav.architecture': 'Architecture',
    'nav.deploy': 'Deploy',
    'nav.usecases': 'Use cases',
    'hero.title': 'Realtime classrooms.<br>Live to everyone. <em>One foundation.</em>',
    'hero.sub': 'An open-architecture realtime live, mic-interaction and collaboration foundation. LiveKit SFU powers the interactive plane, ZLMediaKit WHEP carries mass distribution, a relay bot moves every track with zero transcoding — and the whiteboard never leaves the data plane.',
    'hero.cta1': 'Quick start',
    'hero.cta2': 'See the architecture',
    'features.title': 'Everything a live session needs',
    'features.sub': 'Battle-tested through real classrooms — mic management, distribution, whiteboard and resilience in one stack.',
    'arch.title': 'Three planes, one deployment',
    'arch.sub': 'Interaction on a LiveKit SFU, mass viewing on ZLMediaKit WHEP, coordination on WebSocket & data channels — media never touches the data plane.',
    'deploy.title': 'Deploy in an afternoon',
    'deploy.sub': 'One Linux host, Docker optional — the deployment manager ships inside the release and walks you through network, secrets and health checks in the browser.',
    'deploy.portsTitle': 'Ports',
    'usecases.title': 'Built for real sessions',
    'cta.title': 'Your classroom is one wizard away.',
    'cta.sub': 'Download the CE release, run the manager, open the panel. Teach.',
    'cta.btn': 'Get started',
    'footer.note': 'Shipped as compiled artifacts · self-hosted · no telemetry',
  },
  zh: {
    'nav.features': '功能特性',
    'nav.architecture': '系统架构',
    'nav.deploy': '部署指南',
    'nav.usecases': '适用场景',
    'hero.title': '实时课堂，<br>人人可达。<em>一套底座。</em>',
    'hero.sub': '开放架构的实时直播 / 连麦 / 协同底座：LiveKit SFU 承载互动面，ZLMediaKit WHEP 承载大规模分发，转推 bot 零转码搬运每一轨——白板始终不离开数据面。',
    'hero.cta1': '快速上手',
    'hero.cta2': '查看架构',
    'features.title': '一场直播课所需的全部能力',
    'features.sub': '在真实课堂中打磨——连麦管理、分发、白板与韧性，一套栈全包。',
    'arch.title': '三个平面，一次部署',
    'arch.sub': '互动走 LiveKit SFU，大规模观看走 ZLMediaKit WHEP，协同走 WebSocket 与数据通道——媒体流绝不进入数据面。',
    'deploy.title': '一个下午完成部署',
    'deploy.sub': '一台 Linux 主机，Docker 可选——部署管理器随发布包内置，浏览器向导带你完成网络、密钥与健康检查。',
    'deploy.portsTitle': '端口清单',
    'usecases.title': '为真实课堂而生',
    'cta.title': '你的课堂，只差一个向导。',
    'cta.sub': '下载 CE 发布包，运行管理器，打开面板。开课。',
    'cta.btn': '开始使用',
    'footer.note': '以编译产物交付 · 自主部署 · 无遥测',
  },
};

/* ---------------- dynamic content ---------------- */

const ICON = {
  stage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M8.5 9.5l2.5 1.8-2.5 1.8M13 13.5h3"/></svg>',
  whep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.2-4L16.5 4.7a2 2 0 0 1 2.8 2.8L8 18.8 4 20z"/><path d="M14.5 6.5l3 3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/></svg>',
  manager: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M6.5 7h.01M6.5 17h.01M10 7h4M10 17h4"/></svg>',
  quality: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M7 10v4M7 12h2M12 10v4M16.5 10v4M16.5 12h2M18.5 10v4"/></svg>',
  tutor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M9 7.5h7M9 11h5"/></svg>',
  webinar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S13.9 16 14.5 19"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.6c2.6.2 4.1 1.5 4.7 4.4"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21l2-4M16 21l-2-4M9.5 12.5h5"/><circle cx="8" cy="9.5" r=".4"/><circle cx="16" cy="9.5" r=".4"/></svg>',
  support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/><path d="M9 10.5c.5-1.5 1.6-2.3 3-2.3s2.7.8 2.7 2.1c0 1.9-2.6 1.7-2.6 3.2"/><path d="M12 16.5h.01"/></svg>',
};

const CONTENT = {
  en: {
    features: [
      { icon: 'stage', title: 'FloatStage mic management',
        desc: 'Apply → approve → pre-flight → on-stage. Up to 4 floating mic windows with drag, corner-snap and mutual-exclusion swap; the host holds mute / force-off / kick controls.',
        tag: 'LiveKit SFU' },
      { icon: 'whep', title: 'WHEP mass distribution',
        desc: 'A relay bot pushes each participant to ZLMediaKit over WHIP with zero transcoding; every viewer plays sub-second WHEP. Unlimited audience, one deployment.',
        tag: 'ZLMediaKit · 0 transcode' },
      { icon: 'board', title: 'Collaborative whiteboard',
        desc: 'Whiteboard ops travel on the data plane and reach every participant in real time; viewers get a read-only live mirror. Server snapshot keeps late joiners in sync.',
        tag: 'data plane' },
      { icon: 'shield', title: '15-second disconnect hold',
        desc: 'A dropped participant keeps their seat for 15 seconds and rejoins seamlessly — network blips no longer reorder the stage.',
        tag: 'resilience' },
      { icon: 'manager', title: 'One-binary manager',
        desc: 'The release ships with a deployment manager: browser wizard, install, lifecycle, upgrade, rollback and self-update — no systemd, no container runtime required.',
        tag: 'ops' },
      { icon: 'quality', title: 'Fixed quality tiers',
        desc: 'Four locked tiers — 480p30 / 720p30 / 1080p30 / 1080p60 — picked once, switched live via track restart. Predictable bitrate, predictable classrooms.',
        tag: 'WebRTC' },
    ],
    arch: {
      cols: [
        { label: 'Clients', nodes: [
          { name: 'Host', desc: 'FloatStage fixed layout, roster & whitelist control, mic arbitration.', tech: 'browser · React', dot: 'blue' },
          { name: 'Participants', desc: 'On-mic via SFU, self mic/camera control, collaborative whiteboard.', tech: 'browser · WebRTC', dot: 'blue' },
          { name: 'Viewers / Anonymous', desc: 'WHEP multi-stream playback mirroring the host layout; read-only board; chat.', tech: 'browser · WHEP', dot: 'blue' },
        ]},
        { label: 'Interaction plane', nodes: [
          { name: 'LiveKit SFU', desc: 'Selective forwarding for ≤4 on-mic tracks; data channels carry layout, whiteboard ops and chat.', tech: 'SFU · WebSocket signal :7880', dot: 'green' },
          { name: 'relaybot', desc: 'Per-identity WHIP push, H264/opus passthrough, zero transcoding, auto-reconnect, PLI keyframe chain.', tech: 'Go · WHIP → ZLM', dot: 'cyan' },
        ]},
        { label: 'Distribution plane', nodes: [
          { name: 'ZLMediaKit', desc: 'WHEP mass playout with built-in ICE; auto-derives rtsp/rtmp/hls/ts schemas for future protocols.', tech: 'WHEP · ICE :8100', dot: 'amber' },
          { name: 'costage-server', desc: 'Single :80 entry — panel via go:embed, ZLM reverse proxy, WS data gateway, seat state machine.', tech: 'Go · single binary', dot: 'blue' },
        ]},
      ],
      flows: [
        { label: 'WebRTC ↑↓ / WHIP', arrow: '⇄' },
        { label: 'WHIP push · 0 transcode', arrow: '→' },
      ],
      legend: [
        { cls: 'solid', text: 'media plane — WebRTC / WHIP / WHEP' },
        { cls: 'cyan solid', text: 'relay push (per identity, passthrough)' },
        { cls: '', text: 'data plane — WS gateway + LiveKit data channel' },
      ],
    },
    deploy: {
      steps: [
        { title: 'Install Node.js 18+', desc: 'The only runtime the manager needs. Zero npm dependencies — pure standard library.', code: 'apt install nodejs' },
        { title: 'Extract the CE release', desc: 'The tar ships the four service binaries, the panel, and manager.js side by side.', code: 'tar -xzf co-stage-ce-v0.1.0-linux-amd64.tar.gz' },
        { title: 'Start the manager', desc: 'Binds loopback by default; reach it over an SSH tunnel from your workstation.', code: 'node manager.js --dir /opt/costage' },
        { title: 'Run the browser wizard', desc: 'Public IP, ports, auto-generated LiveKit / ZLM secrets, optional TURN — with port preflight checks.', code: 'http://127.0.0.1:8900' },
        { title: 'Health-gated install', desc: 'Renders configs from a single source of truth, starts zlm → livekit → server → relaybot, waits for green health checks.', code: 'render → start → health' },
        { title: 'Open the firewall', desc: 'Expose the media ports below; TLS terminates at your own nginx or gateway — the panel itself is plain HTTP.', code: 'nginx → site/' },
      ],
      term: [
        { cls: 'p', text: '$ ' }, { cls: 'cmd', text: 'node manager.js --dir /opt/costage --addr 127.0.0.1:8900' }, { cls: '', text: '\n' },
        { cls: 'out', text: '[manager] CoStage deployment manager v0.1.0' }, { cls: '', text: '\n' },
        { cls: 'out', text: '[manager] listening on http://127.0.0.1:8900 (dir /opt/costage)' }, { cls: '', text: '\n\n' },
        { cls: 'out', text: '# wizard submitted → installing…' }, { cls: '', text: '\n' },
        { cls: 'hi', text: '[render ]' }, { cls: 'out', text: ' configs/config.ini, configs/livekit.yaml (secrets auto-generated)' }, { cls: '', text: '\n' },
        { cls: 'hi', text: '[start  ]' }, { cls: 'out', text: ' zlm · livekit · costage-server · relaybot' }, { cls: '', text: '\n' },
        { cls: 'hi', text: '[health ]' }, { cls: 'out', text: ' zlm:8100 ' }, { cls: 'ok', text: 'ok' },
        { cls: 'out', text: ' · livekit:7880 ' }, { cls: 'ok', text: 'ok' },
        { cls: 'out', text: ' · server:80 ' }, { cls: 'ok', text: 'ok' }, { cls: '', text: '\n' },
        { cls: 'ok', text: '[done   ] panel → http://<your-public-ip>/' }, { cls: '', text: '\n' },
        { cls: 'p', text: '$ ' }, { cls: 'cursor', text: '' },
      ],
      termTitle: 'manager — zsh',
      portsHead: ['Port', 'Protocol', 'Purpose', 'Exposure'],
      ports: [
        { p: '80', proto: 'tcp', purpose: 'costage-server single entry — panel · API · ZLM reverse proxy', exp: 'public' },
        { p: '7880', proto: 'tcp', purpose: 'LiveKit signaling (WebSocket, signed into tokens)', exp: 'public' },
        { p: '7881', proto: 'tcp', purpose: 'LiveKit RTC fallback over TCP', exp: 'public' },
        { p: '50000–50100', proto: 'udp', purpose: 'LiveKit RTC media ports', exp: 'public' },
        { p: '8100', proto: 'udp+tcp', purpose: 'ZLMediaKit WebRTC — WHIP ingest / WHEP playout / built-in ICE', exp: 'public' },
        { p: '8080', proto: 'tcp', purpose: 'ZLMediaKit HTTP API & hooks', exp: 'loopback' },
        { p: '6379', proto: 'tcp', purpose: 'Redis — seat state, whiteboard snapshot baseline', exp: 'loopback' },
        { p: '8900', proto: 'tcp', purpose: 'deployment manager wizard (SSH tunnel)', exp: 'loopback' },
      ],
      expPublic: 'public',
      expLoop: 'loopback',
    },
    usecases: [
      { icon: 'tutor', title: 'Online tutoring', desc: 'One tutor, up to four students on mic, everyone else watching. Whiteboard + mic arbitration built for the give-and-take of a real lesson.' },
      { icon: 'webinar', title: 'Knowledge-paid live & webinars', desc: 'Unlimited viewers on sub-second WHEP, chat with host-side mute, whitelist-driven participation — open the room, keep the order.' },
      { icon: 'train', title: 'Corporate training', desc: 'Self-hosted on one Linux box behind your own nginx. No third-party media cloud, no telemetry — your classrooms stay yours.' },
      { icon: 'support', title: 'Remote assistance', desc: 'Low-latency two-way media over a single open port set; host controls who speaks, viewers follow the host layout automatically.' },
    ],
  },

  zh: {
    features: [
      { icon: 'stage', title: 'FloatStage 连麦管理',
        desc: '申请→批准→预检→上麦全流程；最多 4 个浮动连麦窗，支持拖拽、角部吸附与互斥交换；房主握有关麦 / 下麦 / 踢人权。',
        tag: 'LiveKit SFU' },
      { icon: 'whep', title: 'WHEP 大规模分发',
        desc: '转推 bot 将每位参与者以 WHIP 零转码直推 ZLMediaKit；每位观看者以亚秒级 WHEP 播放。观众不限量，一套部署。',
        tag: 'ZLMediaKit · 零转码' },
      { icon: 'board', title: '协同白板',
        desc: '白板操作走数据面实时触达全员；观看者只读镜像同步跟随。服务端快照让中途加入者即刻对齐。',
        tag: '数据面' },
      { icon: 'shield', title: '15 秒断线保护',
        desc: '参与者掉线后席位保留 15 秒，重连无缝归位——网络抖动不再打乱课堂秩序。',
        tag: '韧性' },
      { icon: 'manager', title: '单二进制管理器',
        desc: '发布包内置部署管理器：浏览器向导、安装、生命周期、升级、回滚与自更新——无需 systemd，无需容器运行时。',
        tag: '运维' },
      { icon: 'quality', title: '固定清晰度档位',
        desc: '四档锁死——480p30 / 720p30 / 1080p30 / 1080p60——一次选定，经轨道重启热切换。码率可预期，课堂可预期。',
        tag: 'WebRTC' },
    ],
    arch: {
      cols: [
        { label: '客户端', nodes: [
          { name: '房主', desc: 'FloatStage 固定布局、名单与白名单管控、连麦仲裁。', tech: '浏览器 · React', dot: 'blue' },
          { name: '参与者', desc: '经 SFU 上麦，麦克风/摄像头自控，协同白板。', tech: '浏览器 · WebRTC', dot: 'blue' },
          { name: '观看者 / 匿名', desc: 'WHEP 多流拼装镜像房主布局；白板只读；可聊天。', tech: '浏览器 · WHEP', dot: 'blue' },
        ]},
        { label: '互动面', nodes: [
          { name: 'LiveKit SFU', desc: '≤4 路连麦轨选择性转发；数据通道承载布局、白板 ops 与消息。', tech: 'SFU · WebSocket 信令 :7880', dot: 'green' },
          { name: 'relaybot', desc: '逐身份 WHIP 直推，H264/opus 透传零转码，断线自动重连，PLI 关键帧链。', tech: 'Go · WHIP → ZLM', dot: 'cyan' },
        ]},
        { label: '分发面', nodes: [
          { name: 'ZLMediaKit', desc: 'WHEP 大规模播出，内置 ICE；收 WHIP 自动衍生 rtsp/rtmp/hls/ts schema 备扩展。', tech: 'WHEP · ICE :8100', dot: 'amber' },
          { name: 'costage-server', desc: ':80 单一入口——面板 go:embed 内嵌、ZLM 反代、WS 数据网关、席位状态机。', tech: 'Go · 单二进制', dot: 'blue' },
        ]},
      ],
      flows: [
        { label: 'WebRTC ↑↓ / WHIP', arrow: '⇄' },
        { label: 'WHIP 直推 · 零转码', arrow: '→' },
      ],
      legend: [
        { cls: 'solid', text: '媒体面 — WebRTC / WHIP / WHEP' },
        { cls: 'cyan solid', text: '转推（逐身份透传）' },
        { cls: '', text: '数据面 — WS 网关 + LiveKit 数据通道' },
      ],
    },
    deploy: {
      steps: [
        { title: '安装 Node.js 18+', desc: '管理器唯一依赖的运行时。零 npm 依赖——纯标准库实现。', code: 'apt install nodejs' },
        { title: '解压 CE 发布包', desc: 'tar 包内含四个服务二进制、面板与管理器 manager.js。', code: 'tar -xzf co-stage-ce-v0.1.0-linux-amd64.tar.gz' },
        { title: '启动管理器', desc: '默认仅绑回环地址；通过 SSH 隧道从本机浏览器访问。', code: 'node manager.js --dir /opt/costage' },
        { title: '运行浏览器向导', desc: '公网 IP、端口、自动生成 LiveKit / ZLM 密钥、可选 TURN——全程端口预检。', code: 'http://127.0.0.1:8900' },
        { title: '健康门控安装', desc: '从单一事实源渲染配置，依序拉起 zlm → livekit → server → relaybot，等待健康检查全绿。', code: 'render → start → health' },
        { title: '开放防火墙', desc: '放行下方媒体端口；TLS 在你自有的 nginx / 网关终结——面板本身为明文 HTTP。', code: 'nginx → site/' },
      ],
      term: [
        { cls: 'p', text: '$ ' }, { cls: 'cmd', text: 'node manager.js --dir /opt/costage --addr 127.0.0.1:8900' }, { cls: '', text: '\n' },
        { cls: 'out', text: '[manager] CoStage deployment manager v0.1.0' }, { cls: '', text: '\n' },
        { cls: 'out', text: '[manager] listening on http://127.0.0.1:8900 (dir /opt/costage)' }, { cls: '', text: '\n\n' },
        { cls: 'out', text: '# 向导提交 → 安装中…' }, { cls: '', text: '\n' },
        { cls: 'hi', text: '[render ]' }, { cls: 'out', text: ' configs/config.ini, configs/livekit.yaml（密钥自动生成）' }, { cls: '', text: '\n' },
        { cls: 'hi', text: '[start  ]' }, { cls: 'out', text: ' zlm · livekit · costage-server · relaybot' }, { cls: '', text: '\n' },
        { cls: 'hi', text: '[health ]' }, { cls: 'out', text: ' zlm:8100 ' }, { cls: 'ok', text: 'ok' },
        { cls: 'out', text: ' · livekit:7880 ' }, { cls: 'ok', text: 'ok' },
        { cls: 'out', text: ' · server:80 ' }, { cls: 'ok', text: 'ok' }, { cls: '', text: '\n' },
        { cls: 'ok', text: '[done   ] 面板入口 → http://<your-public-ip>/' }, { cls: '', text: '\n' },
        { cls: 'p', text: '$ ' }, { cls: 'cursor', text: '' },
      ],
      termTitle: 'manager — zsh',
      portsHead: ['端口', '协议', '用途', '暴露面'],
      ports: [
        { p: '80', proto: 'tcp', purpose: 'costage-server 单一入口——面板 · API · ZLM 反代', exp: 'public' },
        { p: '7880', proto: 'tcp', purpose: 'LiveKit 信令（WebSocket，签进 token）', exp: 'public' },
        { p: '7881', proto: 'tcp', purpose: 'LiveKit RTC over TCP 兜底', exp: 'public' },
        { p: '50000–50100', proto: 'udp', purpose: 'LiveKit RTC 媒体端口段', exp: 'public' },
        { p: '8100', proto: 'udp+tcp', purpose: 'ZLMediaKit WebRTC——WHIP 接入 / WHEP 播出 / 内置 ICE', exp: 'public' },
        { p: '8080', proto: 'tcp', purpose: 'ZLMediaKit HTTP API 与 hook', exp: 'loopback' },
        { p: '6379', proto: 'tcp', purpose: 'Redis——席位状态、白板快照基线', exp: 'loopback' },
        { p: '8900', proto: 'tcp', purpose: '部署管理器向导（SSH 隧道）', exp: 'loopback' },
      ],
      expPublic: '公网',
      expLoop: '仅回环',
    },
    usecases: [
      { icon: 'tutor', title: '在线辅导', desc: '一位老师、最多四名学生上麦，其余观看。白板 + 连麦仲裁为真实课堂的来回互动而生。' },
      { icon: 'webinar', title: '知识付费直播 / 在线讲座', desc: 'WHEP 亚秒级承载不限量观众，聊天带房主禁言闸，白名单驱动参与——开门迎客，秩序在手。' },
      { icon: 'train', title: '企业内训', desc: '单机自托管，藏身于自有 nginx 之后。无第三方媒体云、无遥测——课堂数据归你。' },
      { icon: 'support', title: '远程协助', desc: '单端口集合承载低延时双向媒体；发言权由房主掌控，观看者自动跟随房主布局。' },
    ],
  },
};

/* ---------------- engine ---------------- */

let lang = 'en';
try { lang = localStorage.getItem('costage-lang') || 'en'; } catch (e) { /* private mode */ }
if (!I18N[lang]) lang = 'en';

function t(key) {
  return (I18N[lang] && I18N[lang][key]) !== undefined ? I18N[lang][key]
       : I18N.en[key] !== undefined ? I18N.en[key] : key;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------------- renderers ---------------- */

function renderFeatures() {
  const el = document.getElementById('featureGrid');
  el.innerHTML = CONTENT[lang].features.map(f => `
    <div class="card">
      <div class="ico">${ICON[f.icon] || ''}</div>
      <h3>${esc(f.title)}</h3>
      <p>${esc(f.desc)}</p>
      ${f.tag ? `<span class="tag">${esc(f.tag)}</span>` : ''}
    </div>`).join('');
}

function renderArch() {
  const a = CONTENT[lang].arch;
  const cols = a.cols.map((c, i) => `
    ${i > 0 ? `<div class="arch-flow">${a.flows[i - 1] ? `
      <div class="flow-lane">
        <span class="flow-label">${esc(a.flows[i - 1].label)}</span>
        <span class="flow-arrow">${esc(a.flows[i - 1].arrow)}</span>
      </div>` : ''}</div>` : ''}
    <div class="arch-col">
      <div class="arch-col-label">${esc(c.label)}</div>
      ${c.nodes.map(n => `
        <div class="arch-node">
          <div class="n-name"><span class="dot ${esc(n.dot)}"></span>${esc(n.name)}</div>
          <div class="n-desc">${esc(n.desc)}</div>
          <div class="n-tech">${esc(n.tech)}</div>
        </div>`).join('')}
    </div>`).join('');
  document.getElementById('archDiagram').innerHTML = cols;
  document.getElementById('archLegend').innerHTML = a.legend.map(l => `
    <span class="lg"><span class="sw ${esc(l.cls)}"></span>${esc(l.text)}</span>`).join('');
}

function renderDeploy() {
  const d = CONTENT[lang].deploy;
  document.getElementById('deploySteps').innerHTML = d.steps.map((s, i) => `
    <div class="step">
      <div class="num">${i + 1}</div>
      <div>
        <h4>${esc(s.title)}</h4>
        <p>${esc(s.desc)}${s.code ? ` <code>${esc(s.code)}</code>` : ''}</p>
      </div>
    </div>`).join('');

  const term = document.getElementById('deployTerm');
  term.innerHTML = `
    <div class="t-bar">
      <span class="c r"></span><span class="c y"></span><span class="c g"></span>
      <span class="t-title">${esc(d.termTitle)}</span>
    </div>
    <div class="t-body">${d.term.map(l => {
      if (l.cls === 'cursor') return '<span class="cursor"></span>';
      return `<span class="${esc(l.cls)}">${esc(l.text)}</span>`;
    }).join('')}</div>`;

  document.getElementById('portsTable').innerHTML = `
    <tr>${d.portsHead.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
    ${d.ports.map(r => `
      <tr>
        <td class="p">${esc(r.p)}</td>
        <td class="proto">${esc(r.proto)}</td>
        <td>${esc(r.purpose)}</td>
        <td>${esc(r.exp === 'public' ? d.expPublic : d.expLoop)}</td>
      </tr>`).join('')}`;
}

function renderUsecases() {
  document.getElementById('usecaseGrid').innerHTML = CONTENT[lang].usecases.map(u => `
    <div class="card">
      <div class="ico">${ICON[u.icon] || ''}</div>
      <h3>${esc(u.title)}</h3>
      <p>${esc(u.desc)}</p>
    </div>`).join('');
}

/* ---------------- language switching ---------------- */

function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n'));
  });
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  const label = lang === 'en' ? '中文' : 'EN';
  const b1 = document.getElementById('langToggle');
  const b2 = document.getElementById('langToggle2');
  if (b1) b1.textContent = label;
  if (b2) b2.textContent = label;
  document.title = lang === 'zh'
    ? 'CoStage — 实时互动直播与协同底座'
    : 'CoStage — Realtime Interactive Live & Collaboration Foundation';
}

function renderAll() {
  renderFeatures();
  renderArch();
  renderDeploy();
  renderUsecases();
}

function setLang(next) {
  if (!I18N[next] || next === lang) return;
  lang = next;
  try { localStorage.setItem('costage-lang', next); } catch (e) { /* ignore */ }
  applyStatic();
  renderAll();
}

/* ---------------- boot ---------------- */

applyStatic();
renderAll();

const toggle = () => setLang(lang === 'en' ? 'zh' : 'en');
document.getElementById('langToggle').addEventListener('click', toggle);
document.getElementById('langToggle2').addEventListener('click', toggle);
