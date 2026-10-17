#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
APP_HOST="team4c1-mobility.test"
APP_URL="http://$APP_HOST"
BACKEND_LOG="${TMPDIR:-/tmp}/team4c1-mobility-backend.log"
FRONTEND_LOG="${TMPDIR:-/tmp}/team4c1-mobility-frontend.log"

fail() {
    printf 'Error: %s\n' "$1" >&2
    exit 1
}

port_open() {
    (echo > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

[[ "$(uname -s)" == "Linux" ]] || fail "This launcher is for Linux (Ubuntu 24)."
command -v sudo >/dev/null || fail "sudo is required to install packages, map the local hostname and configure nginx."

if [[ ! -f "$BACKEND_DIR/config.env" ]]; then
    fail "Create backend/config.env with the Aiven DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, and DB_SSL=true values. Do not commit this file."
fi

for key in DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME; do
    grep -Eq "^[[:space:]]*${key}=.+$" "$BACKEND_DIR/config.env" || fail "backend/config.env is missing $key."
done
grep -Eqi '^[[:space:]]*DB_SSL=true[[:space:]]*$' "$BACKEND_DIR/config.env" || fail "Set DB_SSL=true in backend/config.env for the Aiven connection."

sudo -v

missing_pkgs=()
command -v node >/dev/null || missing_pkgs+=(nodejs)
command -v npm >/dev/null || missing_pkgs+=(npm)
command -v nginx >/dev/null || [[ -x /usr/sbin/nginx ]] || missing_pkgs+=(nginx)
if (( ${#missing_pkgs[@]} )); then
    printf 'Installing missing packages (%s), this may take a minute...\n' "${missing_pkgs[*]}"
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing_pkgs[@]}"
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= 18 )) || fail "Node.js $node_major found; Node.js 18 or newer is required."

if ! getent hosts "$APP_HOST" | awk '$1 == "127.0.0.1" {found=1} END {exit !found}'; then
    if getent hosts "$APP_HOST" >/dev/null; then
        fail "$APP_HOST already resolves to a non-loopback address; update /etc/hosts before continuing."
    fi
    printf '127.0.0.1 %s\n' "$APP_HOST" | sudo tee -a /etc/hosts >/dev/null
fi

if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
    printf 'Installing backend dependencies...\n'
    (cd "$BACKEND_DIR" && npm ci --no-audit --no-fund)
fi

if ! port_open 3000; then
    printf 'Starting backend with npm start (connecting to Aiven, this can take up to 45s)...\n'
    (
        cd "$BACKEND_DIR"
        nohup npm start >"$BACKEND_LOG" 2>&1 </dev/null &
    )
    for attempt in {1..45}; do
        port_open 3000 && break
        printf '  Waiting for backend on port 3000... (%ss)\n' "$attempt"
        sleep 1
    done
    if ! port_open 3000; then
        printf 'Backend did not start. Recent log output:\n' >&2
        tail -n 40 "$BACKEND_LOG" >&2 || true
        fail "Check the Aiven credentials, network access, and backend/config.env."
    fi
else
    printf 'Backend is already listening on port 3000.\n'
fi

WEB_ROOT="/var/www/team4c1-mobility"
NGINX_CONF="/etc/nginx/conf.d/team4c1-mobility.conf"

printf 'Configuring nginx for %s...\n' "$APP_HOST"
# Copied so the nginx user can read it regardless of home/project directory permissions.
sudo mkdir -p "$WEB_ROOT"
sudo cp -r "$PROJECT_ROOT/frontend/." "$WEB_ROOT/"
sudo tee "$NGINX_CONF" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $APP_HOST;
    root $WEB_ROOT;
    index index.html;
    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
sudo nginx -t >"$FRONTEND_LOG" 2>&1 || { cat "$FRONTEND_LOG" >&2; fail "nginx configuration test failed."; }
sudo systemctl enable nginx >/dev/null 2>&1 || true
if ! sudo systemctl reload nginx 2>>"$FRONTEND_LOG"; then
    sudo systemctl restart nginx >>"$FRONTEND_LOG" 2>&1 || { tail -n 30 "$FRONTEND_LOG" >&2; fail "nginx could not start; port 80 may be used by another application."; }
fi
for attempt in {1..15}; do
    port_open 80 && break
    printf '  Waiting for nginx on port 80... (%ss)\n' "$attempt"
    sleep 1
done
port_open 80 || fail "nginx is not listening on port 80."

printf 'Opening %s in your browser...\n' "$APP_URL"
if command -v firefox >/dev/null; then
    firefox --new-tab "$APP_URL" >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null; then
    google-chrome --new-tab "$APP_URL" >/dev/null 2>&1 &
elif command -v chromium >/dev/null; then
    chromium --new-tab "$APP_URL" >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null; then
    xdg-open "$APP_URL" >/dev/null 2>&1 &
else
    printf 'No browser launcher found. Open %s manually.\n' "$APP_URL"
fi

printf 'App URL: %s\nBackend log: %s\nFrontend log: %s\n' "$APP_URL" "$BACKEND_LOG" "$FRONTEND_LOG"