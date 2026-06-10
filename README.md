# 🔮 八字排盘服务 (Alipay AI收 x402 协议)

基于 Node.js/Express 构建的生辰八字排盘与命运查询服务，深度集成支付宝最新的 **AI收 (x402) 协议**，专为 AI 智能体 (AI Agents) 打造原生无感支付体验。

---

## 🔄 AI收 x402 支付与验证流程

本项目不再使用传统的网页跳转或轮询，而是采用完全基于 HTTP Header 交互的同步 x402 协议：

```
1. Agent 发起生辰信息查询
   POST /v1/bazi/query  (无凭证)
       ↓
2. 服务端拦截，返回付费账单
   HTTP 402 Payment Required 
   Header [Payment-Needed]: Base64URL(账单数据)
       ↓
3. Agent 调用支付宝 AI 钱包 (AI Pay) 自动完成扣款
   获取支付凭证 [Payment-Proof] 密文
       ↓
4. Agent 携带凭证重试原请求
   POST /v1/bazi/query
   Header [Payment-Proof]: Base64(凭证数据)
       ↓
5. 服务端通过支付宝 API 验证成功，交付资源
   HTTP 200 OK + 八字结果 JSON
```

---

## 🚀 快速开始

### 1. 启动服务

```bash
# 安装依赖
npm install

# 启动开发服务器（默认端口 3000）
npm run dev
```
本地访问健康检查接口以确认启动：[http://localhost:3000/v1/bazi/health](http://localhost:3000/v1/bazi/health)

> 💡 **本地开发模式**：在未配置支付宝环境变量时，服务将处于本地开发模式。此时未支付查询直接返回 402，而在带上任意 `Payment-Proof`（甚至裸凭证）重新请求时，服务将跳过支付宝网关校验直接返回排盘结果，便于您测试业务逻辑。

### 2. 运行测试

本项目包含完整的 API 路由逻辑与八字计算排盘引擎测试用例：

```bash
npm test
# 共包含 78 个自动化校验用例 (42 个 API 用例 + 36 个排盘引擎用例)
```

---

## ⚙️ 环境变量配置

要启用真实的支付宝扣款与防重校验，请在 Vercel 或本地 `.env` 文件中配置以下变量：

```ini
# 支付宝核心配置
ALIPAY_APP_ID=202100xxxxxx         # 支付宝应用 ID
ALIPAY_SELLER_PID=2088xxxxxx       # 收款商户 PID
ALIPAY_PRIVATE_KEY=MIIEv...        # 商家应用私钥 (PEM/裸密钥多行文本)
ALIPAY_PUBLIC_KEY=MIIBI...         # 支付宝公钥 (非应用公钥)
ALIPAY_SELLER_NAME=八字排盘服务    # 收款商户名称 (选填)

# 服务自定义配置
SERVICE_ID=API_2EBF0208D27248F6   # 服务注册 ID
BAZI_PRICE=0.10                    # 每次排盘价格（单位：元）
```

---

## 📖 相关文档

- [SKILL.md](file:///Users/eccstartup/code/codex/alipay/SKILL.md)：AI 智能体 (Agent) 接入本服务的协议标准与伪代码指南。
- [SETUP_ALIPAY.md](file:///Users/eccstartup/code/codex/alipay/SETUP_ALIPAY.md)：针对商家的支付宝开放平台入驻、密钥生成及回调配置指南。

---

## 📂 项目结构

```
alipay/
├── api/
│   └── index.js       # Vercel Serverless 部署入口
├── test/
│   ├── api.test.js    # x402 协议与签名算法测试
│   └── bazi.test.js   # 八字排盘引擎测试
├── app.js             # Express 核心路由与 /skill.md 服务
├── alipay.js          # 402 账单签名、Payment-Proof 验证与履约回执
├── bazi.js            # 生辰八字干支排盘、五行、纳音、藏干引擎
├── config.js          # 环境变量与默认配置管理
├── SKILL.md           # 智能体技能描述说明书
├── SETUP_ALIPAY.md    # 商家支付宝配置文档
├── vercel.json        # Vercel 路由与重写规则
└── package.json       # 项目依赖及测试脚本
```
