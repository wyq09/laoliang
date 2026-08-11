#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  服务器端部署脚本 (幂等, 适合 SSH 远程调用)
#  作用: 文件已 rsync 到 /data/laoliang 后, 校验 nginx 配置并 reload
#
#  调用方式 (本地 → 服务器):
#    ssh ubuntu@SERVER_IP 'bash -s' < deploy/deploy-remote.sh
#
#  退出码: 0 成功; 非0 失败 (nginx -t 不通过时不会 reload, 避免把站点搞挂)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_DIR="/data/laoliang"

echo "[deploy-remote] 校验部署目录 $DEPLOY_DIR"
if [ ! -f "$DEPLOY_DIR/index.html" ]; then
  echo "[deploy-remote] 错误: $DEPLOY_DIR/index.html 不存在, rsync 可能失败" >&2
  exit 1
fi

echo "[deploy-remote] 校验 nginx 配置"
if ! sudo nginx -t 2>&1; then
  echo "[deploy-remote] 错误: nginx -t 失败, 不执行 reload (保留旧配置)" >&2
  exit 2
fi

echo "[deploy-remote] reload nginx"
sudo systemctl reload nginx

echo "[deploy-remote] 部署完成 ✓"
