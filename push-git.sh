#!/usr/bin/env bash
# ===== PocoERP: commit and push to all remotes (github / gitee) =====
# Usage:
#   ./push-git.sh some commit message   -> use args as commit message
#   ./push-git.sh                       -> prompt for message
#   (empty input)                       -> default "updated"

set -u

# 1. Commit message: command line args > user input > default "updated"
msg="$*"
if [ -z "$msg" ]; then
    read -r -p "Enter commit message (press Enter for 'updated'): " msg
fi
[ -z "$msg" ] && msg="updated"

echo
echo "[push-git] Commit message: $msg"
echo

# 2. Stage and commit
if ! git add -A; then
    echo "[push-git] git add failed, aborting."
    exit 1
fi

# If there is nothing to commit, continue to push anyway
# (there may be older commits not pushed yet)
if ! git commit -m "$msg"; then
    echo "[push-git] Nothing to commit, pushing existing commits."
fi

# 3. Push to every configured remote (github / gitee)
for r in $(git remote); do
    echo
    echo "[push-git] Pushing to remote: $r"
    if git push "$r" HEAD; then
        echo "[push-git] Push to $r done."
    else
        echo "[push-git] Push to $r FAILED. Check network or remote config."
    fi
done

echo
echo "[push-git] All finished."
