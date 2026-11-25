#!/bin/bash
# Database per Service: una base de datos y un usuario MySQL por microservicio.
# Cada usuario solo tiene privilegios sobre SU base: un servicio no puede leer tablas de otro.
# Las contraseñas llegan por variables de entorno (nunca se escriben en el repositorio).
set -euo pipefail

create_db() {
  local db="$1" user="$2" pass="$3"
  if [ -z "$pass" ]; then
    echo "ERROR: contraseña vacía para $user" >&2
    exit 1
  fi
  mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY '${pass}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON \`${db}\`.* TO '${user}'@'%';
SQL
  echo "Base ${db} lista para ${user}"
}

create_db greenalert_users          ga_users          "${USERS_DB_PASSWORD}"
create_db greenalert_reports        ga_reports        "${REPORTS_DB_PASSWORD}"
create_db greenalert_multimedia     ga_multimedia     "${MULTIMEDIA_DB_PASSWORD}"
create_db greenalert_geolocation    ga_geolocation    "${GEOLOCATION_DB_PASSWORD}"
create_db greenalert_ai             ga_ai             "${AI_DB_PASSWORD}"
create_db greenalert_notifications  ga_notifications  "${NOTIFICATIONS_DB_PASSWORD}"

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "FLUSH PRIVILEGES;"
