#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT_DEFAULT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
PROJECT_ROOT=${1:-$PROJECT_ROOT_DEFAULT}
OUTPUT_PATH=${2:-$HOME/Library/LaunchAgents/ai.lalaclaw.app.plist}
TEMPLATE_PATH="$SCRIPT_DIR/ai.lalaclaw.app.plist.example"
LOG_DIR="$PROJECT_ROOT/logs"

if [[ ! -f "$TEMPLATE_PATH" ]]; then
  echo "Template not found: $TEMPLATE_PATH" >&2
  exit 1
fi

mkdir -p -- "$(dirname -- "$OUTPUT_PATH")"
mkdir -p -- "$LOG_DIR"

ESCAPED_PROJECT_ROOT=$(printf '%s' "$PROJECT_ROOT" | sed 's/[&|]/\\&/g')

sed "s|/ABSOLUTE/PATH/TO/LALACLAW|$ESCAPED_PROJECT_ROOT|g" "$TEMPLATE_PATH" > "$OUTPUT_PATH"

echo "Wrote $OUTPUT_PATH"
echo "Project root: $PROJECT_ROOT"
echo "Logs directory: $LOG_DIR"
echo
echo "Next steps:"
echo "  launchctl bootstrap gui/\$(id -u) $OUTPUT_PATH"
echo "  launchctl enable gui/\$(id -u)/ai.lalaclaw.app"
echo "  launchctl kickstart -k gui/\$(id -u)/ai.lalaclaw.app"
