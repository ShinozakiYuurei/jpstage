#!/usr/bin/env bash
#
# 一条命令把本机代码发布到线上。
#
#   bash deploy/sync.sh                    # 存档 → 构建 → 上传 → 冒烟
#   bash deploy/sync.sh -m "修好筛选"      # 指定提交说明
#   bash deploy/sync.sh --no-commit        # 不存档，直接构建上传（临时验证用）
#   bash deploy/sync.sh --rollback         # 回到线上上一版（不构建）
#   bash deploy/sync.sh --dry-run          # 只构建与检查，不碰线上
#
# ════════════════════════════════════════════════════════════════════
#  ★ 与 hkmovie 的 deploy/sync.sh 的关键差别：构建在本机
# ════════════════════════════════════════════════════════════════════
#
#  hkmovie 的链路是「本机推送 → 服务器拉代码 → 服务器 npm ci + next build」。
#  那条路要求服务器有完整的 Node 工具链与足够内存，而它的服务器就是构建机。
#
#  本站的服务器只有 2 核 2G，**可用内存长期在 600MB 上下**，且 dmesg 里
#  有真实的 OOM 记录。让它在跑着别人站点的同时做 Next 构建，风险不是慢，
#  而是可能触发 OOM 把无关进程一起杀掉。
#
#  所以本站改为**本机构建、只传产物**（12MB）。服务器不装 Node、不占内存。
#  代价是本机要有构建环境 —— 开发本来就在本机，这个代价接近零。
#
# ════════════════════════════════════════════════════════════════════
#  ★ 为什么没有「推送 GitHub」这一步
# ════════════════════════════════════════════════════════════════════
#
#  hkmovie 的 sync.sh 里有 `git push`，因为它的服务器要从 GitHub 拉代码。
#  本站不拉代码（见上），所以推送与否不影响上线 —— 但它**影响可追溯性**：
#  线上跑的是哪一版代码，只能靠 .deploy-info 里记的 commit 对应。
#
#  因此本脚本仍然会尝试推送（失败不阻断），并把 commit 记进 .deploy-info。
#  推送失败只是让 GitHub 落后，不影响站点；要让它生效需先在 GitHub
#  配好本仓库的 deploy key（见 README 的部署章节）。
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="${DOMAIN:-jpstage.yuurei.de}"
SITE_URL="${SITE_URL:-https://$DOMAIN}"

say() { printf '\n▶ %s\n' "$*"; }
die() { printf '✖ %s\n' "$*" >&2; exit 1; }

DO_COMMIT=1; MODE=deploy; MSG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-commit) DO_COMMIT=0 ;;
    --rollback)  MODE=rollback ;;
    --dry-run)   MODE=dry ;;
    -m)          shift; MSG="${1:-}" ;;
    -h|--help)   sed -n '2,14p' "$0"; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
  shift
done

# ---------- 回滚：不构建，直接换回服务器上的上一版 ----------
if [ "$MODE" = "rollback" ]; then
  bash deploy/remote-upload.sh --rollback
  exit 0
fi

# ---------- 1. 本地自检 ----------
say "[1/5] 本地自检"

# 用本地的 tsc，不用 npx：npx 在找不到本地包时会联网下载，
# 让「发布」这件事依赖网络可达性（hkmovie 踩过这个坑）。
[ -x node_modules/.bin/tsc ] || die "缺 node_modules/.bin/tsc，先跑 npm install"
node_modules/.bin/tsc --noEmit
echo "  ✓ 类型检查通过"

# 数据校验：抓取脚本最容易出的错（status 与日期不符、引用不存在的 ID、
# 双语字段为空）都是**静默**的 —— 页面照样 200，只是内容不对。
node scripts/scrape.mjs --validate-only
echo "  ✓ 数据校验通过"

# ---------- 2. 存档 ----------
say "[2/5] 存档"
if [ "$DO_COMMIT" = "1" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    if [ -z "$MSG" ]; then
      MSG="本機 $(date +%F\ %H:%M) 改動：$(git status --porcelain | sed 's/^...//' | tr '\n' ' ' | cut -c1-60)"
    fi
    git -c user.name=ShinozakiYuurei \
        -c user.email=152761137+ShinozakiYuurei@users.noreply.github.com \
        commit -q -m "$MSG"
    echo "  已提交：$MSG"
  else
    echo "  工作区干净，复用现有存档"
  fi
else
  echo "  --no-commit，跳过存档"
fi
COMMIT=$(git rev-parse HEAD 2>/dev/null || echo none)
echo "  HEAD ${COMMIT:0:7}"

# ---------- 3. 构建 ----------
say "[3/5] 构建静态站点"

# ★ NEXT_PUBLIC_SITE_URL 必须在**构建时**给定：
#   sitemap.xml / robots.txt 里的绝对 URL 是构建期写死的字面量，
#   忘了设就会烘进 localhost 或 example 域名 —— 页面上完全看不出来，
#   只有搜索引擎会看到一堆错误 URL。所以这里显式传，且传完立刻校验。
rm -rf out
NEXT_PUBLIC_SITE_URL="$SITE_URL" npm run build
N_HTML=$(find out -name '*.html' | wc -l)
echo "  产物：$N_HTML 页 / $(du -sh out | cut -f1)"

# 构建后立刻验域名是否真的烘进去了（而不是等上传脚本报错才发现）
grep -q "$DOMAIN" out/sitemap.xml || die "sitemap.xml 里没有 $DOMAIN，构建环境变量未生效"
echo "  ✓ $DOMAIN 已烘入 sitemap"

# ---------- 4. 上传 ----------
say "[4/5] 上传产物"
if [ "$MODE" = "dry" ]; then
  bash deploy/remote-upload.sh --dry-run
  say "--dry-run 完成，未上线"
  exit 0
fi
bash deploy/remote-upload.sh

# ---------- 5. 记录线上版本 ----------
# ★ 为什么要把 commit 写进服务器：产物是构建期定稿的，服务器上没有 .git，
#   出问题时无法回答「线上跑的是哪一版」。hkmovie 也做了同一件事。
#   失败不阻断 —— 它只是可追溯性信息，不该让一次成功的发布变成失败。
say "[5/5] 记录线上版本"
VPS="${VPS_ALIAS:-伤心的云-HK}"
if timeout 60 ssh -o BatchMode=yes -o ConnectTimeout=20 "$VPS" \
   "printf '%s\t%s\t%s\n' '$COMMIT' '$MSG' '$(date -Iseconds)' > /home/web/jpstage/.deploy-info && chmod 644 /home/web/jpstage/.deploy-info" 2>/dev/null; then
  echo "  已记录：${COMMIT:0:7}"
else
  echo "  ⚠ 记录失败（不影响站点）"
fi

# 推送 GitHub：失败不阻断（服务器不从 GitHub 拉代码，见文件顶部说明）
if [ "$DO_COMMIT" = "1" ] && git remote get-url origin >/dev/null 2>&1; then
  if git push -q origin HEAD 2>/dev/null; then
    echo "  已推送 GitHub"
  else
    echo "  ⚠ 推送 GitHub 失败（不影响站点；配好 deploy key 后即可）"
  fi
fi

printf '\n✅ 已发布：%s\n\n' "$SITE_URL"
