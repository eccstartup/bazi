const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  basePath: process.env.BASE_PATH || '/v1/bazi',

  // ====== AI收 x402 配置 ======
  serviceId: process.env.SERVICE_ID || 'API_2EBF0208D27248F6',
  baziPrice: process.env.BAZI_PRICE || '0.10',  // 元，字符串

  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    // 商户PID（2088开头）
    sellerPid: process.env.ALIPAY_SELLER_PID || '',
    // 商户名称
    sellerName: process.env.ALIPAY_SELLER_NAME || '八字排盘服务',
    // 应用私钥（用于 seller_signature 签名）
    // 支持直接传内容或文件路径
    privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
    // 支付宝公钥（用于验证回调）
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    // 支付宝网关
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  },
};

config.isConfigured = !!(config.alipay.appId && config.alipay.sellerPid && config.alipay.privateKey);
module.exports = config;
