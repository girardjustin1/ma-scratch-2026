#!/bin/sh
# Install (or reinstall) the daily data job: renders the plist template into
# ~/Library/LaunchAgents and loads it with launchctl. Runs scripts/update_data.py at 07:15.
#   sh scripts/install_update_job.sh
# Uninstall:
#   launchctl bootout gui/$(id -u)/com.girardjustin.ma-scratch.update
#   rm ~/Library/LaunchAgents/com.girardjustin.ma-scratch.update.plist
set -eu
LABEL=com.girardjustin.ma-scratch.update
REPO=$(cd "$(dirname "$0")/.." && pwd)
UV=$(command -v uv) || { echo "uv not found on PATH" >&2; exit 1; }
NODE=$(command -v node) || { echo "node not found on PATH" >&2; exit 1; }
JOB_PATH="$(dirname "$UV"):$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

# launchd creates the log files itself; only the folder is made here. Never create, rotate
# or truncate data/logs/update.*.log from a shell (a shell-made file in ~/Documents lacks the
# attribute launchd needs, and the job then fails with EX_CONFIG).
mkdir -p "$REPO/data/logs"

sed -e "s#__REPO__#$REPO#g" -e "s#__UV__#$UV#g" -e "s#__PATH__#$JOB_PATH#g" -e "s#__HOME__#$HOME#g" \
  "$REPO/scripts/launchd/$LABEL.plist.template" > "$DEST"
plutil -lint "$DEST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "installed $LABEL -> $DEST (daily 07:15; logs in $REPO/data/logs/)"
