---
name: alipay-bazi
description: >-
  提供基于支付宝“AI收” (x402) 协议的生辰八字排盘与命运查询工具。
  当用户想要查询八字、算命、测五行、天干地支排盘等时，调用此 Skill 开启支付与查询流程。
  支持标准的 HTTP 402 Agent 原生自动支付。
---

# 🔮 八字排盘 (AI收 x402 协议)

此服务支持标准的 **HTTP 402 (Payment Required)** 协议。智能体 (AI Agent) 可直接调用此 API，并在服务发起 402 挑战时通过支付宝 AI 钱包 (AI Pay) 自动完成支付。

## 🌐 服务基础信息

- **服务 API 根地址 (Base URL)**: `https://bazi-pay.vercel.app`
- **在线 Skill 文档地址**: `https://bazi-pay.vercel.app/skill.md`
- **收费价格**: `0.10` 元 (CNY) / 次
- **支付服务商 ID (Service ID)**: `API_2EBF0208D27248F6`

---

## 🔄 智能体 (Agent) 交互支付流程

整个交互过程对于 Agent 而言是**同步且无感**的，流程如下：

```
Agent                                      八字排盘服务 (Vercel)
  │                                                │
  ├─ 1. 尝试查询八字 (无凭证) ──────────────────────>│
  │    POST /v1/bazi/query                         │
  │                                                │
  │<─ 2. 返回 402 挑战 (含 Payment-Needed Header) ─┤
  │    HTTP 402 Payment Required                   │
  │                                                │
  ├─ 3. 调用支付宝 AI 钱包 Skill 完成支付             │
  │    (解析 Header 内的商品信息自动授权付款)          │
  │    获取支付凭证 (Payment-Proof)                │
  │                                                │
  ├─ 4. 带上凭证重新发起请求 ────────────────────────>│
  │    POST /v1/bazi/query                         │
  │    Headers: { "Payment-Proof": "..." }         │
  │                                                │
  │<─ 5. 校验凭证成功，返回八字数据 ─────────────────┤
  │    HTTP 200 OK                                 │
  └                                                └
```

---

## 🛠️ 接口规范

### 1. 查询八字接口

- **路径**: `/v1/bazi/query`
- **方法**: `POST`
- **内容类型**: `application/json`

#### 请求参数 (Body)

| 参数名 | 类型 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `year` | Integer | 是 | 出生年份，如 `2000` |
| `month` | Integer | 是 | 出生月份，如 `1` |
| `day` | Integer | 是 | 出生日期，如 `1` |
| `hour` | Integer | 是 | 出生小时，`0` 至 `23` |
| `name` | String | 否 | 姓名，默认“用户” |
| `gender` | String | 否 | 性别，`男` 或 `女`，默认 `男` |
| `minute` | Integer | 否 | 出生分钟，默认 `0` |
| `second` | Integer | 否 | 出生秒数，默认 `0` |

#### 响应 A: 未付款时的 402 响应

当请求头中不含有效的 `Payment-Proof` 时，服务会返回 `HTTP 402` 并附带 `Payment-Needed` 响应头。

- **HTTP 状态码**: `402 Payment Required`
- **响应头 (Headers)**:
  - `Payment-Needed`: 一个 Base64URL 编码的 JSON 字符串（包含交易单号、金额、收款人商户ID、商户签名等，直接传递给支付宝钱包插件即可）。
- **响应体 (JSON)**:
  ```json
  {
    "code": 402,
    "message": "Payment Required",
    "price": "0.10",
    "currency": "CNY"
  }
  ```

#### 响应 B: 已付款时的 200 响应

当请求头中携带正确的 `Payment-Proof` 头时，服务将通过支付宝网关验证付款状态，验证成功后返回八字排盘数据。

- **HTTP 状态码**: `200 OK`
- **请求头 (Headers) 必须包含**:
  - `Payment-Proof`: `{{支付成功后获取的凭证字符串}}`
- **响应体 (JSON)**:
  ```json
  {
    "code": 0,
    "message": "success",
    "data": {
      "name": "张三",
      "gender": "男",
      "birth": "2000年01月01日 12:00:00",
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

---

### 2. 服务健康状态检查

- **路径**: `/v1/bazi/health`
- **方法**: `GET`
- **响应体 (JSON)**:
  ```json
  {
    "status": "ok",
    "basePath": "/v1/bazi",
    "service_id": "API_2EBF0208D27248F6",
    "configured": true
  }
  ```

---

## 🤖 Agent 接入伪代码示例

在 Agent 框架中（如集成了支付宝开放技能的系统），你只需要捕捉 402 状态码，并调用内置的支付工具即可：

```python
import requests
import json
import base64

def query_bazi_with_auto_pay(birth_info):
    url = "https://bazi-pay.vercel.app/v1/bazi/query"
    
    # 步骤 1: 首次尝试查询
    response = requests.post(url, json=birth_info)
    
    # 步骤 2: 判断是否需要支付 (HTTP 402)
    if response.status_code == 402:
        payment_needed = response.headers.get("Payment-Needed")
        if not payment_needed:
            raise Exception("缺少支付引导头 (Payment-Needed)")
            
        print("发现 402 支付请求，正在调用支付宝 AI 钱包进行无感付款...")
        
        # 步骤 3: 调用支付宝官方支付 Skill 完成付款并生成凭证
        # (此步骤一般由您的 Agent 框架内置的支付宝支付 Skill 自动处理)
        payment_proof = agent.use_skill(
            "alipay-pay-for-402-service",
            payment_needed=payment_needed
        )
        
        # 步骤 4: 携带支付凭证重新发起请求
        headers = {
            "Payment-Proof": payment_proof,
            "Content-Type": "application/json"
        }
        final_response = requests.post(url, json=birth_info, headers=headers)
        return final_response.json()
        
    elif response.status_code == 200:
        return response.json()
        
    else:
        raise Exception(f"服务异常: {response.text}")
```

---

## 🔗 相关资源与参考

- [支付宝 AI收官方文档](https://ideservice.alipay.com/cms/site/0jaqax)
- [支付宝 AI 支付 Agent 官方技能集合](https://github.com/alipay/payment-skills)

