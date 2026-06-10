#!/bin/bash
# ===================================
# 八字排盘 API 自助测试脚本
# 用法: 先 node app.js 启动服务，再 bash scripts/test-api.sh
# ===================================

BASE="http://localhost:3000/v1/bazi"

echo "🔮 八字排盘 API 测试"
echo "===================="

# 0. 检查服务是否在线
echo ""
echo "--- 0. 检查服务 ---"
if ! curl -s --connect-timeout 3 "$BASE/health" > /dev/null 2>&1; then
  echo "  ❌ 无法连接 $BASE"
  echo "  请先启动服务: node app.js"
  exit 1
fi
echo "  ✅ 服务在线"

# 1. 健康检查
echo ""
echo "--- 1. 健康检查 ---"
curl -s --fail "$BASE/health" | python3 -m json.tool || echo "  ❌ 健康检查失败"

# 2. 提交八字查询
echo ""
echo "--- 2. 提交查询（2000-01-01 08:00 男）---"
RESP=$(curl -s --fail -X POST "$BASE/query" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试用户","gender":"男","year":2000,"month":1,"day":1,"hour":8}')

if [ -z "$RESP" ]; then
  echo "  ❌ 查询接口无响应"
  exit 1
fi

echo "$RESP" | python3 -m json.tool

# 提取 order_token
TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order_token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "  ❌ 未获取到 order_token"
  exit 1
fi
echo ""
echo "  order_token: $TOKEN"

# 3. 模拟支付
echo ""
echo "--- 3. 模拟支付 ---"
curl -s --fail "$BASE/pay/$TOKEN" | python3 -m json.tool || echo "  ❌ 支付失败"

# 4. 获取八字结果
echo ""
echo "--- 4. 获取八字结果 ---"
curl -s --fail "$BASE/result/$TOKEN" | python3 -m json.tool || echo "  ❌ 查询失败"

echo ""
echo "===================="
echo "✅ 测试完成"
