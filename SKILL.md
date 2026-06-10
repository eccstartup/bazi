---
name: alipay-bazi
description: AI收 x402 八字排盘查询。Agent 提交出生信息 → 收到 payment_link → 调用 alipay-bot trigger-payment-signal → 用户扫码支付 → 返回八字结果。
metadata:
  api-base: /v1/bazi
  payment: x402
  alipay-bot-version: ">=1.0"
---

# 八字排盘 - AI收 x402 模式

## Agent 交互流程

```
Agent                                       八字排盘服务
 ─────────────────────────────────────────────────────────
  1. POST /v1/bazi/query
     { year, month, day, hour, gender }  ───►

     ◄─── 200 { code:0, payment_link, order_token, price }

  2. Agent 调用 alipay-bot 处理支付
     $ alipay-bot trigger-payment-signal \
         --payment-link <payment_link> \
         --amount 0.01

     ◄─── 用户支付宝扫码完成支付

  3. GET /v1/bazi/result/:order_token    ───►

     ◄─── 200 { code:0, data: { 八字结果 } }
```

## API 端点

### 1. 查询八字（返回 payment_link）
```
POST /v1/bazi/query
Content-Type: application/json

{
  "name": "张三",          // 可选
  "gender": "男",          // 可选，默认男
  "year": 2000,            // 必填
  "month": 1,              // 必填
  "day": 1,                // 必填
  "hour": 12,              // 必填
  "minute": 0,             // 可选
  "second": 0              // 可选
}

→ 200
{
  "code": 0,
  "message": "success",
  "order_token": "abc123...",
  "order_no": "BAZI...",
  "price": 0.01,
  "payment_link": "https://.../v1/bazi/pay/abc123..."
  // 演示模式: 直接访问此链接即标记已支付
  // 生产模式: 这是支付宝收银台 URL，需要喂给 alipay-bot
}
```

### 2. 支付
```
GET /v1/bazi/pay/:orderToken

→ 200 { "code": 0, "message": "支付成功" }
→ 404 { "code": 1, "message": "订单不存在" }
```

演示模式直接 GET 这个链接就支付成功。
生产模式是支付宝支付的落地页。

### 3. 查询结果
```
GET /v1/bazi/result/:orderToken
POST /v1/bazi/result/:orderToken

→ 200 { "code": 0, "data": { ... 八字结果 ... } }
→ 200 { "code": 2, "message": "支付未完成" }  (未支付)
→ 404 { "code": 1, "message": "订单不存在" }   (过期)
```

### 4. 健康检查
```
GET /v1/bazi/health
→ { "status": "ok", "basePath": "/v1/bazi", "demo": true }
```

## Agent 调用示例（Node.js）

```js
// 1. 查询八字
const resp = await fetch('http://localhost:3000/v1/bazi/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ year: 2000, month: 1, day: 1, hour: 12 })
});
const data = await resp.json();
// data = { code:0, payment_link:"...", order_token:"...", price:0.01 }

// 2. Agent 调用 alipay-bot 生成支付（由 agent 框架负责）
// execSync(\`alipay-bot trigger-payment-signal --payment-link "\${data.payment_link}"\`)

// 3. 轮询结果
const result = await fetch(`http://localhost:3000/v1/bazi/result/${data.order_token}`);
const bazi = await result.json();
// bazi = { code:0, data: { ri_zhu, sheng_xiao, pillars, wu_xing, ... } }
```

## 八字结果字段

```json
{
  "code": 0,
  "data": {
    "name": "张三",
    "gender": "男",
    "birth": "2000年1月1日 12:00",
    "ri_zhu": "甲（木）",
    "sheng_xiao": "龙",
    "shi_chen": "午",
    "pillars": {
      "year": { "gan": "庚", "zhi": "辰", "na_yin": "白蜡金" },
      "month": { "gan": "戊", "zhi": "寅", "na_yin": "城头土" },
      "day": { "gan": "甲", "zhi": "子", "na_yin": "海中金" },
      "hour": { "gan": "庚", "zhi": "午", "na_yin": "路旁土" }
    },
    "wu_xing": { "年": "金土", "月": "土木", "日": "木水", "时": "金火" },
    "cang_gan": { "年": ["土戊","木乙","水癸"], "月": ["木甲","火丙","土戊"], "日": ["水癸"], "时": ["火丁","土己"] },
    "shen_sha": { "年": [], "月": ["驿马"], "日": [], "时": [] }
  }
}
```

## 本地运行

```bash
cd /Users/eccstartup/code/codex/alipay
node app.js
# http://localhost:3000/v1/bazi/health
```

## 支付宝配置

见 `SETUP_ALIPAY.md`。不配置自动使用演示模式。

## 测试

```bash
node test_x402.js   # 23/23 ✅
node test.js        # 41/41 ✅ (八字引擎)
```
