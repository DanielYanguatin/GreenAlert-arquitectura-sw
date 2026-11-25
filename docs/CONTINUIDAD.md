# Documento de continuidad

Última actualización: 25-11-2026. Indica exactamente en qué estado quedó el trabajo y cómo retomarlo.

## Estado por fase

| Fase | Estado | Evidencia / pendiente |
|---|---|---|
| 1 · Diseño y planificación | ✅ Terminada | docs 01-04, 10, 17 |
| 2 · Configuración inicial | ✅ Terminada | workspaces npm, `tsconfig.base.json`, `eslint.base.mjs`, Jest, Dockerfiles |
| 3 · Backend (6 servicios) | ✅ Terminada | Cada servicio compila, lint limpio, unitarias e integración en verde |
| 4 · Integración (gateway) | ✅ Terminada | 18 pruebas de integración del gateway; E2E 21/21 |
| 5 · Frontend | ✅ Funcional | Build, lint, 17 pruebas. **Pendiente**: revisión visual en navegador real por una persona (no se ejecutó con un navegador automatizado) y pruebas por página (TD-05) |
| 6 · Calidad y seguridad | 🟡 Casi completa | ESLint, Jest, `npm audit` (alta corregida), SonarQube ejecutado localmente (0 bugs, 0 vulnerabilidades). **Pendiente**: revisión humana de 20 hotspots y code smells de estilo |
| 7 · Evaluación arquitectónica | ✅ Terminada | ATAM, SAAM, árbol de utilidad, riesgos, deuda y refactorización sobre la implementación real |
| 8 · Despliegue | 🟡 Local verificado | Docker Compose verificado. Producción: requisitos pendientes en `14-despliegue.md` §3 |

## Pendientes inmediatos (en orden)

1. **Control de versiones**: el repositorio Git está inicializado (`main`) pero **sin commits**: la configuración global exige firma GPG y el agente de firma pidió el PIN de forma interactiva. Ejecutar manualmente:
   ```bash
   git add -A
   git commit -m "feat: GreenAlert v0.1.0 — microservicios, gateway, frontend, pruebas y documentación"
   git remote add origin <url> && git push -u origin main
   ```
2. Configurar en GitHub: protección de la rama `main` con los checks `quality`, `integration`, `security`, `docker`; variables `COVERAGE_THRESHOLD`, `SONAR_HOST_URL` y secreto `SONAR_TOKEN`. Verificar la primera ejecución del pipeline.
3. Confirmar con el docente el significado del **85 %** y ajustar `COVERAGE_THRESHOLD` o el Quality Gate (ver `12-informe-calidad-codigo.md` §5).
4. Refactorizaciones priorizadas: `07-plan-refactorizacion.md` Parte B.

## Cómo retomar

```bash
npm install
docker run -d --name greenalert-mysql-test -e MYSQL_ROOT_PASSWORD=test-root-password -p 3307:3306 mysql:8.4
npm run typecheck && npm run lint && npm run build && npm test && npm run test:integration
docker compose up -d && node tests/e2e/smoke.mjs --failures
```

## Entorno local usado

- Windows 11, Docker Desktop (Engine 28.5), Node 22.15, npm 10.9.
- Contenedor de pruebas `greenalert-mysql-test` (MySQL 8.4, puerto 3307).
- SonarQube local en el contenedor `greenalert-sonarqube` (http://localhost:9000); la contraseña de admin generada está en `/tmp/sonar-admin.txt` del entorno de Git Bash (cámbiela al usarlo).
- El archivo `.env` local se generó con secretos aleatorios (no versionado).
