# BizHub —— CoStage 业务接入演示系统（Django）

业务系统视角的 CoStage P0 接入参考实现：决策端点（CoStage 出站询问的裁决方）+
撤权调用方（业务处罚 → CoStage 强制下线）。**接入文档见 [`../docs/costage-biz-integration.md`](../docs/costage-biz-integration.md)**。

## 启动

```bash
./run.sh          # venv + 依赖 + 迁移 + 种子 + runserver 127.0.0.1:7990
```

- 运营控制台：http://127.0.0.1:7990/ （bizadmin / bizadmin1234，见 seed_demo.py）
- 决策端点：`POST http://127.0.0.1:7990/biz/v1/decide`（HMAC 签名，见文档 §3）

## 结构

```
demo/
├── run.sh                  # 一键启动
├── seed_demo.py            # 种子：CoStage users(id 1-5) → 业务身份映射 + 运营账号（幂等）
├── bizhub/                 # Django 工程（settings 含全部集成常量）
└── liveops/
    ├── models.py           # BizUser（业务身份真相源）+ DecisionLog（决策落痕）
    ├── services.py         # ★ verify_signature + decide（演示规则集）+ revoke（撤权调用）
    ├── views.py            # /biz/v1/decide 端点 + 控制台（升教师/禁播撤权/踢观看）
    └── templates/          # 登录页 + 运营控制台
```

## 演示规则集（services.py::decide）

| 动作 | 规则 |
|---|---|
| `live.create` | status=active 且 role=teacher |
| `room.join` | status != banned（放行带 60s 缓存） |
| `mic.apply/ready/accept` | status=active 且 role ∈ {teacher, student} |
| 未收录用户 | 一律拒绝（白名单语义） |

## CoStage 侧对接

重启 CoStage 时追加（其余 env 不变）：

```bash
COSTAGE_AUTHZ_URL='http://127.0.0.1:7990/biz/v1/decide' \
COSTAGE_AUTHZ_SECRET='demo-bizhub-authz-secret' \
COSTAGE_SERVICE_TOKEN='demo-bizhub-service-token'
```

启动日志应出现 `[authz] 已启用决策点 url=... mode=enforce failMode=closed` 与
`[svcapi] 服务间端点已挂载 /api/v1/service/*`。

> 密钥为演示定值，生产务必更换（文档 §7）。
