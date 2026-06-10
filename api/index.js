// Vercel Serverless 入口 — 直接导出 Express app
// @vercel/node 自动识别 Express 并处理
const { app } = require('../app');
module.exports = app;
