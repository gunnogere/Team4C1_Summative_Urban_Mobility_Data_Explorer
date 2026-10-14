#!/usr/bin/env bash
# Interactive MySQL provisioning: install server, create app user, apply database/schema.sql, write .env.
set -euo pipefail
 
 
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA="$SCRIPT_DIR/../database/schema.sql"
ENV_FILE="$SCRIPT_DIR/.env"
DB_NAME="urban_mobility" # must match CREATE DATABASE in schema.sql

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
    if systemctl list-unit-files 2>/dev/null | grep -q "^$svc.service"; then
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
EXISTS=$(admin -N -B -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$DB_NAME'")
if [[ "$EXISTS" != "0" ]]; then
  warn "Database '$DB_NAME' already exists."
  if confirm "Drop and recreate it? ALL EXISTING DATA WILL BE LOST" n; then
    admin -e "DROP DATABASE \`$DB_NAME\`"
    ok "Dropped $DB_NAME"
  else
    die "Aborted; existing database left untouched."
  fi
fi

info "Applying $SCHEMA"
admin < "$SCHEMA"
ok "Schema applied"

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

echo
ok "Done. Next: cd etl_pipeline && npm install && npm run load"

