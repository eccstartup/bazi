# 🔮 AI 八字排盘 - x402 支付模式

基于支付宝 AI 支付技能的八字查询服务。

```
POST /v1/bazi/query   →   402  { payment_url }
GET  /v1/bazi/pay/xxx →   200  { PAID }
GET  /v1/bazi/result/xxx → 200  { 八字数据 }
```

## 快速开始

```bash
cd /Users/eccstartup/code/codex/alipay
node app.js
# http://localhost:3000/v1/bazi/health
```

演示模式，无需任何配置，支付直接返回成功。

## 测试

```bash
node test_x402.js   # x402 全链路 37 项测试
node test.js        # 八字引擎 + 渲染 41 项测试
```

## API 文档

详见 `SKILL.md`。

## 支付宝配置

详见 `SETUP_ALIPAY.md`。

## 部署

```bash
# 云服务器
node app.js
# 或使用 PM2 守护
npm install -g pm2
pm2 start app.js --name bazi-app
```

## 项目结构

```
alipay/
├── app.js           # Express 主入口（x402 支付 API）
├── bazi.js          # 八字计算引擎
├── alipay.js        # 支付宝支付集成
├── config.js        # 配置
├── SKILL.md         # Agent 使用说明
├── SETUP_ALIPAY.md  # 支付宝配置指南（小白版）
├── test_x402.js     # x402 全链路测试
├── test.js          # 八字引擎测试
└── certs/           # 支付宝密钥（需自行放置）
```
