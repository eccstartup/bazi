const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  basePath: process.env.BASE_PATH || '/v1/bazi',

  baziPrice: parseFloat(process.env.BAZI_PRICE || '0.01'),

  // ====== 支付宝配置（不配 = 演示模式） ======
  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    // 私钥路径，指向 certs/app_private_key.pem
    appPrivateKeyPath: process.env.ALIPAY_PRIVATE_KEY_PATH || './certs/app_private_key.pem',
    // 支付宝公钥路径，指向 certs/alipay_public_key.pem
    alipayPublicKeyPath: process.env.ALIPAY_PUBLIC_KEY_PATH || './certs/alipay_public_key.pem',
    // 沙箱或生产网关
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi-sandbox.dl.alipaydev.com',
    // 异步通知地址，需公网可访问
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
    // 支付后跳转地址
    returnUrl: process.env.ALIPAY_RETURN_URL || '',
  },

  logDir: process.env.LOG_DIR || './logs',
};

config.isDemoMode = !config.alipay.appId;
module.exports = config;
