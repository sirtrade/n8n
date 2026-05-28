#!/usr/bin/env bash
# Apply self-host patches: Enterprise features by default, telemetry disabled.
#
# Usage:
#   ./scripts/self-host/apply.sh           Apply patches
#   ./scripts/self-host/apply.sh --restore   Restore originals from backup
#   ./scripts/self-host/apply.sh --status    Show patch state
#
# After applying, build and run:
#   pnpm build:docker
#   docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n:local
#
# Or for local dev:
#   pnpm build && pnpm dev

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PATCH_DIR="$(cd "$(dirname "$0")/patches" && pwd)"
BACKUP_DIR="$ROOT/.self-host-backup"
MARKER="SELF-HOST: license checks disabled"

declare -a TRACKED_FILES=(
	"packages/cli/src/license.ts"
	"packages/cli/src/posthog/index.ts"
	"packages/cli/src/commands/base-command.ts"
	"packages/@n8n/config/src/configs/diagnostics.config.ts"
	"packages/@n8n/config/src/configs/version-notifications.config.ts"
	"packages/@n8n/config/src/configs/personalization.config.ts"
	"packages/@n8n/config/src/configs/dynamic-banners.config.ts"
	"packages/@n8n/config/src/index.ts"
	"packages/frontend/editor-ui/index.html"
)

is_applied() {
	grep -q "$MARKER" "$ROOT/packages/cli/src/license.ts" 2>/dev/null
}

backup_file() {
	local rel="$1"
	local src="$ROOT/$rel"
	local dest="$BACKUP_DIR/$rel"
	if [[ ! -f "$src" ]]; then
		echo "Missing file: $rel" >&2
		exit 1
	fi
	mkdir -p "$(dirname "$dest")"
	if [[ ! -f "$dest" ]]; then
		cp "$src" "$dest"
	fi
}

restore_file() {
	local rel="$1"
	local src="$BACKUP_DIR/$rel"
	local dest="$ROOT/$rel"
	if [[ -f "$src" ]]; then
		cp "$src" "$dest"
	fi
}

patch_init_license() {
	local file="$ROOT/packages/cli/src/commands/base-command.ts"
	python3 - "$file" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()
replacement = """\tasync initLicense(): Promise<void> {
\t\tthis.license = Container.get(License);
\t\tawait this.license.init();

\t\tContainer.get(LicenseState).setLicenseProvider(this.license);
\t}"""
pattern = r"\tasync initLicense\(\): Promise<void> \{.*?\n\t\}"
new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
if count != 1:
    raise SystemExit(f"Could not patch initLicense() in {path}")
path.write_text(new_text)
PY
}

patch_config_defaults() {
	# Diagnostics + PostHog
	sed -i.bak 's/enabled: boolean = true;/enabled: boolean = false;/' \
		"$ROOT/packages/@n8n/config/src/configs/diagnostics.config.ts"
	rm -f "$ROOT/packages/@n8n/config/src/configs/diagnostics.config.ts.bak"

	# Version notifications (both enabled flags in file)
	sed -i.bak \
		-e 's/enabled: boolean = true;/enabled: boolean = false;/g' \
		"$ROOT/packages/@n8n/config/src/configs/version-notifications.config.ts"
	rm -f "$ROOT/packages/@n8n/config/src/configs/version-notifications.config.ts.bak"

	sed -i.bak 's/enabled: boolean = true;/enabled: boolean = false;/' \
		"$ROOT/packages/@n8n/config/src/configs/personalization.config.ts"
	rm -f "$ROOT/packages/@n8n/config/src/configs/personalization.config.ts.bak"

	sed -i.bak 's/enabled: boolean = true;/enabled: boolean = false;/' \
		"$ROOT/packages/@n8n/config/src/configs/dynamic-banners.config.ts"
	rm -f "$ROOT/packages/@n8n/config/src/configs/dynamic-banners.config.ts.bak"

	# Hide Usage & Plan page by default
	sed -i.bak 's/hideUsagePage: boolean = false;/hideUsagePage: boolean = true;/' \
		"$ROOT/packages/@n8n/config/src/index.ts"
	rm -f "$ROOT/packages/@n8n/config/src/index.ts.bak"
}

patch_index_html() {
	local file="$ROOT/packages/frontend/editor-ui/index.html"
	if grep -q 'posthog.init.js' "$file"; then
		sed -i.bak '/posthog\.init\.js/d' "$file"
		rm -f "${file}.bak"
	fi
}

write_env_example() {
	cat >"$ROOT/.env.self-host.example" <<'EOF'
# Optional overrides for self-host patched builds.
# Defaults are already baked into config after running scripts/self-host/apply.sh

N8N_DIAGNOSTICS_ENABLED=false
N8N_VERSION_NOTIFICATIONS_ENABLED=false
N8N_PERSONALIZATION_ENABLED=false
N8N_DYNAMIC_BANNERS_ENABLED=false
N8N_HIDE_USAGE_PAGE=true

# Do not contact the license server
N8N_LICENSE_ACTIVATION_KEY=
N8N_LICENSE_AUTO_RENEW_ENABLED=false

# Typical production settings
N8N_HOST=localhost
N8N_PORT=5678
N8N_PROTOCOL=http
GENERIC_TIMEZONE=Europe/Berlin
EOF
}

apply_patches() {
	if is_applied; then
		echo "Self-host patches already applied. Use --restore first to re-apply."
		exit 0
	fi

	echo "Backing up files to $BACKUP_DIR ..."
	for rel in "${TRACKED_FILES[@]}"; do
		backup_file "$rel"
	done

	echo "Applying license stub ..."
	cp "$PATCH_DIR/license.ts" "$ROOT/packages/cli/src/license.ts"

	echo "Applying PostHog stub ..."
	cp "$PATCH_DIR/posthog-index.ts" "$ROOT/packages/cli/src/posthog/index.ts"

	echo "Patching initLicense() ..."
	patch_init_license

	echo "Patching config defaults (telemetry off) ..."
	patch_config_defaults

	echo "Removing PostHog script from editor UI ..."
	patch_index_html

	write_env_example

	echo ""
	echo "Done. Self-host patches applied."
	echo ""
	echo "Next steps:"
	echo "  1. pnpm build:docker          # build Docker image (n8nio/n8n:local)"
	echo "     — or —"
	echo "     pnpm build && pnpm dev     # local development"
	echo ""
	echo "  2. docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n:local"
	echo ""
	echo "Restore originals: ./scripts/self-host/apply.sh --restore"
}

restore_patches() {
	if [[ ! -d "$BACKUP_DIR" ]]; then
		echo "No backup found at $BACKUP_DIR"
		exit 1
	fi

	echo "Restoring files from $BACKUP_DIR ..."
	for rel in "${TRACKED_FILES[@]}"; do
		restore_file "$rel"
	done

	echo "Restore complete."
}

show_status() {
	if is_applied; then
		echo "Status: PATCHED (self-host mode)"
	else
		echo "Status: ORIGINAL (upstream defaults)"
	fi
	if [[ -d "$BACKUP_DIR" ]]; then
		echo "Backup: $BACKUP_DIR"
	else
		echo "Backup: none"
	fi
}

cd "$ROOT"

case "${1:-}" in
	--restore)
		restore_patches
		;;
	--status)
		show_status
		;;
	--help|-h)
		sed -n '2,14p' "$0"
		;;
	"")
		apply_patches
		;;
	*)
		echo "Unknown option: $1" >&2
		echo "Use --restore, --status, or --help" >&2
		exit 1
		;;
esac
