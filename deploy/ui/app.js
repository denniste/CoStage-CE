// CoStage 部署管理器前端：向导（预检→参数→预览→安装）+ 仪表盘（状态/日志/升级）。
// 原生 JS 无依赖；API JSON + 轮询（日志流走 fetch ReadableStream）。
const $ = (id) => document.getElementById(id);
const api = (path, opts = {}) => fetch(path, {
  headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts,
}).then(async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
});

let cfg = null;           // 安装配置（当前表单态）
let preflight = null;     // 预检报告
let step = 0;             // 向导步骤游标
const WIZARD_STEPS = ['环境预检', '网络', 'LiveKit', 'ZLM 分发', 'TURN（可选）', '安全与高级', '预览确认', '执行安装'];

// ---- 视图切换 ----
function show(view) {
  for (const v of ['view-login', 'view-wizard', 'view-dash']) $(v).classList.add('hidden');
  $(view).classList.remove('hidden');
}

async function boot() {
  try {
    await api('/api/config');
    await enterInstalledOrWizard();
  } catch (e) {
    if (String(e.message).includes('未登录')) { show('view-login'); return; }
    show('view-login'); // 兜底走登录
  }
}

$('btnLogin').onclick = async () => {
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('loginPw').value }) });
    $('loginErr').textContent = '';
    await enterInstalledOrWizard();
  } catch (e) { $('loginErr').textContent = e.message; }
};

// 已安装 → 仪表盘；未安装 → 向导（steps 0 起始）
async function enterInstalledOrWizard() {
  const pf = await api('/api/preflight');
  if (pf.installed) { show('view-dash'); refreshStatus(); return; }
  cfg = await api('/api/config');
  preflight = pf;
  step = 0;
  renderWizard();
  show('view-wizard');
}

// ---- 向导 ----
function renderWizard() {
  const nav = $('stepNav');
  nav.innerHTML = WIZARD_STEPS.map((t, i) =>
    `<li class="${i === step ? 'active' : i < step ? 'done' : ''}">${i + 1}. ${t}</li>`).join('');
  const body = $('stepBody');
  body.innerHTML = '';
  [renderStepPreflight, renderStepNetwork, renderStepLiveKit, renderStepZLM, renderStepTURN,
   renderStepSecurity, renderStepPreview, renderStepInstall][step](body);
  $('btnPrev').style.visibility = step === 0 ? 'hidden' : 'visible';
  $('btnNext').textContent = step === WIZARD_STEPS.length - 2 ? '开始安装' : step === WIZARD_STEPS.length - 1 ? '完成' : '下一步';
  $('btnNext').disabled = step === WIZARD_STEPS.length - 1; // 完成页由按钮进入仪表盘替代
  if (step === 0) runPreflight();
  if (step === 6) runPreview();
}

$('btnPrev').onclick = () => { if (step > 0) { step--; renderWizard(); } };
$('btnNext').onclick = async () => {
  const save = () => api('/api/config', { method: 'PUT', body: JSON.stringify(collect()) })
    .then((r) => { if (r.errors && r.errors.length) throw new Error(r.errors.join('；')); });
  try {
    if (step === 5) await save();          // 安全页离开前保存
    if (step === 6) {                       // 预览页点击 → 触发安装
      await save();
      await api('/api/install/start', { method: 'POST', body: '{}' });
      startInstallPolling();
    }
    if (step < WIZARD_STEPS.length - 1) { step++; renderWizard(); }
    else { show('view-dash'); refreshStatus(); }
  } catch (e) { alert(e.message); }
};

function field(label, id, value, hint, type = 'text', extra = '') {
  return `<label for="${id}">${label}</label>
    <input id="${id}" type="${type}" value="${value || ''}" ${extra}>
    ${hint ? `<p class="hint">${hint}</p>` : ''}`;
}

// ---- 步骤 0：环境预检 ----
function runPreflight() {
  const box = $('stepBody').querySelector('#pfBox') || (() => {
    const d = document.createElement('div');
    d.id = 'pfBox';
    d.innerHTML = '<p class="muted">正在检测环境…</p>';
    $('stepBody').prepend(d);
    return d;
  })();
  api('/api/preflight').then((pf) => {
    preflight = pf;
    const items = [
      ['Docker', pf.dockerVersion || '未检测到'],
      ['Docker Compose', pf.composeVersion || '未检测到'],
      ['架构', pf.arch],
      ['磁盘可用', pf.diskFreeGB >= 0 ? `${pf.diskFreeGB} GB` : '未知'],
      ['已安装', pf.installed ? '是（将进入仪表盘/重配置）' : '否（全新安装）'],
    ];
    box.innerHTML = `<div class="pf-grid">${items.map(([k, v]) =>
      `<div class="pf-item"><b>${k}</b><br>${v}</div>`).join('')}</div>
      ${pf.ipCandidates?.length ? `<p class="hint">检测到本机地址候选：${pf.ipCandidates.join('、')}</p>` : ''}
      ${(pf.errors || []).map((e) => `<p class="err">⚠ ${e}</p>`).join('')}`;
    if (!pf.installed) cfg.publicIp = cfg.publicIp || (pf.ipCandidates || [])[0] || '';
  }).catch((e) => { box.innerHTML = `<p class="err">预检失败：${e.message}</p>`; });
}
function renderStepPreflight(box) {
  box.innerHTML = '<h2>环境预检</h2><div id="pfBox"><p class="muted">正在检测环境…</p></div>';
}

// ---- 步骤 1：网络 ----
function renderStepNetwork(box) {
  const cands = (preflight?.ipCandidates || []);
  box.innerHTML = `<h2>网络</h2>
    ${field('对外地址（IP 或域名）', 'f_publicIp', cfg.publicIp, 'ZLM 候选地址与 LiveKit 信令地址都依赖它；学生浏览器必须可达')}
    ${field('面板入口端口', 'f_port', cfg.serverPort, '默认 80（单入口：面板 + API/WS + WHEP 同源）', 'number')}
    <p class="hint">端口占用已在预检中核对；被占用的端口请先释放或改用其它端口。</p>`;
  $('f_publicIp').oninput = (e) => { cfg.publicIp = e.target.value; };
  $('f_port').oninput = (e) => { cfg.serverPort = Number(e.target.value); };
}

// ---- 步骤 2：LiveKit ----
function renderStepLiveKit(box) {
  box.innerHTML = `<h2>LiveKit（互动面 SFU）</h2>
    ${field('浏览器信令地址', 'f_lkUrl', cfg.liveKit.signalUrl || `ws://${cfg.publicIp || '<对外地址>'}:7880`,
      '⚠ 签进 token——学生浏览器必须能直达此地址；云服务器请放行安全组', 'text', 'disabled')}
    ${field('API Key', 'f_lkKey', cfg.liveKitKey, '')}
    ${field('API Secret', 'f_lkSecret', cfg.liveKitSecret, '自动生成，可修改或点重新生成')}
    <button class="ghost small" onclick="regen('lkSecret')">重新生成 Secret</button>
    ${field('断线保护（秒）', 'f_hold', cfg.holdSeconds, '参与者断线后席位保留时长', 'number')}`;
  $('f_lkKey').oninput = (e) => { cfg.liveKitKey = e.target.value; };
  $('f_lkSecret').oninput = (e) => { cfg.liveKitSecret = e.target.value; };
  $('f_hold').oninput = (e) => { cfg.holdSeconds = Number(e.target.value); };
}
function regen(kind) {
  api('/api/secret', { method: 'POST', body: JSON.stringify({ kind }) })
    .then((r) => { if (kind === 'lkSecret') { cfg.liveKitSecret = r.value; $('f_lkSecret').value = r.value; }
      if (kind === 'zlmSecret') { cfg.zlmSecret = r.value; $('f_zlmSecret').value = r.value; }
      if (kind === 'turn') { cfg.turn.password = r.value; $('f_turnPw').value = r.value; } });
}

// ---- 步骤 3：ZLM ----
function renderStepZLM(box) {
  box.innerHTML = `<h2>ZLMediaKit（观看分发）</h2>
    <p class="muted">本地托管（v0.1 唯一形态；远端 ZLM 地址为多机预留）。</p>
    ${field('HTTP 端口', 'f_zlmPort', cfg.zlm.httpPort, 'WHIP/WHEP 信令与 API（面板已同源代理，此端口供调试）', 'number')}
    ${field('API Secret', 'f_zlmSecret', cfg.zlmSecret, '自动生成，转推 bot 与 healthcheck 使用同一值（单源渲染）')}
    <button class="ghost small" onclick="regen('zlmSecret')">重新生成 Secret</button>`;
  $('f_zlmPort').oninput = (e) => { cfg.zlm.httpPort = Number(e.target.value); };
  $('f_zlmSecret').oninput = (e) => { cfg.zlmSecret = e.target.value; };
}

// ---- 步骤 4：TURN ----
function renderStepTURN(box) {
  const t = cfg.turn;
  box.innerHTML = `<h2>TURN（可选）</h2>
    <label><input type="checkbox" id="f_turnOn" ${t.enabled ? 'checked' : ''}> 启用 TURN 服务</label>
    <p class="warn-text">仅跨网段/严格 NAT 时需要；同网段学生直连即可。当前版本仅作用于服务端转推链路，浏览器侧 ICE 为面板构建期固化。</p>
    <div id="turnBody">${t.enabled ? turnFields(t) : ''}</div>`;
  $('f_turnOn').onchange = (e) => {
    t.enabled = e.target.checked;
    $('turnBody').innerHTML = t.enabled ? turnFields(t) : '';
    bindTurn();
  };
  bindTurn();
  function turnFields(t) {
    return field('Realm', 'f_turnRealm', t.realm, '') +
      field('端口', 'f_turnPort', t.port, '', 'number') +
      field('密码', 'f_turnPw', t.password, '自动生成');
  }
  function bindTurn() {
    $('f_turnRealm') && ($('f_turnRealm').oninput = (e) => { cfg.turn.realm = e.target.value; });
    $('f_turnPort') && ($('f_turnPort').oninput = (e) => { cfg.turn.port = Number(e.target.value); });
    $('f_turnPw') && ($('f_turnPw').oninput = (e) => { cfg.turn.password = e.target.value; });
  }
}

// ---- 步骤 5：安全与高级 ----
function renderStepSecurity(box) {
  box.innerHTML = `<h2>安全与高级</h2>
    ${field('管理口令（可选）', 'f_mgmtPw', '', '留空=仅本机 127.0.0.1 可访问管理器；设置后浏览器需口令登录', 'password')}
    <label><input type="checkbox" id="f_devAuth" ${cfg.devAuth ? 'checked' : ''}> DEV 鉴权模式（dev）</label>
    <p class="warn-text">DEV 模式下身份由请求显式提供（无真实鉴权）——生产接入业务系统后再关闭（后置能力）。</p>
    ${field('连麦申请鉴权回调 URL（可选）', 'f_hook', cfg.applyHookUrl, '空=不启用；POST {hostId,roomId,userId,key} → {"allow":bool}')}`;
  $('f_mgmtPw').dataset.pending = '1'; // 安装开始时由后端读取设置
  $('f_devAuth').onchange = (e) => { cfg.devAuth = e.target.checked; };
  $('f_hook').oninput = (e) => { cfg.applyHookUrl = e.target.value; };
}

// ---- 步骤 6：预览 ----
function renderStepPreview(box) {
  box.innerHTML = `<h2>预览确认</h2><p class="muted">以下为将渲染的部署产物（含明文密钥，勿截图外传）。确认后点「开始安装」。</p>
    <div id="pv" class="preview"><p class="muted">正在渲染…</p></div>`;
  api('/api/install/preview', { method: 'POST' }).then((r) => {
    $('pv').innerHTML = Object.entries(r.files).map(([name, content]) =>
      `<details ${name === 'docker-compose.yml' ? 'open' : ''}><summary>${name}</summary><pre>${escapeHtml(content)}</pre></details>`).join('');
  }).catch((e) => { $('pv').innerHTML = `<p class="err">${e.message}</p>`; });
}
function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

// ---- 步骤 7：安装执行（轮询进度 + 日志） ----
let pollTimer = null;
function startInstallPolling() {
  const body = $('stepBody');
  body.innerHTML = `<h2>正在安装</h2>
    <div class="prog-steps" id="progSteps"></div>
    <pre id="instLog" class="logbox"></pre>
    <div class="row"><button class="ghost" onclick="api('/api/install/cancel',{method:'POST'}).then(()=>{})">取消</button></div>`;
  let cursor = 0;
  pollTimer = window.setInterval(async () => {
    try {
      const s = await api('/api/install/status');
      $('progSteps').innerHTML = (s.steps || []).map((st) =>
        `<span class="phase ${st.state}">${st.name} · ${st.state}</span>`).join('');
      const lg = await api(`/api/install/logs?after=${cursor}`);
      cursor = lg.next;
      if (lg.lines.length) {
        $('instLog').textContent += lg.lines.join('\n') + '\n';
        $('instLog').scrollTop = $('instLog').scrollHeight;
      }
      if (!s.inProgress) {
        window.clearInterval(pollTimer);
        if (s.progress.phase === 'done') {
          body.innerHTML = `<h2>✅ 安装完成</h2>
            <p>面板入口：<b>http://${cfg.publicIp}:${cfg.serverPort}/</b></p>
            <p class="muted">自检清单：80/7880/8100 等端口已放行；浏览器可直达 LiveKit 信令地址；生产建议外层 TLS 网关。</p>
            <button onclick="show('view-dash');refreshStatus()">进入仪表盘</button>`;
          $('btnNext').disabled = false;
        }
      }
    } catch { /* 轮询失败下一轮重试 */ }
  }, 1000);
}
function renderStepInstall(box) {
  box.innerHTML = '<h2>执行安装</h2><p class="muted">点击「开始安装」后进入四阶段执行。</p>';
}

// ---- 仪表盘 ----
async function refreshStatus() {
  const s = await api('/api/status');
  $('svcGrid').innerHTML = (s.services || []).map((svc) => {
    const cls = !svc.running ? 'bad' : svc.healthy || svc.portOK ? 'ok' : 'unknown';
    const state = svc.running ? '运行中' : '已停止';
    const extra = svc.healthy ? '健康' : svc.portOK === false ? '端口未就绪' : '';
    return `<div class="svc">
      <span class="dot ${cls}"></span><b>${svc.name}</b>
      <br><span class="muted">${state}${extra ? ' · ' + extra : ''}</span>
      <br><span class="muted" style="font-size:11px">pid ${svc.pid || '–'}</span>
    </div>`;
  }).join('') || '<span class="muted">栈未运行</span>';
}

let followAbort = null;
$('btnLogFollow').onclick = () => {
  if (followAbort) { followAbort.abort(); followAbort = null; return; }
  followAbort = new AbortController();
  $('logBox').textContent = '';
  $('btnLogFollow').textContent = '停止跟随';
  $('logState').textContent = '跟随中…';
  fetch(`/api/logs/stream?service=${$('logSvc').value}&tail=100`, { signal: followAbort.signal })
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
      ? `发现新版本 ${r.latest}（当前 ${r.current}），可离线升级：下载 Release 资产放入 incoming/ 后点「离线升级」。`
      : `已是最新版本（${r.current}）。`;
  } catch (e) { $('updateInfo').textContent = `检查失败：${e.message}`; }
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

// ---- 汇总表单 → InstallConfig（密钥字段空=保持原值） ----
function collect() {
  const out = JSON.parse(JSON.stringify(cfg));
  const mgmt = $('f_mgmtPw') ? $('f_mgmtPw').value : '';
  out.mgmtPassword = mgmt; // 仅本次提交用；后端 SetPassword
  out.liveKit.httpPort = Number(out.liveKit.httpPort);
  out.zlm.httpPort = Number(out.zlm.httpPort);
  out.zlm.mode = 'local';
  out.liveKit.mode = cfg.liveKit.signalUrl && !cfg.liveKit.signalUrl.startsWith('ws://' + cfg.publicIp) ? 'remote' : 'local';
  return out;
}

boot();
