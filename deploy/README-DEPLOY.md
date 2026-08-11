# 部署说明 · laoliang.youyongai.com

纯静态站点，通过 GitHub Actions 自动部署到服务器，由系统级 nginx 托管，HTTPS 证书由 Let's Encrypt 自动签发并续期。

## 架构

```
GitHub (push main) ──Actions──> rsync ──> /data/laoliang (静态文件)
                                              │
            Let's Encrypt 证书 + nginx ───────┴──> https://laoliang.youyongai.com
```

- **服务器**：`SERVER_IP`（Ubuntu 24.04）
- **部署目录**：`/data/laoliang`
- **站点配置**：`/etc/nginx/sites-available/laoliang.youyongai.com.conf`
- **证书目录**：`/etc/letsencrypt/live/laoliang.youyongai.com/`
- **续期**：`certbot.timer` 自动续期，续期后由 `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` 自动 reload nginx

## 服务器侧（已一次性配好，一般不用动）

这些在初次部署时已完成，记录在此供排障：

1. 静态目录 `/data/laoliang`（属主 ubuntu）
2. nginx 站点配置 + 软链到 `sites-enabled`
3. certbot webroot 签发证书：`sudo certbot certonly --webroot -w /var/www/html -d laoliang.youyongai.com`
4. 免密 sudo：`/etc/sudoers.d/laoliang-deploy`（仅允许 `nginx -t` 和 `systemctl reload nginx`）
5. 证书续期 hook：`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`

## GitHub Actions 配置（Secrets）

CI/CD 需要在仓库 **Settings → Secrets and variables → Actions** 配置以下 Secret。私钥不会进仓库，只放在 GitHub Secret 里。

| Secret 名 | 必填 | 说明 |
|---|---|---|
| `DEPLOY_SSH_KEY` | ✅ | 部署专用 SSH 私钥（ed25519，本地生成的那把，完整内容含 `-----BEGIN/END...-----`） |
| `SSH_HOST_KEY` | ✅ | 服务器 host key，避免 CI 卡在 yes/no 确认。获取方式见下 |
| `DEPLOY_HOST` | 可选 | 默认 `SERVER_IP` |
| `DEPLOY_USER` | 可选 | 默认 `ubuntu` |
| `SSH_PORT` | 可选 | 默认 `22` |

### 获取 `SSH_HOST_KEY`

```bash
ssh-keyscan -t ed25519 SERVER_IP
```

输出形如（整行粘贴）：

```
SERVER_IP ssh-ed25519 SSH_HOST_KEY_PLACEHOLDER
```

### 重新生成部署密钥（如需）

```bash
ssh-keygen -t ed25519 -f ~/.ssh/laoliang_deploy_ed25519 -C "github-actions-deploy@laoliang.youyongai.com"
# 公钥追加到服务器
cat ~/.ssh/laoliang_deploy_ed25519.pub | ssh ubuntu@SERVER_IP 'cat >> ~/.ssh/authorized_keys'
# 私钥粘贴到 GitHub Secret DEPLOY_SSH_KEY
```

## 手动部署（不用 CI）

如果 Actions 没配好或想本地直接发：

```bash
# 1. 同步文件
rsync -avz --delete \
  --exclude='.git' --exclude='.github' --exclude='deploy' \
  --exclude='README.md' --exclude='.gitignore' \
  --exclude='output' --exclude='.playwright-cli' --exclude='.zcode' \
  ./ ubuntu@SERVER_IP:/data/laoliang/

# 2. reload nginx
ssh ubuntu@SERVER_IP 'bash -s' < deploy/deploy-remote.sh
```

## 排障

```bash
# 看站点状态
curl -sIL https://laoliang.youyongai.com/

# 看证书
sudo certbot certificates --cert-name laoliang.youyongai.com

# 手动续期测试（不会真续，只模拟）
sudo certbot renew --cert-name laoliang.youyongai.com --dry-run

# 看 nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 回滚某次部署（如果有备份）
sudo cp -a /data/laoliang.bak /data/laoliang && sudo systemctl reload nginx
```
