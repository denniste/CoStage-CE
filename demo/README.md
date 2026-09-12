# 惠民超市（BizHub）—— CoStage 业务接入演示系统

一家**单店大型超市**的完整业务系统（Django 实现，非多租户 SaaS）：顾客商城 + 员工后台。
Phase 1 = 超市本体（独立运行，不依赖 CoStage）；Phase 2 = 接入 CoStage 做**商品直播**
（店员开播卖货、顾客/匿名观看）。

- 接入文档：[`../docs/costage-biz-integration.md`](../docs/costage-biz-integration.md)

## 启动

```bash
./run.sh    # venv + 依赖 + 迁移 + 种子 + runserver 127.0.0.1:7990
```

## 账号（种子见 seed_demo.py）

| 角色 | 账号 | 口令 | 说明 |
|---|---|---|---|
| 经理（店长） | `manager` | `manager123` | 全部后台 + 员工/分类管理 |
| 店员 | `staff01` ~ `staff03` | `staff123456` | 看板/商品上下架/库存/发货 |
| 顾客 | 自助注册 | — | 商城首页 → 注册 |

## 功能清单

**顾客商城**（匿名可浏览，登录后购买）
- 分类浏览 / 关键词搜索 / 商品详情
- 购物车（加购/改量/删除，库存上限约束）
- 下单（收货信息，事务扣库存）→ 模拟支付 → 取消（回补库存）→ 确认收货
- 我的订单 / 订单详情（状态：待支付→已支付→已发货→已完成/已取消）

**员工后台** `/staff/`（登录后按角色自动跳转）
- 经营看板：今日销售额/订单数、待发货、低库存预警、最新订单
- 商品管理：新增/编辑（经理）、上下架（店员）、库存调整（盘点 ±）
- 订单管理：按状态筛选、发货
- 分类管理（经理）：增删（空分类才可删）
- 员工管理（经理）：店员/经理建档、停用启用

## 结构

```
demo/
├── run.sh / requirements.txt / seed_demo.py
├── bizhub/                  # Django 工程配置
└── supermarket/
    ├── models.py            # Profile(角色) Category Product CartItem Order OrderItem DecisionLog
    ├── views_auth/store/cart/order/staff.py   # 各功能区视图
    ├── livegate.py          # CoStage 决策端点（Phase 2：/biz/v1/decide）
    └── templates/supermarket/  # 商城 + staff/ 后台模板
```

## Phase 2 接入 CoStage（商品直播，已实现，方案 A trusted 换票）

- 店员后台「● 开播卖货」→ 超市调 CoStage exchange 换票（`supermarket/live.py`）→
  带 `#sso=` 跳 CoStage，落地即登录（CoStage web ssoIntake 写票）→「我的房间」开播
- 商城首页「直播中」条 → 顾客/匿名一键进直播间（匿名走 CoStage anon-token 流）
- CoStage 决策询问 `/biz/v1/decide`：**员工可开播/连麦，顾客仅观看**（`livegate.py`）
- CoStage 侧启用：`COSTAGE_AUTH_MODE=trusted` + `COSTAGE_TRUSTED_SECRET`
  （与 demo settings `COSTAGE_TRUSTED_SECRET` 同值）+ 原 authz 三件 env；
  契约与走查见接入文档 §8
