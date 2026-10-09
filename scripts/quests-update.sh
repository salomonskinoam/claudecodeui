#!/bin/sh
# quests: the in-app "Update" for this fork. Merges the original project's newest release (remote "upstream",
# siteboon/claudecodeui) into our main, so our features stay on top, then rebuilds and restarts.
# Never leaves a broken state: refuses on uncommitted changes, aborts on a merge conflict, and on a failed build
# returns exactly to the version before the update and rebuilds it.
set -e
cd "$(dirname "$0")/.."

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Update refused: there are uncommitted changes in $(pwd). Commit them first."
  exit 1
fi
git checkout --quiet main
before=$(git rev-parse HEAD)

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream https://github.com/siteboon/claudecodeui.git
git fetch --quiet upstream --tags
release=$(git ls-remote --tags --refs upstream 'v*' | sed 's#.*/##' | sort -V | tail -1)
echo "Merging the original project's release $release into ours ($before)."

if ! git merge --no-edit "$release"; then
  echo "Merge conflict in:"
  git diff --name-only --diff-filter=U
  git merge --abort
  echo "Update aborted: nothing changed. The conflicting files above need a manual merge."
  exit 1
fi

if ! { npm install && npm run build; }; then
  echo "Build failed after the merge: returning to $before and rebuilding it."
  git reset --hard "$before"
  npm install && npm run build
  echo "Update aborted: back on the version before the update."
  exit 1
fi

git push origin main || echo "WARNING: the merge is done here, but pushing to the fork failed. Run: git push origin main"
echo "Updated to $release with our features on top. Restarting."
systemctl --user restart --no-block quests-ui.service
