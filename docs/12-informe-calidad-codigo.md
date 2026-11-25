# 12 · Informe de calidad de código

## 1. ESLint

Configuración compartida en `eslint.base.mjs` (ESLint 9 *flat config* + `typescript-eslint` con reglas que usan información de tipos + `eslint-plugin-sonarjs` + `eslint-config-prettier`). Cada paquete la importa desde su `eslint.config.mjs`; el frontend añade `eslint-plugin-react-hooks`.

| Objetivo del enunciado | Reglas |
|---|---|
| Variables no utilizadas | `@typescript-eslint/no-unused-vars` (error) |
| Tipos inseguros | `no-explicit-any`, `no-unsafe-assignment/-member-access/-call/-return/-argument` (error) |
| Manejo incorrecto de promesas | `no-floating-promises`, `no-misused-promises`, `await-thenable`, `require-await` (error) |
| Errores potenciales | `eqeqeq`, `no-param-reassign`, `no-return-assign`, `no-duplicate-imports`, `no-base-to-string`, `no-unsafe-enum-comparison` |
| Código duplicado (cuando es detectable) | `sonarjs/no-identical-functions`, `sonarjs/no-all-duplicated-branches`, `sonarjs/no-identical-conditions`, `sonarjs/no-duplicate-string` |
| Complejidad | `sonarjs/cognitive-complexity` (umbral 15) |
| Formato | Prettier (`npm run format:check` en CI) |

Los scripts `lint` usan `--max-warnings=0`: una advertencia también hace fallar CI.

**Desactivaciones de reglas** (todas justificadas en línea, ninguna para ocultar errores):
- `no-control-regex` en 2 expresiones que eliminan explícitamente caracteres de control (`file-signature.ts`, `templates.ts`).
- `react-hooks/exhaustive-deps` en el *hook* genérico `useAsync`, cuyas dependencias define quien lo llama.
- En archivos de prueba: `sonarjs/no-duplicate-string` y `unbound-method` (aserciones sobre *mocks*).

**Resultado** (`npm run lint` en la raíz, 25-11-2026): **0 errores, 0 advertencias** en los 8 paquetes. Durante el desarrollo ESLint detectó y obligó a corregir, entre otros: promesas sin manejar en la navegación del frontend, conversión insegura de `FormData` a texto (21 casos), comparación entre un enum y un string, aserciones de tipo innecesarias e imports sin uso.

## 2. TypeScript

`strict: true`, `noImplicitAny`, `noImplicitReturns`, `useUnknownInCatchVariables`, `noFallthroughCasesInSwitch`; en el frontend además `noUnusedLocals/Parameters`. `npm run typecheck`: **0 errores**.

## 3. Pruebas y cobertura

Ver `11-estrategia-pruebas.md`: 278 unitarias, 96 de integración, 21 pasos E2E, todas aprobadas. Cobertura unitaria por paquete 28.6–73.3 % de líneas; de integración 75.1–95.4 %.

## 4. SonarQube

### Configuración
- `sonar-project.properties`: fuentes de los 8 paquetes, pruebas, exclusiones (migraciones y DTO fuera de cobertura y de detección de duplicados), informes LCOV unitarios **y** de integración, `sonar.qualitygate.wait=true`.
- CI: job `sonarqube` (se activa si existen `vars.SONAR_HOST_URL` y `secrets.SONAR_TOKEN`); falla si no se supera el Quality Gate.

### Quality Gate propuesto (a configurar en el servidor)

Aplicado sobre **código nuevo** (enfoque *Clean as You Code*, adecuado para un proyecto que evoluciona):

| Condición | Umbral | Justificación |
|---|---|---|
| Nuevos bugs (Reliability Rating) | A | No se aceptan bugs nuevos. |
| Nuevas vulnerabilidades (Security Rating) | A | Plataforma con datos personales (Ley 1581). |
| Security Hotspots revisados | 100 % | Cada hotspot debe ser analizado por una persona. |
| Mantenibilidad (Maintainability Rating) | A | Equipo pequeño (OB-5). |
| Duplicación en código nuevo | ≤ 3 % | Valor por defecto de Sonar; la duplicación existente está registrada (TD-01). |
| Cobertura en código nuevo | `COVERAGE_THRESHOLD` (configurable) | **No se fija el 85 %** hasta confirmar su significado (§5). |

### Resultado de la ejecución

Análisis **ejecutado** el 25-11-2026 con SonarQube Community 25.11 en un contenedor local (`sonarqube:25.11.0.114957-community`) y `sonar-scanner-cli:11`, usando `sonar-project.properties` y los LCOV unitario + integración. Quality Gate `GreenAlert` creado en el servidor con las condiciones de fiabilidad, seguridad y mantenibilidad sobre código nuevo (las condiciones de duplicación y hotspots devolvieron error 400 al crearse por API y quedaron sin configurar: pendiente de hacerlo desde la interfaz).

| Métrica (proyecto completo) | 1.er análisis | 2.º análisis (tras correcciones) |
|---|---:|---:|
| Líneas de código (ncloc) | 8 472 | 8 472 |
| Bugs | 0 | 0 |
| Vulnerabilidades | 0 | 0 |
| Code smells (abiertos) | 98 | **94** |
| Severidad CRITICAL | 4 | **0** |
| Security Hotspots (por revisar) | 20 | 20 |
| Cobertura total / líneas / ramas | 73.5 % / 79.0 % / 59.9 % | igual |
| Duplicación | 15.3 % | 15.3 % |
| Deuda técnica estimada (sqale_index) | 694 min | 674 min |
| Ratings fiabilidad / seguridad / mantenibilidad | A / A / A | A / A / A |
| Rating de revisión de seguridad | E (hotspots sin revisar) | E |
| Quality Gate | PASSED | PASSED |

**Advertencia de interpretación**: el Quality Gate pasó con `conditions: []` porque en un **primer análisis no existe "código nuevo"**; sus condiciones se aplicarán a partir de los análisis siguientes. No debe leerse como una aprobación del código existente.

**Tratamiento de hallazgos**

| Regla | Cant. | Análisis | Acción |
|---|---:|---|---|
| S3735 «void operator» (CRITICAL) | 4 | `void navigate(...)` en el frontend. | **Corregido**: `await navigate(...)` dentro de los manejadores async (también satisface `no-floating-promises`). Verificado en el 2.º análisis. |
| S2699 «tests sin aserciones» (BLOCKER) | 24 | **Falsos positivos**: pruebas de integración cuyo assert es `supertest .expect(status)`, que Sonar no reconoce. | Pendiente: añadir `expect(res.status)` explícito o configurar la regla. No afecta la validez de las pruebas. |
| S6772 / S6759 (JSX, props `readonly`) | 32 | Estilo React. | Pendiente (baja prioridad). |
| S7781, S7785, S7776, S7735… (modernización: `replaceAll`, *top-level await*, etc.) | ~24 | Estilo. | Pendiente (baja prioridad). |
| S1874 `FormEvent` obsoleto (React 19) | 9 | Tipos de `@types/react` 19. | Pendiente. |
| Duplicación 15.3 % | — | **Confirma cuantitativamente TD-01** (código común copiado en 6 servicios) y TD-02. | Refactorización orden 2 del plan. |
| Hotspot S5332 «http inseguro» | 17 | URLs `http://servicio:puerto` de la red interna Docker. Revisión: aceptable en red aislada; en producción se requiere TLS/mTLS (`13-seguridad.md` §6). | Analizado; **pendiente de marcar como revisado por una persona responsable**. |
| Hotspot S5759 «reenvío de IP del cliente» | 1 | `xfwd` del proxy; los servicios no toman decisiones con esa IP; el *rate limit* usa `trust proxy` configurado. | Analizado; pendiente de revisión humana. |
| Hotspot S5852 «regex super-lineal» | 1 | `/<[^>]*>/g` en plantillas: es lineal (clase negada sin solapamiento); además el texto se limita a 200–1000 caracteres. | Analizado; pendiente de revisión humana. |
| Hotspot S5604 «uso de geolocalización» | 1 | Necesario por requisito (RF-61); se solicita solo al pulsar "Usar mi ubicación". | Analizado; pendiente de revisión humana. |

Los hotspots no se marcaron como revisados en el servidor: esa revisión debe registrarla una persona del equipo.

## 5. Sobre el criterio del 85 %

El docente mencionó un 85 % relacionado con la evaluación del sistema y la posibilidad de cambiar un servicio cuando no se cumple un criterio. **Su significado no está confirmado**, por lo que:

- No se configuró como exigencia en ningún lado. `COVERAGE_THRESHOLD` vale `0` por defecto (Jest y CI) y el umbral de cobertura del Quality Gate es un parámetro.
- **Si el 85 % es cobertura de pruebas**: hoy lo superarían por líneas, en integración, gateway, users, reports, multimedia, geolocation y notifications (88–95 %); no lo superan ai (75.1 %) ni ninguna medición de ramas, ni las unitarias. Para alcanzarlo en el servicio `ai` habría que probar el adaptador HTTP en integración y los caminos de error del clasificador. Activación: `COVERAGE_THRESHOLD=85` (por paquete) o la condición del Quality Gate.
- **Si es disponibilidad o tasa de éxito de escenarios**: se puede medir con el E2E (`--failures`), que hoy aprueba 21/21 escenarios; para un indicador de disponibilidad continuo hace falta la monitorización de TD-12.
- **Si es una calificación de calidad (p. ej. ratio de escenarios ATAM/SAAM satisfechos)**: en SAAM, 4 de 11 escenarios se resuelven con dificultad baja y 2 requieren 4 componentes; las refactorizaciones 3 y 4 del plan atacan exactamente ese punto.

**Cómo mejorar la métrica modificando un servicio o una decisión**: el registro de deuda y el plan de refactorización relacionan cada métrica con una acción concreta (p. ej. catálogo único → SAAM S-01/S-05; pruebas de middleware → cobertura unitaria del gateway; TypeORM 1.x → 0 vulnerabilidades). Cuando se confirme el criterio, se ajustará la configuración correspondiente y se registrará en este documento.
