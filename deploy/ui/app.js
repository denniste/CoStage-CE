// CoStage 部署管理器前端：模块化仪表盘（服务状态 / 配置 / 日志 / 升级）。
// 原生 JS 无依赖；API JSON + 轮询（日志流走 fetch ReadableStream）。
const $ = (id) => document.getElementById(id);
const api = (path, opts = {}) => fetch(path, {
  headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts,
}).then(async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(body.error || `HTTP ${r.status}`); err.body = body; throw err; }
  return body;
});

let cfg = null;           // 当前配置（表单态）

// ---- 视图切换 ----
function show(view) {
  for (const v of ['view-login', 'view-dash']) $(v).classList.add('hidden');
  $(view).classList.remove('hidden');
}

async function boot() {
  try {
    await api('/api/config');
    await enterDash();
  } catch (e) {
    show('view-login'); // 未设置口令时后端恒放行，走到这里即需登录或网络异常
  }
}

$('btnLogin').onclick = async () => {
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('loginPw').value }) });
    $('loginErr').textContent = '';
    await enterDash();
  } catch (e) { $('loginErr').textContent = e.message; }
};

async function enterDash() {
  show('view-dash');
  renderLogTabs();
  loadLogOnce();
  refreshStatus();
  loadConfig();
  loadNg();
  loadRaw();
}

// ---- 表单字段小件 ----
function field(label, id, value, hint, type = 'text', extra = '') {
  return `<label for="${id}">${label}</label>
    <input id="${id}" type="${type}" value="${value ?? ''}" ${extra}>
    ${hint ? `<p class="hint">${hint}</p>` : ''}`;
}
function regen(kind) {
  api('/api/secret', { method: 'POST', body: JSON.stringify({ kind }) })
    .then((r) => { if (kind === 'lkSecret') $('f_liveKitSecret').value = r.value;
      if (kind === 'zlmSecret') $('f_zlmSecret').value = r.value;
      if (kind === 'turn') $('f_turnPw').value = r.value; });
}

// ---- 配置模块 ----
async function loadConfig() {
  cfg = await api('/api/config');
  $('f_publicIp').value = cfg.publicIp || '';
  $('f_liveKitKey').value = cfg.liveKitKey || '';
  $('f_liveKitSecret').value = cfg.liveKitSecret || '';
  $('f_zlmSecret').value = cfg.zlmSecret || '';
  $('f_holdSeconds').value = cfg.holdSeconds ?? 15;
  $('f_devAuth').checked = !!cfg.devAuth;
  $('f_turnOn').checked = !!(cfg.turn && cfg.turn.enabled);
  renderTurnFields();
  $('f_domain').value = cfg.domain || '';
  $('f_tls').checked = !!cfg.tls;
  renderTlsFields();
}
function renderTlsFields() {
  $('tlsBody').innerHTML = $('f_tls').checked ? (
    field('证书文件（fullchain PEM 路径）', 'f_tlsCert', (cfg && cfg.tlsCert) || '',
      '如 /etc/letsencrypt/live/你的域名/fullchain.pem') +
    field('私钥文件路径', 'f_tlsKey', (cfg && cfg.tlsKey) || '',
      '如 /etc/letsencrypt/live/你的域名/privkey.pem')
  ) : '';
}
$('f_tls').onchange = renderTlsFields;
function renderTurnFields() {
  const t = (cfg && cfg.turn) || {};
  $('turnBody').innerHTML = $('f_turnOn').checked ? (
    field('Realm', 'f_turnRealm', t.realm, '') +
    field('端口', 'f_turnPort', t.port, '', 'number') +
    field('密码', 'f_turnPw', t.password, '留空 = 保持原值') +
    `<button class="ghost small" onclick="regen('turn')">重新生成密码</button>`
  ) : '';
}
$('f_turnOn').onchange = renderTurnFields;

async function saveConfig() {
  const body = {
    publicIp: $('f_publicIp').value.trim(),
    liveKitKey: $('f_liveKitKey').value.trim(),
    liveKitSecret: $('f_liveKitSecret').value.trim(),   // 空 = 保持原值
    zlmSecret: $('f_zlmSecret').value.trim(),
    holdSeconds: Number($('f_holdSeconds').value) || 0,
    devAuth: $('f_devAuth').checked,
    domain: $('f_domain').value.trim(),
    tls: $('f_tls').checked,
    tlsCert: $('f_tlsCert') ? $('f_tlsCert').value.trim() : (cfg.tlsCert || ''),
    tlsKey: $('f_tlsKey') ? $('f_tlsKey').value.trim() : (cfg.tlsKey || ''),
    turn: {
      enabled: $('f_turnOn').checked,
      realm: $('f_turnRealm') ? $('f_turnRealm').value.trim() : (cfg.turn?.realm || 'costage'),
      port: Number($('f_turnPort')?.value) || (cfg.turn?.port || 3478),
      password: $('f_turnPw') ? $('f_turnPw').value.trim() : '',  // 空 = 保持原值
    },
  };
  try {
    await api('/api/config', { method: 'PUT', body: JSON.stringify(body) });
    alert('配置已保存');
    if (window.confirm('端口/密钥等变更需重启服务生效，现在重启全部服务？')) await stackOp('restart');
    await loadConfig();
    refreshStatus();
  } catch (e) { alert(e.message); }
}

// ---- nginx 站点模块 ----
async function loadNg() {
  try {
    const r = await api('/api/nginx');
    const warn = (r.warnings || []).map((w) => `<p class="err" style="margin:4px 0 0">⚠ ${w}</p>`).join('');
    $('ngState').innerHTML = r.available
      ? `nginx ${r.version} · 配置 ${r.confPath} · ${r.enabled ? '已启用' : '未启用'}${warn}`
      : `未检测到 nginx（域名模式不可用；仍可 IP 直连）${warn}`;
    $('ngConf').value = r.content || '';
  } catch (e) { $('ngState').textContent = `加载失败：${e.message}`; }
}
async function renderNginxTpl() {
  try { const r = await api('/api/nginx/render'); $('ngConf').value = r.content; }
  catch (e) { alert(e.message); }
}
async function applyNginx() {
  if (!window.confirm('写入 nginx 配置并 reload？')) return;
  try {
    const r = await api('/api/nginx', { method: 'PUT', body: JSON.stringify({ content: $('ngConf').value }) });
    alert(`已应用${r.reloaded ? '并 reload' : '，但 reload 失败（请手动 systemctl reload nginx）'}`);
    loadNg();
  } catch (e) {
    alert(e.message + (e.body && e.body.output ? '\n\n' + e.body.output : ''));
  }
}
async function removeNginx() {
  if (!window.confirm('停用 CoStage nginx 站点（删除配置文件并 reload）？')) return;
  try { await api('/api/nginx', { method: 'DELETE' }); loadNg(); } catch (e) { alert(e.message); }
}

// ---- 原始配置模块（zlm.ini / livekit.yaml） ----
let curRaw = 'config.ini';
async function loadRaw() {
  try {
    const r = await api('/api/rawconf?file=' + curRaw);
    $('rawConf').value = r.content;
  } catch (e) { $('rawConf').value = `（加载失败：${e.message}）`; }
}
function switchRaw(f) {
  curRaw = f;
  $('rawTabZlm').classList.toggle('active', f === 'config.ini');
  $('rawTabLk').classList.toggle('active', f === 'livekit.yaml');
  loadRaw();
}
async function saveRaw() {
  const svc = curRaw === 'config.ini' ? 'zlm' : 'livekit';
  if (!window.confirm(`保存 ${curRaw} 并重启 ${svc}？进行中的课堂将受影响。`)) return;
  try {
    const r = await api('/api/rawconf', { method: 'PUT', body: JSON.stringify({ file: curRaw, content: $('rawConf').value }) });
    if (!r.ok) alert(r.note || '保存失败');
    refreshStatus();
  } catch (e) { alert(e.message); }
}

// ---- 仪表盘 ----
const DISPLAY_ORDER = ['server', 'relaybot', 'livekit', 'zlm']; // 展示顺序（与启动顺序无关）

async function refreshStatus() {
  const s = await api('/api/status');
  const byName = Object.fromEntries((s.services || []).map((x) => [x.name, x]));
  $('svcList').innerHTML = DISPLAY_ORDER.map((name) => {
    const svc = byName[name];
    if (!svc) return '';
    const cls = !svc.running ? 'bad' : svc.healthy || svc.portOK ? 'ok' : 'unknown';
    const state = svc.running ? '运行中' : '已停止';
    const extra = svc.running ? (svc.healthy ? ' · 健康' : svc.portOK === false ? ' · 端口未就绪' : '') : '';
    const btn = svc.running
      ? `<button class="ghost small" onclick="svcOp('${name}','restart')">重启</button>
         <button class="danger small" onclick="svcOp('${name}','stop')">停止</button>`
      : `<button class="ghost small" onclick="svcOp('${name}','start')">启动</button>`;
    const portCell = svc.port
      ? `<span>端口 <input class="port-in" type="number" id="port_${name}" value="${svc.port}" min="1" max="65535">
         <button class="ghost small" onclick="savePort('${name}')">保存</button></span>`
      : '<span>端口 <code>–</code></span>';
    return `<div class="svc-block">
      <div class="svc-head">
        <span class="dot ${cls}"></span><b>${name}</b>
        <span class="muted">${state}${extra}</span>
        <span class="spacer"></span>${btn}
      </div>
      <div class="svc-meta">
        ${portCell}
        <span>PID <code>${svc.pid || '–'}</code></span>
        <span class="svc-dir" title="${svc.exe ? svc.dir + '/' + svc.exe : svc.dir}">目录 <code>${svc.dir || '–'}</code></span>
      </div>
    </div>`;
  }).join('') || '<span class="muted">栈未运行</span>';
}

async function savePort(name) {
  const v = Number($('port_' + name)?.value);
  if (!v || v < 1 || v > 65535) return alert('端口无效');
  if (!window.confirm(`保存 ${name} 端口为 ${v} 并重启该服务？`)) return;
  const key = { server: 'serverPort', livekit: 'livekitPort', zlm: 'zlmHttpPort' }[name];
  try {
    await api('/api/config', { method: 'PUT', body: JSON.stringify({ [key]: v }) });
    await api(`/api/service/${name}/restart`, { method: 'POST', body: '{}' });
    refreshStatus();
  } catch (e) { alert(e.message); }
}

async function svcOp(name, verb) {
  if (verb === 'stop' && !window.confirm(`停止 ${name}？进行中的课堂将受影响。`)) return;
  try { await api(`/api/service/${name}/${verb}`, { method: 'POST', body: '{}' }); } catch (e) { alert(e.message); }
  refreshStatus();
}

// ---- 日志（标签页） ----
let curLogSvc = 'server';
function renderLogTabs() {
  $('logTabs').innerHTML = DISPLAY_ORDER.map((n) =>
    `<button class="tab ${n === curLogSvc ? 'active' : ''}" onclick="switchLog('${n}')">${n}</button>`).join('');
}
function switchLog(name) {
  curLogSvc = name;
  renderLogTabs();
  stopFollow();
  $('logBox').textContent = '';
  loadLogOnce();
}
async function loadLogOnce() {
  try {
    const r = await fetch(`/api/logs/stream?service=${curLogSvc}&tail=100`, { credentials: 'same-origin' });
    $('logBox').textContent = await r.text();
    $('logBox').scrollTop = $('logBox').scrollHeight;
  } catch { $('logBox').textContent = '（日志加载失败）'; }
}
function stopFollow() {
  if (followAbort) { followAbort.abort(); followAbort = null; }
  $('btnLogFollow').textContent = '开始跟随';
  $('logState').textContent = '';
}

let followAbort = null;
$('btnLogFollow').onclick = () => {
  if (followAbort) { stopFollow(); return; }
  followAbort = new AbortController();
  $('logBox').textContent = '';
  $('btnLogFollow').textContent = '停止跟随';
  $('logState').textContent = `跟随 ${curLogSvc} 中…`;
  fetch(`/api/logs/stream?service=${curLogSvc}&tail=100`, { signal: followAbort.signal, credentials: 'same-origin' })
    .then(async (resp) => {
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        $('logBox').textContent += dec.decode(value);
        $('logBox').scrollTop = $('logBox').scrollHeight;
      }
    })
    .catch(() => {})
    .finally(() => {
      $('btnLogFollow').textContent = '开始跟随';
      $('logState').textContent = '已断开';
      followAbort = null;
    });
};

async function reinstall() {
  if (!window.confirm('按当前配置重新安装？将依次停止→渲染配置→重启全部服务。')) return;
  await api('/api/install/start', { method: 'POST', body: '{}' });
  refreshStatus();
}
async function uninstall() {
  if (!window.confirm('卸载将停止全部服务并清理运行状态（程序与配置文件保留），确认？')) return;
  const r = await api('/api/uninstall', { method: 'POST', body: '{}' });
  alert(r.note || '已卸载');
  refreshStatus();
}
async function stackOp(verb) {
  if (verb === 'stop' && !window.confirm('停止整机将断开所有课堂直播，确认？')) return;
  await api(`/api/stack/${verb}`, { method: 'POST', body: '{}' });
  refreshStatus();
}

async function updateCheck() {
  $('updateInfo').textContent = '检查中…';
  try {
    const r = await api('/api/update/check');
    $('updateInfo').textContent = r.upgradable
      ? `发现新版本 ${r.latest}（当前 ${r.current}）——可点「下载并安装/更新」一键升级，或离线升级。`
      : `已是最新版本（${r.current}）。${r.note || ''}`;
  } catch (e) { $('updateInfo').textContent = `检查失败：${e.message}`; }
}

// ---- 安装源：GitHub 最新 release 一键安装/更新 ----
async function releaseCheck() {
  $('updateInfo').textContent = '查询最新 release…';
  try {
    const r = await api('/api/release');
    $('updateInfo').innerHTML = `当前 <b>${r.current}</b> · 最新 <b>${r.tag}</b>（${(r.publishedAt || '').slice(0, 10)}）· ${r.asset.name}（${(r.asset.size / 1048576).toFixed(1)} MB）`;
  } catch (e) { $('updateInfo').textContent = '查询失败：' + e.message; }
}
async function releaseInstall() {
  if (!window.confirm('从 GitHub 最新 release 下载并安装/更新？将覆盖 bin/ 与管理器 UI，并重启全部服务。')) return;
  try { await api('/api/release/install', { method: 'POST', body: '{}' }); }
  catch (e) { return alert(e.message); }
  pollRel();
}
function pollRel() {
  window.clearTimeout(window._relT);
  api('/api/release/status').then((s) => {
    const label = { downloading: '下载 release 包', extracting: '解包并布局', binaries: '补齐上游二进制',
      restarting: '渲染配置并重启服务', done: '完成', error: '失败' }[s.phase] || s.phase;
    if (s.phase === 'error') { $('relProg').textContent = '❌ ' + (s.error || '未知错误'); return; }
    if (s.phase === 'done') { $('relProg').textContent = '✅ 安装完成'; refreshStatus(); return; }
    $('relProg').textContent = `⏳ ${label}… ${s.progress}%`;
    window._relT = window.setTimeout(pollRel, 1000);
  }).catch(() => { window._relT = window.setTimeout(pollRel, 1500); });
}

async function upgradeOffline() {
  const f = $('offlineTar').value.trim();
  if (!f) return;
  if (!window.confirm(`使用 incoming/${f} 升级？失败将自动回退当前版本。`)) return;
  try {
    await api('/api/update/offline', { method: 'POST', body: JSON.stringify({ filename: f }) });
    $('updateInfo').textContent = '升级完成，状态已刷新。';
    refreshStatus();
  } catch (e) { $('updateInfo').textContent = `升级失败：${e.message}`; }
}

boot();
