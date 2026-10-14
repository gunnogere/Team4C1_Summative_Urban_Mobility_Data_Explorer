-- Active: 1791997081933@@127.0.0.1@3306@urban_mobility
#!/usr/bin/env bash
# Interactive MySQL provisioning: install server, create app user, apply database/schema.sql,
# install ETL dependencies, write .env, and load the cleaned JSON data.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA="$SCRIPT_DIR/database/schema.sql"
ENV_FILE="$SCRIPT_DIR/.env"
DB_NAME="urban_mobility" # must match CREATE DATABASE in schema.sql
ETL_DIR="$SCRIPT_DIR/etl_pipeline"

if [[ -t 1 ]]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'; else B=; G=; Y=; R=; N=; fi
info() { echo "${B}==>${N} $*"; }
ok()   { echo "${G}[ok]${N} $*"; }
warn() { echo "${Y}[warn]${N} $*"; }
die()  { echo "${R}[error]${N} $*" >&2; exit 1; }

confirm() { # confirm "question" [default y|n]
  local def="${2:-y}" hint ans
  [[ $def == y ]] && hint="[Y/n]" || hint="[y/N]"
  read -r -p "$1 $hint " ans || true
  ans="${ans:-$def}"
  [[ $ans =~ ^[Yy] ]]
}

ask() { # ask "prompt" default -> echoes answer
  local ans
  read -r -p "$1 [$2]: " ans || true
  echo "${ans:-$2}"
}

ask_secret() { # ask_secret "prompt"
  local ans
  read -r -s -p "$1: " ans || true
  echo >&2
  echo "$ans"
}

[[ -f "$SCHEMA" ]] || die "Schema not found: $SCHEMA"
[[ -f "$ETL_DIR/package.json" ]] || die "ETL package manifest not found: $ETL_DIR/package.json"
command -v node >/dev/null || die "Node.js is required to load data. Install Node.js 18 or newer and re-run."
command -v npm >/dev/null || die "npm is required to install ETL dependencies. Install npm and re-run."
NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
(( NODE_MAJOR >= 18 )) || die "Node.js 18 or newer is required (found $(node --version))."
[[ $EUID -eq 0 ]] && SUDO="" || SUDO="sudo"

# ---------- 1. install ----------
install_mysql() {
  if command -v apt-get >/dev/null; then
    $SUDO apt-get update
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server mysql-client
  elif command -v dnf >/dev/null; then
    $SUDO dnf install -y mysql-server
  elif command -v yum >/dev/null; then
    $SUDO yum install -y mysql-server
  elif command -v pacman >/dev/null; then
    $SUDO pacman -S --noconfirm mariadb
    $SUDO mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql
  elif command -v brew >/dev/null; then
    brew install mysql
  else
    die "No supported package manager found (apt, dnf, yum, pacman, brew). Install MySQL manually."
  fi
}

info "Checking for MySQL"
if command -v mysql >/dev/null && command -v mysqld >/dev/null; then
  ok "MySQL already installed: $(mysql --version)"
else
  warn "MySQL not found."
  confirm "Install MySQL server now? (requires sudo)" y || die "MySQL is required. Aborting."
  install_mysql
  ok "MySQL installed"
fi

# ---------- 2. start service ----------
start_service() {
  if command -v brew >/dev/null && [[ "$(uname)" == "Darwin" ]]; then
    brew services start mysql
    return
  fi
  local svc
  for svc in mysql mysqld mariadb; do
    if systemctl cat "$svc.service" >/dev/null 2>&1; then
      $SUDO systemctl enable --now "$svc"
      return
    fi
  done
  die "Could not find a MySQL service to start. Start it manually and re-run."
}

info "Ensuring MySQL service is running"
start_service
for i in {1..30}; do
  if $SUDO mysqladmin ping --silent 2>/dev/null || mysqladmin ping --silent 2>/dev/null; then break; fi
  [[ $i -eq 30 ]] && die "MySQL did not become ready in time."
  sleep 1
done
ok "MySQL is running"

# ---------- 3. admin access ----------
HOST=$(ask "MySQL host" "localhost")
PORT=$(ask "MySQL port" "3306")

ADMIN_MODE=""
admin() { # run mysql as admin; reads SQL from stdin
  case "$ADMIN_MODE" in
    socket) $SUDO mysql "$@" ;;
    password) MYSQL_PWD="$ADMIN_PASS" mysql -h "$HOST" -P "$PORT" -u "$ADMIN_USER" "$@" ;;
  esac
}

info "Connecting as an admin user"
if [[ "$HOST" == "localhost" || "$HOST" == "127.0.0.1" ]] && $SUDO mysql -e "SELECT 1" >/dev/null 2>&1; then
  ADMIN_MODE=socket
  ok "Connected via local socket (sudo mysql)"
else
  ADMIN_USER=$(ask "Admin username" "root")
  ADMIN_PASS=$(ask_secret "Admin password")
  ADMIN_MODE=password
  admin -e "SELECT 1" >/dev/null 2>&1 || die "Admin login failed."
  ok "Connected as $ADMIN_USER"
fi

# ---------- 4. app user ----------
APP_USER=$(ask "Application DB user to create" "urban_app")
[[ $APP_USER =~ ^[A-Za-z0-9_]+$ ]] || die "Username may only contain letters, digits and underscore."
while :; do
  APP_PASS=$(ask_secret "Password for $APP_USER")
  [[ -n "$APP_PASS" ]] || { warn "Password cannot be empty."; continue; }
  CONFIRM=$(ask_secret "Confirm password")
  [[ "$APP_PASS" == "$CONFIRM" ]] && break
  warn "Passwords do not match."
done
APP_PASS_ESC=${APP_PASS//\\/\\\\}
APP_PASS_ESC=${APP_PASS_ESC//\'/\\\'}

# ---------- 5. schema ----------
info "Applying $SCHEMA"
admin < "$SCHEMA"
ok "Database ensured and tables recreated"

admin -e "CREATE USER IF NOT EXISTS '$APP_USER'@'%' IDENTIFIED BY '$APP_PASS_ESC';
          ALTER USER '$APP_USER'@'%' IDENTIFIED BY '$APP_PASS_ESC';
          GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$APP_USER'@'%';
          FLUSH PRIVILEGES;"
ok "User '$APP_USER' granted access to $DB_NAME"

# ---------- 6. verify + .env ----------
info "Tables created:"
MYSQL_PWD="$APP_PASS" mysql -h "$HOST" -P "$PORT" -u "$APP_USER" "$DB_NAME" -e "SHOW TABLES" \
  || die "Could not log in as $APP_USER."

umask 077
cat > "$ENV_FILE" <<EOF
DB_HOST=$HOST
DB_PORT=$PORT
DB_USER=$APP_USER
DB_PASSWORD=$APP_PASS
DB_NAME=$DB_NAME
EOF
ok "Credentials saved to $ENV_FILE (mode 600, do not commit)"

# ---------- 7. install ETL dependencies and load data ----------
info "Installing ETL dependencies"
npm --prefix "$ETL_DIR" install
ok "ETL dependencies installed"

info "Loading cleaned JSON data into MySQL"
npm --prefix "$ETL_DIR" run load
ok "Data load finished"

echo
ok "Database setup and data load complete"

# ---------- 8. backend setup and run ----------
BACKEND_DIR="$SCRIPT_DIR/backend"
BACKEND_ENV="$BACKEND_DIR/config.env" # server.js loads this file
[[ -f "$BACKEND_DIR/server.js" ]] || die "Backend not found: $BACKEND_DIR/server.js"

info "Writing backend config"
cat > "$BACKEND_ENV" <<EOF
DB_HOST=$HOST
DB_PORT=$PORT
DB_USER=$APP_USER
DB_PASSWORD=$APP_PASS
DB_NAME=$DB_NAME
PORT=3000
EOF
ok "Backend config saved to $BACKEND_ENV (mode 600, do not commit)"

info "Installing backend dependencies"
npm --prefix "$BACKEND_DIR" install
ok "Backend dependencies installed"

# Optional Python loader (load.py), if the repo provides one
LOAD_PY=$(find "$SCRIPT_DIR" -name load.py -not -path '*/node_modules/*' -print -quit)
if [[ -n "$LOAD_PY" ]]; then
  command -v python3 >/dev/null || die "python3 is required to run $LOAD_PY"
  info "Running $LOAD_PY"
  (cd "$(dirname "$LOAD_PY")" && python3 load.py)
  ok "load.py finished"
fi

start_backend_terminal() { # open a new terminal window running the server
  local cmd="cd '$BACKEND_DIR' && node server.js; exec bash"
  if [[ "$(uname)" == "Darwin" ]] && command -v osascript >/dev/null; then
    osascript -e "tell application \"Terminal\" to do script \"cd '$BACKEND_DIR' && node server.js\"" >/dev/null
  elif command -v gnome-terminal >/dev/null && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    gnome-terminal -- bash -c "$cmd"
  elif command -v konsole >/dev/null && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    konsole -e bash -c "$cmd" &
  elif command -v xterm >/dev/null && [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    xterm -e bash -c "$cmd" &
  else
    return 1
  fi
}

if confirm "Start the backend server (node server.js) in a new terminal now?" y; then
  if start_backend_terminal; then
    ok "Backend started in a new terminal (http://localhost:3000)"
  else
    warn "No terminal emulator found; running the server in this terminal (Ctrl+C to stop)."
    cd "$BACKEND_DIR" && exec node server.js
  fi
else
  echo "Start it later with: cd backend && node server.js"
fi

ok "Full app setup complete"
