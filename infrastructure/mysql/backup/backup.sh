#!/bin/bash
# Respaldo lógico por servicio (cada base por separado, coherente con Database per Service).
# Uso: docker compose exec mysql /backup/backup.sh   → archivos en el volumen mysql-backups
# Restauración: gunzip < archivo.sql.gz | docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <base>
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT=/backups/${STAMP}
mkdir -p "$OUT"
for db in greenalert_users greenalert_reports greenalert_multimedia greenalert_geolocation greenalert_ai greenalert_notifications; do
  mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" --single-transaction --routines --triggers --set-gtid-purged=OFF "$db" | gzip > "$OUT/${db}.sql.gz"
  echo "Respaldo: $OUT/${db}.sql.gz"
done
# Retención: conserva los últimos 14 respaldos
ls -1dt /backups/*/ 2>/dev/null | tail -n +15 | xargs -r rm -rf
