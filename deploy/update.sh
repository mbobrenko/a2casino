#!/bin/sh
# Pulls the latest main from GitHub and rebuilds only when it changed.
# Run every few minutes by a systemd timer (see cloud-init.yaml).
set -eu
cd /opt/a2casino
git fetch -q origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && [ "${1:-}" != "--force" ]; then
	exit 0
fi
git reset -q --hard origin/main
docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d --build --remove-orphans
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD)"
