# 支付宝对接配置指南（小白版）

## 需要准备的东西

1. **一个支付宝企业账号**（个人账号不行，必须有营业执照）
2. **一个域名**（ICP 备案过的，用于接收支付宝回调）
3. **一台有公网 IP 的服务器**（云服务器即可）

> 💡 **先不配也能用**：系统默认是**演示模式**，直接给你看结果，不用花钱。配好了自动变成真实支付宝收款。

---

## 第一步：登录支付宝开放平台

打开 https://open.alipay.com/ → 用**企业支付宝账号**扫码登录

> 没有企业账号？你注册的个人支付宝不行，需要企业认证

---

## 第二步：创建网页应用

1. 点顶部"控制台" → "网页移动应用"
2. 点"创建应用" → 选择"**网页应用**"
3. 填写应用名称（如"八字排盘"），上传应用图标
4. 创建成功后，你会看到一个 **AppID**（一串数字）

> 📝 记下这个 AppID，后面要用

---

## 第三步：配置加签方式（最关键的步骤）

1. 在应用详情页，找到"**接口加签方式**" → 点"设置"
2. 选择"**公钥模式**"，签名方式选 "**RSA2**"
3. 点"查看/下载密钥" → 选择"**RSA(SHA256)密钥**"
4. 点"生成密钥" → 系统会下载一个 `RSA密钥.zip`
5. 解压后有两个文件：
   - `app_private_key.pem` ← **私钥**，放到你的服务器上
   - `app_public_key.pem` ← **公钥**，需要上传到支付宝

### 在服务器上放置私钥

```bash
# 把 app_private_key.pem 放到项目 certs/ 目录
# 把 zip 里解压出来的文件复制过来
cp /你下载的路径/app_private_key.pem /your-project/certs/
```

> ⚠️ **不要泄露私钥文件**，别人拿到可以冒充你收款

### 上传公钥到支付宝

1. 在支付宝开放平台，点"设置" → 粘贴 `app_public_key.pem` 的内容
2. 保存后，支付宝会给你一个 **"支付宝公钥"**
3. 复制支付宝公钥内容，在服务器上保存为：

```bash
# 把支付宝返回的公钥内容保存到此文件
nano /your-project/certs/alipay_public_key.pem
# 粘贴进去，保存
```

---

## 第四步：配置授权回调地址

在应用详情页 → "**开发设置**" → "**授权回调地址**"

添加两个地址（把 `your-domain.com` 换成你的）：

```
http://your-domain.com/v1/bazi/alipay/notify
http://your-domain.com/v1/bazi/alipay/return
```

> 正式上线必须用 **HTTPS**，即 `https://your-domain.com/...`

---

## 第五步：配置环境变量

```bash
# 编辑 .env 文件
cd /your-project
cat > .env << EOF
ALIPAY_APP_ID=202100xxxxxx      # 刚才记下的 AppID
ALIPAY_PRIVATE_KEY_PATH=./certs/app_private_key.pem
ALIPAY_PUBLIC_KEY_PATH=./certs/alipay_public_key.pem
ALIPAY_NOTIFY_URL=https://your-domain.com/v1/bazi/alipay/notify
ALIPAY_RETURN_URL=https://your-domain.com/v1/bazi/alipay/return
ALIPAY_GATEWAY=https://openapi.alipay.com
EOF
```

> **沙箱测试**：先用支付宝沙箱环境测试，不花真钱：
> - 沙箱网关: `https://openapi-sandbox.dl.alipaydev.com`
> - 沙箱 AppID 和测试账号在 https://open.alipay.com/ → 沙箱环境 获取

---

## 第六步：重启服务

```bash
# 设置环境变量后重启
export $(cat .env | xargs)
node app.js
```

看到日志出现 `模式: 生产模式 💰` 说明对接成功。

---

## 常见问题

### Q: 没有企业账号怎么办？
A: 演示模式完全可用，只是支付环节点了直接出结果。配上企业账号才能真正收款。

### Q: 没有备案域名怎么办？
A: 演示模式不需要域名。要上线收款必须要有备案域名 + HTTPS。

### Q: 测试时怎么用沙箱？
A: 用沙箱网关 `https://openapi-sandbox.dl.alipaydev.com`，沙箱的测试账号在支付宝开放平台"沙箱环境"里下载。

### Q: 怎么确认支付成功了？
A: 支付宝会 POST 请求 `/v1/bazi/alipay/notify` 告诉你。也可以用 `GET /v1/bazi/result/:orderToken` 轮询。

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `certs/app_private_key.pem` | 你的应用私钥（从支付宝下载的） |
| `certs/alipay_public_key.pem` | 支付宝公钥（从支付宝页面复制的） |
| `.env` | 环境变量配置 |
| `config.js` | 读取环境变量 |

---

**还是不懂？** 直接运行演示模式，把 `.env` 发给我，我帮你检查配置。
