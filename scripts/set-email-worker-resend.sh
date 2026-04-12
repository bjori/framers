#!/usr/bin/env bash
# Sets RESEND_API_KEY on framers-email-router (inbound list-reply forwarding).
# Cloudflare never exposes existing secret values — use the same key as
# greenbrook-framers from https://resend.com/api-keys
#
# Usage (recommended — key never hits shell history as a literal):
#   pbpaste | ./scripts/set-email-worker-resend.sh
#
# Or:
#   ./scripts/set-email-worker-resend.sh </path/to/file-containing-one-line-key>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/email-worker"
if [ -t 0 ]; then
  echo "Paste your Resend API key (re_...), then press Ctrl-D:" >&2
fi
KEY="$(cat | tr -d '\r\n')"
if [ -z "$KEY" ]; then
  echo "Error: empty key" >&2
  exit 1
fi
printf '%s' "$KEY" | npx wrangler secret put RESEND_API_KEY
echo "OK — verify with: cd email-worker && npx wrangler secret list" >&2
