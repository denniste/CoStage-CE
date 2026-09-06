#!/usr/bin/env node
// CoStage 部署管理器（CE v0.1，Node 纯标准库，零 npm 依赖）。
// 定位：临时安装/更新工具——Web 向导收集参数 → 渲染配置 → 拉起/停止全家桶进程
// （detached + pidfile + 日志文件）。不用 systemd、不用 Docker、不污染系统；
// manager 退出后服务进程独立存活；重启机器后跑一次 `node manager.js start` 即可拉起。
//
// 用法：node manager.js [--dir <bundle目录>] [--addr 127.0.0.1:8900] [--password xxx]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

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
    turn: { enabled: false, realm: 'costage', port: 3478, password: hex(16) },
  };
}
let paramsCache = null;
function params() {
  if (paramsCache) return paramsCache;
  try { paramsCache = JSON.parse(fs.readFileSync(PARAMS, 'utf8')); } catch { paramsCache = defaultParams(); }
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

[api]
apiDebug=1
secret=${p.zlmSecret}

[rtc]
externIP=${p.publicIp}
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
    COSTAGE_LIVEKIT_URL: `ws://${p.publicIp}:${p.livekitPort}`,
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

// ---- 服务状态 ----
async function statusPayload() {
  const p = params();
  const out = [];
  for (const def of SERVICES) {
    const pid = pidOf(def.name);
    const running = alive(pid);
    let portOK = null, healthy = false;
    if (running && def.port) {
      portOK = await tcpOK(def.port);
      healthy = portOK && (!def.http || await httpOK(def.port, def.http));
    }
    out.push({ name: def.name, pid: running ? pid : 0, running, portOK, healthy });
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
function writeJSON(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
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
    return writeJSON(res, 200, { ok: true });
  }
  if (route === '/api/secret') return writeJSON(res, 200, { value: hex(16) });

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
  if (route.startsWith('/api/stack/')) {
    const verb = route.split('/').pop();
    for (const def of SERVICES) {
      if (verb === 'stop') stopSvc(def.name);
      else startSvc(def.name);
    }
    return writeJSON(res, 200, { ok: true });
  }
  if (route === '/api/update/check') {
    return writeJSON(res, 200, { upgradable: false, note: 'v0.1 离线升级：将新发布 tar 放入 ' + P('incoming') });
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
