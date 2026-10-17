#!/usr/bin/env bash
# Import database/database_dump.sql into the online MySQL database.
# Targets the online server (172.17.0.9) by default; override DB_HOST to change.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUMP="${DUMP:-$ROOT/database/database_dump.sql}"

DB_HOST="${DB_HOST:-mysql-36b59c3a-summative.g.aivencloud.com}"
DB_PORT="${DB_PORT:-14686}"
DB_USER="${DB_USER:-urban_app}"
DB_PASSWORD="${DB_PASSWORD:-AVNS_7ZcY565WYbK7uXc4n4m}"
DB_NAME="${DB_NAME:-urban_mobility}"

[[ -f "$DUMP" ]] || { echo "Dump not found: $DUMP" >&2; exit 1; }
command -v mysql >/dev/null || { echo "mysql client is required." >&2; exit 1; }

export MYSQL_PWD="$DB_PASSWORD"
MYSQL=(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --max_allowed_packet=512M)

"${MYSQL[@]}" -e "SELECT 1" >/dev/null || { echo "Cannot connect to $DB_HOST:$DB_PORT as $DB_USER." >&2; exit 1; }
"${MYSQL[@]}" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`"

# MariaDB-only collations are unknown to MySQL.
fix_dump() { LC_ALL=C sed -E 's/utf8mb4_uca1400_[a-z0-9_]+/utf8mb4_0900_ai_ci/g; s/utf8mb3_uca1400_[a-z0-9_]+/utf8mb3_general_ci/g' "$DUMP"; }

echo "Importing $DUMP into $DB_NAME@$DB_HOST:$DB_PORT ..."
if command -v pv >/dev/null; then
  fix_dump | pv -s "$(stat -c %s "$DUMP")" | "${MYSQL[@]}" "$DB_NAME"
else
  fix_dump | "${MYSQL[@]}" "$DB_NAME"
fi

echo "Import complete. Tables:"
"${MYSQL[@]}" "$DB_NAME" -e "SHOW TABLES"
