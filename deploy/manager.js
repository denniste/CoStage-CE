#!/usr/bin/env node
// CoStage 部署管理器（CE v0.1，Node 纯标准库，零 npm 依赖）。
// 定位：临时安装/更新工具——Web 模块面板（状态/配置/日志/升级）→ 渲染配置 → 拉起/停止全家桶进程
// （detached + pidfile + 日志文件）。不用 systemd、不用 Docker、不污染系统；
// manager 退出后服务进程独立存活；重启机器后跑一次 `node manager.js start` 即可拉起。
//
// 用法：node manager.js [--dir <bundle目录>] [--addr 127.0.0.1:8900] [--password xxx]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

// ---- 参数 ----
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const DIR = path.resolve(arg('dir', __dirname));
const ADDR = arg('addr', '127.0.0.1:8900');
const PASSWORD = arg('password', '');
const VERSION = 'v0.1.0';

const P = (...f) => path.join(DIR, ...f);
const PARAMS = P('params.json');
const CONFIGS = P('configs');
const SERVICES = [
  { name: 'zlm', exe: 'bin/MediaServer', args: ['-c', 'configs/config.ini'], portKey: 'zlmHttpPort' },
  { name: 'livekit', exe: 'bin/livekit-server', args: ['--config', 'configs/livekit.yaml'], portKey: 'livekitPort' },
  { name: 'server', exe: 'bin/costage-server', args: [], portKey: 'serverPort', http: '/healthz' },
  { name: 'relaybot', exe: 'bin/relaybot', args: [], port: 0 },
];

// ---- params（唯一配置源；首次自动生成密钥） ----
const hex = (n) => crypto.randomBytes(n).toString('hex');
function defaultParams() {
  return {
    publicIp: arg('ip', ''), serverPort: 80, zlmHttpPort: 8080, livekitPort: 7880,
    liveKitKey: 'devkey', liveKitSecret: hex(32), zlmSecret: hex(32),
    holdSeconds: 15, devAuth: true,
    domain: '', tls: false, tlsCert: '', tlsKey: '',
    // 全新安装时补齐上游二进制（留空=跳过，面板上可改；zlm 上游无稳定 release 资产）
    upstreams: {
      livekit: 'https://github.com/livekit/livekit/releases/download/v1.13.6/livekit_1.13.6_linux_amd64.tar.gz',
      zlm: '',
    },
    turn: { enabled: false, realm: 'costage', port: 3478, password: hex(16) },
  };
}
let paramsCache = null;
function params() {
  if (paramsCache) return paramsCache;
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(PARAMS, 'utf8')); } catch {}
  paramsCache = { ...defaultParams(), ...saved }; // 老 params.json 缺新字段时补默认值
  return paramsCache;
}
function saveParams(p) { paramsCache = p; fs.writeFileSync(PARAMS, JSON.stringify(p, null, 2), { mode: 0o600 }); }

// ---- 配置渲染（单源：secret 由 params 一次生成） ----
function render(p) {
  const configIni = `# ZLMediaKit（costage-manager 渲染；勿手编）
[general]
auto_close=0

[http]
port=${p.zlmHttpPort}
# ZLM 自带 HTTPS 关闭（0=禁用）：443 由 nginx 独占，避免抢端口导致 ZLM 整体退出
sslport=0

[api]
apiDebug=1
secret=${p.zlmSecret}

[rtc]
externIP=${p.domain || p.publicIp}
port=8100
tcpPort=8100
preferredCodecA=opus

[hook]
enable=0
`;
  const livekitYaml = `# LiveKit（costage-manager 渲染；勿手编）
port: ${p.livekitPort}
bind_addresses:
  - "::"
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: true
keys:
  ${p.liveKitKey}: ${p.liveKitSecret}
`;
  return { 'configs/config.ini': configIni, 'configs/livekit.yaml': livekitYaml };
}

// ---- nginx 站点渲染（域名模式；独立于 render()，不落部署目录） ----
function renderNginx(p) {
  const name = p.domain || 'costage.example.com';
  const app = `127.0.0.1:${p.serverPort}`;
  const lk = `127.0.0.1:${p.livekitPort}`;
  const tlsOn = !!(p.tls && p.tlsCert && p.tlsKey);
  const locs = `    location /lk/ {
        proxy_pass http://${lk}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
    location / {
        proxy_pass http://${app};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }`;
  const head = '# CoStage 站点（costage-manager 渲染；勿手编——面板内编辑后「校验并应用」）\n';
  if (!tlsOn) return `${head}server {
    listen 80;
    server_name ${name};
${locs}
}
`;
  return `${head}server {
    listen 80;
    server_name ${name};
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name ${name};
    ssl_certificate     ${p.tlsCert};
    ssl_certificate_key ${p.tlsKey};
${locs}
}
`;
}

// ---- 进程管理 ----
const pidFile = (s) => P('run', s + '.pid');
const logFile = (s) => P('logs', s + '.log');
function pidOf(s) { try { return Number(fs.readFileSync(pidFile(s), 'utf8').trim()); } catch { return 0; } }
function alive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
function svcDef(svc) { return SERVICES.find((s) => s.name === svc); }

const envFor = (svc, p) => {
  const e = { ...process.env };
  if (svc === 'server') Object.assign(e, {
    COSTAGE_ADDR: ':' + p.serverPort,
    // 域名模式：信令经 nginx wss://域名/lk 入口；否则直连 ws://IP:7880
    COSTAGE_LIVEKIT_URL: p.domain ? `wss://${p.domain}/lk` : `ws://${p.publicIp}:${p.livekitPort}`,
    COSTAGE_LIVEKIT_API_URL: 'http://127.0.0.1:' + p.livekitPort,
    COSTAGE_LIVEKIT_KEY: p.liveKitKey,
    COSTAGE_LIVEKIT_SECRET: p.liveKitSecret,
    COSTAGE_REDIS_ADDR: '127.0.0.1:6379',
    COSTAGE_ZLM_PROXY: 'http://127.0.0.1:' + p.zlmHttpPort,
    COSTAGE_HOLD_SECONDS: String(p.holdSeconds),
    COSTAGE_DEV_AUTH: p.devAuth ? '1' : '0',
  });
  if (svc === 'relaybot') Object.assign(e, {
    LK_URL: 'ws://127.0.0.1:' + p.livekitPort,
    LK_KEY: p.liveKitKey, LK_SECRET: p.liveKitSecret,
    ZLM_WHIP: 'http://127.0.0.1:' + p.zlmHttpPort + '/index/api/whip',
    ZLM_API: 'http://127.0.0.1:' + p.zlmHttpPort,
    ZLM_SECRET: p.zlmSecret, ICE_URLS: '', RELAYBOT_GUARD: '0',
  });
  return e;
};
function startSvc(svc) {
  const p = params();
  const def = svcDef(svc);
  if (!def) return { ok: false, error: '未知服务' };
  if (alive(pidOf(svc))) return { ok: true, note: '已在运行' };
  const exe = P(def.exe);
  if (!fs.existsSync(exe)) return { ok: false, error: `缺少 ${def.exe}` };
  fs.mkdirSync(P('run'), { recursive: true });
  fs.mkdirSync(P('logs'), { recursive: true });
  const out = fs.openSync(logFile(svc), 'a');
  const child = spawn(exe, def.args, { cwd: DIR, env: envFor(svc, p), detached: true, stdio: ['ignore', out, out] });
  child.unref();
  fs.closeSync(out);
  fs.writeFileSync(pidFile(svc), String(child.pid));
  return { ok: true, pid: child.pid };
}
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function stopSvc(svc) {
  const pid = pidOf(svc);
  if (!alive(pid)) { try { fs.unlinkSync(pidFile(svc)); } catch {} return { ok: true, note: '未运行' }; }
  try { process.kill(pid, 'SIGTERM'); } catch {}
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && alive(pid)) sleep(200);
  if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  try { fs.unlinkSync(pidFile(svc)); } catch {}
  return { ok: true };
}

// ---- 工具 ----
function tcpOK(port) {
  const net = require('net');
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 2000);
  });
}
function httpOK(port, hp) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: hp || '/' }, (res) => {
      res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}
function writeJSON(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// ---- GitHub release 安装源（CoStage-CE 最新 release） ----
const REPO = process.env.COSTAGE_REPO || 'denniste/CoStage-CE';
const https = require('https');
function ghJSON(pathname) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      host: 'api.github.com', path: pathname,
      headers: { 'User-Agent': 'costage-manager', Accept: 'application/vnd.github+json' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const u = new URL(res.headers.location);
        res.resume();
        return resolve(ghJSON(u.pathname + u.search));
      }
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('GitHub API 超时')); });
  });
}
async function latestRelease() {
  const d = await ghJSON(`/repos/${REPO}/releases/latest`);
  if (!d || !d.tag_name) throw new Error('未找到 release');
  const asset = (d.assets || []).find((a) => /linux-amd64\.tar\.gz$/.test(a.name));
  if (!asset) throw new Error('release 中无 linux-amd64 tar 包');
  return { tag: d.tag_name, name: d.name, publishedAt: d.published_at, htmlUrl: d.html_url,
    asset: { name: asset.name, size: asset.size, url: asset.browser_download_url } };
}

// ---- release 安装任务（下载 → 布局映射解包 → 补上游二进制 → 重渲染 → 重启） ----
let relJob = null; // {phase, progress, error}
function dl(url, dest) { execSync(`curl -sfL --connect-timeout 15 -o '${dest}' '${url}'`, { timeout: 600000 }); }
function extractTar(tar, tmp) {
  fs.mkdirSync(tmp, { recursive: true });
  try { execSync(`tar -xzf '${tar}' -C '${tmp}'`); } catch { execSync(`tar -xf '${tar}' -C '${tmp}'`); }
}
function ensureUpstreamBinaries() {
  const up = params().upstreams || {};
  const need = [];
  if (!fs.existsSync(P('bin', 'livekit-server')) && up.livekit) need.push(['livekit-server', up.livekit, 'livekit']);
  if (!fs.existsSync(P('bin', 'MediaServer')) && up.zlm) need.push(['MediaServer', up.zlm, 'MediaServer']);
  for (const [name, url, findName] of need) {
    relJob.phase = 'binaries';
    const tar = P('incoming', name + '-upstream.tar.gz');
    dl(url, tar);
    const tmp = P('incoming', '.up-' + name);
    fs.rmSync(tmp, { recursive: true, force: true });
    extractTar(tar, tmp);
    const found = execSync(`find '${tmp}' -maxdepth 3 \\( -type f -name '${findName}' -o -type f -name '${findName}-server' \\) | head -1`).toString().trim();
    if (!found) throw new Error(`上游包中未找到 ${name} 可执行文件`);
    fs.mkdirSync(P('bin'), { recursive: true });
    installFile(found, P('bin', name));
  }
}
// 覆盖运行中可执行文件须先写临时文件再 rename（直接 copyFile 会 ETXTBSY）
function installFile(src, dst) {
  const tmp = dst + '.new';
  fs.copyFileSync(src, tmp);
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, dst);
}
function runReleaseInstall(rel) {
  relJob = { phase: 'downloading', progress: 10, error: null };
  (async () => {
    fs.mkdirSync(P('incoming'), { recursive: true });
    const tar = P('incoming', rel.asset.name);
    dl(rel.asset.url, tar);
    relJob.phase = 'extracting'; relJob.progress = 55;
    const tmp = P('incoming', '.extract');
    fs.rmSync(tmp, { recursive: true, force: true });
    extractTar(tar, tmp);
    // release 平铺 → bundle 布局映射（web/ 跳过：面板已嵌入 costage-server）
    const map = { 'costage-server': 'bin/costage-server', relaybot: 'bin/relaybot', 'manager.js': 'manager.js' };
    fs.mkdirSync(P('bin'), { recursive: true });
    for (const [src, dst] of Object.entries(map)) {
      const s = path.join(tmp, src);
      if (fs.existsSync(s)) installFile(s, P(dst));
    }
    const uiSrc = path.join(tmp, 'ui');
    if (fs.existsSync(uiSrc)) {
      fs.rmSync(P('ui'), { recursive: true, force: true });
      fs.cpSync(uiSrc, P('ui'), { recursive: true });
    }
    relJob.phase = 'binaries'; relJob.progress = 70;
    ensureUpstreamBinaries();
    relJob.phase = 'restarting'; relJob.progress = 85;
    const files = render(params());
    fs.mkdirSync(CONFIGS, { recursive: true });
    for (const k in files) fs.writeFileSync(P(k), files[k]);
    for (const def of SERVICES) stopSvc(def.name);
    for (const def of SERVICES) {
      const r = startSvc(def.name);
      if (!r.ok) throw new Error(`${def.name}: ${r.error}`);
      await sleep(800);
    }
    relJob.phase = 'done'; relJob.progress = 100;
  })().catch((e) => { relJob.phase = 'error'; relJob.error = String((e && e.message) || e); });
}

// ---- nginx 工具 ----
const NGINX_MARKER = 'costage-manager 渲染';
function nginxBin() { try { execSync('command -v nginx >/dev/null 2>&1'); return true; } catch { return false; } }
function nginxVersion() {
  try { return execSync('nginx -v 2>&1').toString().trim().replace(/^nginx version:\s*nginx\//, ''); } catch { return ''; }
}
function nginxLayout() {
  if (fs.existsSync('/etc/nginx/sites-available') && fs.existsSync('/etc/nginx/sites-enabled')) {
    return { conf: '/etc/nginx/sites-available/costage.conf', link: '/etc/nginx/sites-enabled/costage.conf' };
  }
  return { conf: '/etc/nginx/conf.d/costage.conf', link: null };
}
function nginxTest() {
  try { return { ok: true, output: execSync('nginx -t 2>&1').toString() }; }
  catch (e) { return { ok: false, output: ((e.stdout || '') + (e.stderr || '')).toString() || String(e) }; }
}
function nginxReload() {
  try { execSync('nginx -s reload 2>/dev/null'); return true; }
  catch { try { execSync('systemctl reload nginx 2>/dev/null'); return true; } catch { return false; } }
}

// ---- 服务状态 ----
async function statusPayload() {
  const p = params();
  const out = [];
  for (const def of SERVICES) {
    const pid = pidOf(def.name);
    const running = alive(pid);
    const port = def.portKey ? p[def.portKey] : (def.port || 0);
    let portOK = null, healthy = false;
    if (running && port) {
      portOK = await tcpOK(port);
      healthy = portOK && (!def.http || await httpOK(port, def.http));
    } else if (running) {
      healthy = true; // 无端口服务（relaybot）：存活即健康
    }
    out.push({ name: def.name, pid: running ? pid : 0, running, portOK, healthy,
      port: port || null, dir: DIR, exe: def.exe });
  }
  return out;
}

// ---- 安装（渲染配置 + 依序拉起 + 健康等待） ----
let installing = false;
let lastInstall = null;
async function doInstall() {
  const p = params();
  const files = render(p);
  fs.mkdirSync(CONFIGS, { recursive: true });
  for (const k in files) fs.writeFileSync(P(k), files[k]);
  for (const def of SERVICES) stopSvc(def.name);
  for (const def of SERVICES) {
    const r = startSvc(def.name);
    if (!r.ok) return { ok: false, error: `${def.name}: ${r.error}` };
    await sleep(800);
  }
  for (let i = 0; i < 15; i++) {
    const list = await statusPayload();
    if (list.every((s) => s.running && s.portOK !== false)) break;
    await sleep(2000);
  }
  return { ok: true };
}

// ---- HTTP ----
const sessions = new Set();
function authed(req) {
  if (!PASSWORD) return true;
  const ck = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith('mgmt_session='));
  return ck && sessions.has(ck.split('=')[1]);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const route = u.pathname;
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    body = await new Promise((r) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } });
    });
  }

  // 静态 UI
  if (req.method === 'GET' && !route.startsWith('/api/')) {
    const f = route === '/' ? 'index.html' : route.slice(1);
    const fp = P('ui', f);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(fp));
    }
    res.writeHead(404); return res.end('not found');
  }

  // API
  if (route === '/api/login') {
    const ok = PASSWORD && body.password === PASSWORD;
    if (ok) {
      const t = hex(16);
      sessions.add(t);
      res.setHeader('Set-Cookie', `mgmt_session=${t}; HttpOnly; SameSite=Strict; Path=/`);
    }
    return writeJSON(res, ok ? 200 : 401, { ok });
  }
  if (route === '/api/health') return writeJSON(res, 200, { ok: true });
  if (!authed(req)) return writeJSON(res, 401, { error: '未登录或会话过期' });

  if (route === '/api/preflight') {
    const p = params();
    const portChecks = [];
    for (const port of [p.serverPort, 7880, 7881, 8080, 8100]) {
      portChecks.push({ port, free: !(await tcpOK(port)) });
    }
    let diskGB = -1;
    try { diskGB = parseInt(execSync(`df -BG ${DIR} | tail -1 | awk '{print $4}'`).toString()); } catch {}
    let ips = [];
    try {
      const os = require('os');
      ips = Object.values(os.networkInterfaces()).flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    } catch {}
    return writeJSON(res, 200, {
      dockerVersion: 'CE v0.1 无需 Docker', composeVersion: '', arch: process.arch,
      diskFreeGB: diskGB, ipCandidates: ips, portChecks,
      installed: SERVICES.some((s) => alive(pidOf(s.name))), dockerAvailable: false, errors: [],
    });
  }
  if (route === '/api/preflight/ports') {
    const out = [];
    for (const pc of body.ports || []) out.push({ port: pc.port, free: !(await tcpOK(pc.port)) });
    return writeJSON(res, 200, { portChecks: out });
  }
  if (route === '/api/config' && req.method === 'GET') return writeJSON(res, 200, params());
  if (route === '/api/config' && req.method === 'PUT') {
    // 密钥字段传空 = 保持原值（脱敏回传语义）；原值为空则自动生成
    const cur = params();
    const merged = { ...cur, ...body };
    if (!merged.liveKitSecret) merged.liveKitSecret = cur.liveKitSecret || hex(32);
    if (!merged.zlmSecret) merged.zlmSecret = cur.zlmSecret || hex(32);
    if (!merged.turn.password) merged.turn.password = cur.turn?.password || hex(16);
    saveParams(merged);
    // 端口等参数变更即时生效：重渲染配置文件（zlm.ini / livekit.yaml），服务经 restart 读取
    const files = render(merged);
    fs.mkdirSync(CONFIGS, { recursive: true });
    for (const k in files) fs.writeFileSync(P(k), files[k]);
    return writeJSON(res, 200, { ok: true });
  }
  if (route === '/api/secret') return writeJSON(res, 200, { value: hex(16) });

  // ---- nginx 站点（域名模式入口） ----
  if (route === '/api/nginx/render') return writeJSON(res, 200, { content: renderNginx(params()) });
  if (route === '/api/nginx' && req.method === 'GET') {
    const l = nginxLayout();
    const p = params();
    const exists = fs.existsSync(l.conf);
    const content = exists ? fs.readFileSync(l.conf, 'utf8') : renderNginx(p);
    const enabled = l.link ? fs.existsSync(l.link) : exists;
    const warnings = [];
    if (p.domain && !p.tls && Number(p.serverPort) === 80) {
      warnings.push('域名模式：serverPort=80 与 nginx 80 入口冲突，请将 server 端口改为内部端口（如 8080）并重启');
    }
    if (p.domain && p.tls && Number(p.serverPort) === 443) {
      warnings.push('域名+TLS：serverPort=443 与 nginx 443 入口冲突，请改用内部端口并重启');
    }
    return writeJSON(res, 200, {
      available: nginxBin(), version: nginxVersion(),
      confPath: l.conf, enabled, managed: exists ? content.includes(NGINX_MARKER) : true,
      content, warnings,
    });
  }
  if (route === '/api/nginx' && req.method === 'PUT') {
    if (!nginxBin()) return writeJSON(res, 500, { error: '未检测到 nginx' });
    const l = nginxLayout();
    const old = fs.existsSync(l.conf) ? fs.readFileSync(l.conf, 'utf8') : null;
    if (old !== null && !old.includes(NGINX_MARKER)) {
      return writeJSON(res, 409, { error: `${l.conf} 非本管理器渲染，拒绝覆盖；请手工合并后重试` });
    }
    const content = String(body.content || '');
    if (!content.trim()) return writeJSON(res, 400, { error: '配置内容为空' });
    fs.writeFileSync(l.conf, content);
    if (l.link) { try { fs.symlinkSync(l.conf, l.link); } catch {} }
    const t = nginxTest();
    if (!t.ok) {
      // 回滚：旧文件恢复，新文件删除（含软链）
      if (old === null) {
        try { fs.unlinkSync(l.conf); } catch {}
        if (l.link) { try { fs.unlinkSync(l.link); } catch {} }
      } else fs.writeFileSync(l.conf, old);
      return writeJSON(res, 500, { error: 'nginx -t 校验失败，已回滚', output: t.output });
    }
    const reloaded = nginxReload();
    return writeJSON(res, 200, { ok: true, reloaded, output: t.output });
  }
  if (route === '/api/nginx' && req.method === 'DELETE') {
    const l = nginxLayout();
    try { fs.unlinkSync(l.link || l.conf); } catch {}
    try { fs.unlinkSync(l.conf); } catch {}
    const t = nginxTest();
    if (!t.ok) return writeJSON(res, 500, { error: '已删除但 nginx -t 失败：' + t.output });
    nginxReload();
    return writeJSON(res, 200, { ok: true });
  }

  // ---- 全家桶原始配置（自由编辑；注意会被 params 重渲染覆盖） ----
  const RAWCONF = { 'config.ini': 'zlm', 'livekit.yaml': 'livekit' };
  if (route === '/api/rawconf' && req.method === 'GET') {
    const f = u.searchParams.get('file') || '';
    if (!RAWCONF[f]) return writeJSON(res, 404, { error: '未知配置文件' });
    const fp = P('configs', f);
    const content = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : render(params())['configs/' + f];
    return writeJSON(res, 200, { file: f, content });
  }
  if (route === '/api/rawconf' && req.method === 'PUT') {
    const f = String(body.file || '');
    if (!RAWCONF[f]) return writeJSON(res, 404, { error: '未知配置文件' });
    fs.mkdirSync(CONFIGS, { recursive: true });
    fs.writeFileSync(P('configs', f), String(body.content || ''));
    const svc = RAWCONF[f];
    stopSvc(svc);
    await sleep(600);
    const r = startSvc(svc);
    return writeJSON(res, r.ok ? 200 : 500, { ok: r.ok, note: r.note || (r.ok ? `已写入并重启 ${svc}` : r.error) });
  }

  if (route === '/api/install/preview') {
    const files = render(params());
    return writeJSON(res, 200, { files, warnings: ['预览含明文密钥，请勿截图外传'] });
  }
  if (route === '/api/install/start') {
    if (installing) return writeJSON(res, 409, { error: '安装进行中' });
    installing = true;
    doInstall().then((r) => { installing = false; lastInstall = r; })
      .catch((e) => { installing = false; lastInstall = { ok: false, error: String(e) }; });
    return writeJSON(res, 200, { ok: true });
  }
  if (route === '/api/install/status') {
    const list = await statusPayload();
    return writeJSON(res, 200, {
      inProgress: installing,
      phase: installing ? 'running' : (list.every((s) => s.running) ? 'done' : 'partial'),
      steps: list.map((s) => ({ name: s.name, state: s.running ? 'ok' : 'pending' })),
    });
  }
  if (route === '/api/install/logs') return writeJSON(res, 200, { next: 0, lines: ['（服务日志见 logs/ 目录）'] });
  if (route === '/api/install/cancel') return writeJSON(res, 200, { ok: true });

  if (route === '/api/status') {
    return writeJSON(res, 200, { version: VERSION, services: await statusPayload() });
  }
  if (route === '/api/logs/stream') {
    const svc = u.searchParams.get('service') || 'server';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    try { res.write(execSync(`tail -n 100 ${logFile(svc)} 2>/dev/null || true`).toString()); } catch {}
    return res.end();
  }
  // 单模块生命周期：/api/service/<name>/start|stop|restart
  const svcMatch = route.match(/^\/api\/service\/([a-z]+)\/(start|stop|restart)$/);
  if (svcMatch && req.method === 'POST') {
    const [, name, verb] = svcMatch;
    if (!svcDef(name)) return writeJSON(res, 404, { error: '未知服务' });
    if (verb === 'stop') stopSvc(name);
    else if (verb === 'restart') { stopSvc(name); await sleep(600); return writeJSON(res, 200, startSvc(name)); }
    else return writeJSON(res, 200, startSvc(name));
    return writeJSON(res, 200, { ok: true });
  }
  if (route.startsWith('/api/stack/')) {
    const verb = route.split('/').pop();
    for (const def of SERVICES) {
      if (verb === 'stop') stopSvc(def.name);
      else startSvc(def.name);
    }
    return writeJSON(res, 200, { ok: true });
  }
  // ---- 安装源：CoStage-CE 最新 release ----
  if (route === '/api/release') {
    try {
      const r = await latestRelease();
      return writeJSON(res, 200, { ...r, current: VERSION, upgradable: r.tag !== VERSION, repo: REPO });
    } catch (e) { return writeJSON(res, 502, { error: String((e && e.message) || e) }); }
  }
  if (route === '/api/release/install' && req.method === 'POST') {
    if (relJob && relJob.phase !== 'done' && relJob.phase !== 'error') {
      return writeJSON(res, 409, { error: '安装任务进行中' });
    }
    try {
      const rel = await latestRelease();
      runReleaseInstall(rel);
      return writeJSON(res, 200, { ok: true, tag: rel.tag, asset: rel.asset.name });
    } catch (e) { return writeJSON(res, 502, { error: String((e && e.message) || e) }); }
  }
  if (route === '/api/release/status') {
    return writeJSON(res, 200, relJob || { phase: 'idle', progress: 0 });
  }
  if (route === '/api/update/check') {
    try {
      const r = await latestRelease();
      return writeJSON(res, 200, { upgradable: r.tag !== VERSION, latest: r.tag, current: VERSION,
        url: r.htmlUrl, note: '安装源：github.com/' + REPO + ' 最新 release' });
    } catch (e) {
      return writeJSON(res, 200, { upgradable: false, current: VERSION,
        note: '在线检查失败（' + ((e && e.message) || e) + '）；可离线升级：把发布 tar 放入 incoming/' });
    }
  }
  if (route === '/api/update/offline') {
    try {
      const src = P('incoming', body.filename || '');
      execSync(`tar -xzf '${src}' -C '${DIR}' bin configs`);
      for (const def of SERVICES) stopSvc(def.name);
      for (const def of SERVICES) startSvc(def.name);
      return writeJSON(res, 200, { ok: true });
    } catch (e) { return writeJSON(res, 500, { error: String(e) }); }
  }
  if (route === '/api/uninstall') {
    const out = [];
    for (const def of SERVICES) out.push({ name: def.name, ...stopSvc(def.name) });
    try { fs.rmSync(P('run'), { recursive: true, force: true }); } catch {}
    return writeJSON(res, 200, {
      ok: true, note: `已停止全部服务并清理运行状态。程序与配置文件保留在 ${DIR}，如需彻底删除请整目录移除`,
    });
  }
  if (route === '/api/rollback/list') return writeJSON(res, 200, { versions: [] });
  return writeJSON(res, 404, { error: 'not found' });
});

const [h, ...rest] = ADDR.split(':');
const HOST = rest.length ? h : '127.0.0.1';
const PORT = rest.length ? Number(rest.join(':')) : 8900;
server.listen(PORT, HOST, () => {
  console.log(`[manager] CoStage 部署管理器 ${VERSION} http://${ADDR}（部署目录 ${DIR}${PASSWORD ? '，口令已启用' : ''}）`);
});
