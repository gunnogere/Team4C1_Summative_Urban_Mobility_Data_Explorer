#!/usr/bin/env bash
# Install MySQL if missing, create DB/user from backend/config.env, apply schema.sql.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$ROOT/backend/config.env"
SCHEMA="$ROOT/database/schema.sql"

[[ -f "$CONFIG" ]] || { echo "Missing $CONFIG" >&2; exit 1; }
[[ -f "$SCHEMA" ]] || { echo "Missing $SCHEMA" >&2; exit 1; }

set -a; source "$CONFIG"; set +a
: "${DB_HOST:=localhost}" "${DB_PORT:=3306}" "${DB_USER:?}" "${DB_PASSWORD:?}" "${DB_NAME:?}" "${PORT:=3000}"

[[ $EUID -eq 0 ]] && SUDO="" || SUDO="sudo"

# 1. Install MySQL if needed
if command -v mysqld >/dev/null || command -v mariadbd >/dev/null; then
  echo "MySQL server already installed"
else
  echo "Installing MySQL server..."
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
    echo "No supported package manager found; install MySQL manually." >&2
    exit 1
  fi
fi

# 2. Start service
if [[ "$(uname)" == "Darwin" ]]; then
  brew services start mysql
else
  for svc in mysql mysqld mariadb; do
    if systemctl cat "$svc.service" >/dev/null 2>&1; then
      $SUDO systemctl enable --now "$svc"
      break
    fi
  done
fi
for i in {1..30}; do
  $SUDO mysqladmin ping --silent >/dev/null 2>&1 && break
  [[ $i -eq 30 ]] && { echo "MySQL did not become ready." >&2; exit 1; }
  sleep 1
done

# 3. Create app user and database (admin via local socket)
PASS_ESC=${DB_PASSWORD//\\/\\\\}
PASS_ESC=${PASS_ESC//\'/\\\'}
$SUDO mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;
CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$PASS_ESC';
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$PASS_ESC';
ALTER USER '$DB_USER'@'%' IDENTIFIED BY '$PASS_ESC';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$PASS_ESC';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

db() { MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$@"; }

# 4. Schema
echo "Applying schema.sql..."
db < "$SCHEMA"
echo "Done: MySQL installed, database '$DB_NAME' and tables created."
