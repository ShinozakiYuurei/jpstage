#!/usr/bin/env bash
#
# 【在服务器上执行】把上一版产物包解回站点目录
#
# 用法：bash /tmp/jpstage-rollback.sh <SITE_ROOT> <WEB_DIR> <MIN_HTML>
#
# 独立成文件而非内嵌 heredoc 的理由见 deploy/remote-swap.sh 顶部注释
# （嵌套转义会把 $(...) 提前在本地展开，让校验静默失效）。
set -euo pipefail

SITE_ROOT="${1:?用法: jpstage-rollback.sh <SITE_ROOT> <WEB_DIR> <MIN_HTML>}"
WEB_DIR="${2:?缺少 WEB_DIR}"
MIN_HTML="${3:?缺少 MIN_HTML}"

PREV="$WEB_DIR/jpstage-prev.tar"
[ -f "$PREV" ] || { echo "✖ 没有 $PREV，无法回滚（还没做过第二次部署？）"; exit 1; }

# 校验 tar 可读，避免把损坏的备份解出来
tar -tf "$PREV" >/dev/null 2>&1 || { echo "✖ $PREV 已损坏"; exit 1; }

# 先读清单再计数（grep -c 直接接 tar 会在 pipefail 下误报，理由见 remote-swap.sh）
LISTING=$(tar -tf "$PREV")
N=$(printf '%s\n' "$LISTING" | grep -c '\.html$' || true)
echo "  备份含 $N 个 HTML"
[ "$N" -ge "$MIN_HTML" ] || { echo "✖ 备份只有 $N 页，低于阈值 $MIN_HTML，拒绝回滚"; exit 1; }

# 把当前版本也存一份，万一回滚后发现问题还能再换回来
tar -cf "$WEB_DIR/jpstage-next.tar" -C "$SITE_ROOT" . 2>/dev/null || true
find "$SITE_ROOT" -mindepth 1 -delete
tar -xf "$PREV" -C "$SITE_ROOT"
chmod -R a+rX "$SITE_ROOT"
echo "  ✓ 已回滚（当前版本存为 jpstage-next.tar，可再次回滚换回）"
