#!/usr/bin/env node
/**
 * Prueba extremo a extremo de GreenAlert sobre el entorno Docker Compose en ejecución.
 *
 *   node tests/e2e/smoke.mjs              # flujo funcional completo
 *   node tests/e2e/smoke.mjs --failures   # además: escenarios de fallo y recuperación (detiene contenedores)
 *
 * Variables: BASE_URL (por defecto http://localhost:8080, a través de Nginx), MAILPIT_URL, y las
 * credenciales ADMIN_EMAIL / ADMIN_PASSWORD leídas de .env. Los datos que crea son DATOS DE PRUEBA
 * (correos @e2e.test) y se identifican con el prefijo "[E2E]" en el título.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const withFailures = process.argv.includes('--failures');
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, { token, body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api${path}`, { method, headers: h, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail });
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - started, detail: e.message });
    console.log(`  ✘ ${name} — ${e.message}`);
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

async function waitFor(check, timeoutMs, label) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error(`tiempo agotado esperando: ${label}`);
    await sleep(2000);
  }
}

const compose = (args) => execSync(`docker compose ${args}`, { stdio: 'pipe' }).toString();
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(512, 0x90)]);
const MOCOA = { latitude: 1.1491, longitude: -76.6463 };
const stamp = Date.now();
const citizen = { email: `ciudadano.${stamp}@e2e.test`, password: 'Clave1234E2e', fullName: 'Ciudadana de Prueba E2E' };
let citizenToken = '';
let adminToken = '';
let reportId = '';

console.log(`GreenAlert · prueba E2E contra ${BASE}\n`);
console.log('Flujo funcional');

await step('Salud agregada: todos los servicios arriba', async () => {
  const r = await call('GET', '/health');
  expect(r.status === 200 && r.body.status === 'ok', `estado ${JSON.stringify(r.body)}`);
  return Object.entries(r.body.services).map(([k, v]) => `${k}:${v}`).join(' ');
});

await step('Registro de ciudadano (contraseña cifrada, rol CIUDADANO)', async () => {
  const r = await call('POST', '/auth/register', { body: citizen });
  expect(r.status === 201 && r.body.role === 'CIUDADANO' && !('passwordHash' in r.body), `HTTP ${r.status}`);
});

await step('Inicio de sesión del ciudadano y del administrador', async () => {
  const a = await call('POST', '/auth/login', { body: { email: citizen.email, password: citizen.password } });
  const b = await call('POST', '/auth/login', { body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  expect(a.status === 200 && b.status === 200, `HTTP ${a.status}/${b.status}`);
  citizenToken = a.body.accessToken;
  adminToken = b.body.accessToken;
});

await step('Ruta protegida sin token → 401; cabecera x-user-role falsificada no otorga privilegios', async () => {
  const a = await call('GET', '/reports/mine');
  const b = await call('GET', '/reports/stats', { token: citizenToken, headers: { 'x-user-role': 'ADMIN' } });
  expect(a.status === 401 && b.status === 403, `HTTP ${a.status}/${b.status}`);
});

await step('Ruta interna inaccesible desde fuera (/api/internal…) → 404', async () => {
  const r = await call('GET', '/reports/internal/x/access', { token: adminToken });
  expect(r.status === 404, `HTTP ${r.status}`);
});

await step('Crear reporte en Mocoa → 201 con municipio validado', async () => {
  const r = await call('POST', '/reports', {
    token: citizenToken,
    body: { title: `[E2E] Basuras en la quebrada ${stamp}`, description: 'Bolsas de basura y residuos plásticos acumulados en la orilla.', category: 'BASURA', ...MOCOA, address: 'Prueba E2E' },
  });
  expect(r.status === 201 && r.body.locationStatus === 'VALIDATED' && r.body.municipalityName === 'Mocoa', `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  reportId = r.body.id;
});

await step('Reporte fuera de cobertura (Bogotá) → 422', async () => {
  const r = await call('POST', '/reports', {
    token: citizenToken,
    body: { title: '[E2E] Fuera de cobertura', description: 'Prueba de cobertura geográfica', category: 'OTRO', latitude: 4.711, longitude: -74.072 },
  });
  expect(r.status === 422, `HTTP ${r.status}`);
});

await step('Subir fotografía válida (streaming multipart a través de Nginx y gateway)', async () => {
  const form = new FormData();
  form.append('reportId', reportId);
  form.append('files', new Blob([JPEG], { type: 'image/jpeg' }), 'basura-rio.jpg');
  const r = await call('POST', '/evidences', { token: citizenToken, form });
  expect(r.status === 201 && r.body[0].mimeType === 'image/jpeg', `HTTP ${r.status} ${JSON.stringify(r.body)}`);
});

await step('Ejecutable disfrazado de .jpg → 415', async () => {
  const form = new FormData();
  form.append('reportId', reportId);
  form.append('files', new Blob([EXE], { type: 'image/jpeg' }), 'foto.jpg');
  const r = await call('POST', '/evidences', { token: citizenToken, form });
  expect(r.status === 415, `HTTP ${r.status}`);
});

await step('Análisis IA (proveedor heurístico de prueba) → sugerencia revisable', async () => {
  const r = await call('POST', `/reports/${reportId}/analysis`, { token: citizenToken });
  expect(r.status === 200 && r.body.aiStatus === 'COMPLETED' && r.body.requiresReview, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return `${r.body.suggestedCategory} (${r.body.confidence}) vía ${r.body.provider}`;
});

await step('Funcionario (ADMIN) cambia estado, asigna y observa', async () => {
  const me = await call('GET', '/auth/me', { token: adminToken });
  const s = await call('PATCH', `/reports/${reportId}/status`, { token: adminToken, body: { status: 'EN_REVISION' } });
  const a = await call('PATCH', `/reports/${reportId}/assignment`, { token: adminToken, body: { assigneeId: me.body.id } });
  const o = await call('POST', `/reports/${reportId}/observations`, { token: adminToken, body: { text: 'Visita técnica programada (E2E)' } });
  expect(s.status === 200 && a.status === 200 && o.status === 201, `HTTP ${s.status}/${a.status}/${o.status}`);
});

await step('Ciudadano no puede cambiar estados → 403', async () => {
  const r = await call('PATCH', `/reports/${reportId}/status`, { token: citizenToken, body: { status: 'EN_PROCESO' } });
  expect(r.status === 403, `HTTP ${r.status}`);
});

await step('Historial de seguimiento completo', async () => {
  const r = await call('GET', `/reports/${reportId}/history`, { token: citizenToken });
  const actions = r.body.map((h) => h.action);
  expect(['CREATED', 'AI_SUGGESTION', 'STATUS_CHANGED', 'ASSIGNED'].every((a) => actions.includes(a)), actions.join(','));
  return actions.join(' → ');
});

await step('Mapa público GeoJSON incluye el reporte sin datos del autor', async () => {
  const fc = await waitFor(async () => {
    const r = await call('GET', '/locations/geojson');
    const f = r.body.features?.find((x) => x.properties.reportId === reportId && x.properties.status === 'EN_REVISION');
    return f ? r.body : null;
  }, 30000, 'proyección geográfica actualizada');
  const f = fc.features.find((x) => x.properties.reportId === reportId);
  expect(!('userId' in f.properties), 'expone userId');
});

await step('Notificaciones entregadas (outbox → notifications → SMTP Mailpit)', async () => {
  const page = await waitFor(async () => {
    const r = await call('GET', '/notifications/me', { token: citizenToken });
    const sent = r.body.items?.filter((n) => n.status === 'SENT') ?? [];
    return sent.length >= 3 ? r.body : null; // REGISTRO, REPORTE_RECIBIDO, CAMBIO_ESTADO
  }, 60000, 'notificaciones SENT');
  const mails = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${citizen.email}`)}`)).json();
  expect(mails.messages_count >= 3, `correos en Mailpit: ${mails.messages_count}`);
  return `${page.items.length} notificaciones, ${mails.messages_count} correos en Mailpit`;
});

await step('Estadísticas del panel institucional', async () => {
  const r = await call('GET', '/reports/stats', { token: adminToken });
  expect(r.status === 200 && r.body.total >= 1, `HTTP ${r.status}`);
  return `total=${r.body.total}`;
});

await step('Cierre de sesión: el token revocado deja de funcionar inmediatamente', async () => {
  const login = await call('POST', '/auth/login', { body: { email: citizen.email, password: citizen.password } });
  const t = login.body.accessToken;
  const ok = await call('GET', '/reports/mine', { token: t });
  const out = await call('POST', '/auth/logout', { token: t });
  const after = await call('GET', '/reports/mine', { token: t });
  expect(ok.status === 200 && out.status === 204 && after.status === 401, `HTTP ${ok.status}/${out.status}/${after.status}`);
});

if (withFailures) {
  console.log('\nEscenarios de fallo y recuperación (Docker)');

  await step('UT-DIS-01 · ai detenido: el reporte se crea y el análisis queda UNAVAILABLE', async () => {
    compose('stop ai');
    try {
      const r = await call('POST', '/reports', {
        token: citizenToken,
        body: { title: `[E2E] Quema con IA caída ${stamp}`, description: 'Humo denso por quema de basuras.', category: 'HUMO_QUEMAS', ...MOCOA },
      });
      expect(r.status === 201, `crear HTTP ${r.status}`);
      const form = new FormData();
      form.append('reportId', r.body.id);
      form.append('files', new Blob([JPEG], { type: 'image/jpeg' }), 'humo.jpg');
      await call('POST', '/evidences', { token: citizenToken, form });
      const a = await call('POST', `/reports/${r.body.id}/analysis`, { token: citizenToken });
      expect(a.status === 200 && a.body.aiStatus === 'UNAVAILABLE', `análisis ${a.status} ${JSON.stringify(a.body)}`);
      const h = await call('GET', '/health');
      return `health=${h.body.status}, ai=${h.body.services.ai}`;
    } finally {
      compose('start ai');
    }
  });

  await step('UT-DIS-02 · notifications detenido: el cambio de estado se confirma y se entrega al recuperarse', async () => {
    compose('stop notifications');
    let changedAt;
    try {
      const r = await call('PATCH', `/reports/${reportId}/status`, { token: adminToken, body: { status: 'EN_PROCESO' } });
      expect(r.status === 200, `HTTP ${r.status}`);
      changedAt = Date.now();
    } finally {
      compose('start notifications');
    }
    await waitFor(async () => {
      const r = await call('GET', '/notifications/me', { token: (await call('POST', '/auth/login', { body: { email: citizen.email, password: citizen.password } })).body.accessToken });
      return r.status === 200 && r.body.items.some((n) => n.type === 'CAMBIO_ESTADO' && n.subject.includes('En proceso') && n.status === 'SENT');
    }, 120000, 'notificación entregada tras recuperación');
    return `entregada ${Math.round((Date.now() - changedAt) / 1000)} s después del cambio`;
  });

  await step('UT-DIS-03 · geolocation detenido: el reporte se crea PENDING y se valida al recuperarse', async () => {
    compose('stop geolocation');
    let id;
    try {
      const r = await call('POST', '/reports', {
        token: citizenToken,
        body: { title: `[E2E] Vertimiento con geo caído ${stamp}`, description: 'Descarga de aguas residuales al río.', category: 'VERTIMIENTOS', ...MOCOA },
      });
      expect(r.status === 201 && r.body.locationStatus === 'PENDING', `HTTP ${r.status} ${r.body.locationStatus}`);
      id = r.body.id;
    } finally {
      compose('start geolocation');
    }
    const started = Date.now();
    await waitFor(async () => (await call('GET', `/reports/${id}`, { token: citizenToken })).body.locationStatus === 'VALIDATED', 180000, 'validación diferida');
    return `validado ${Math.round((Date.now() - started) / 1000)} s después de reiniciar geolocation`;
  });

  // Nota: `docker kill` cuenta como detención MANUAL y Docker no aplica la política de reinicio; por eso la
  // caída se simula terminando el proceso principal desde dentro del contenedor.
  await step('UT-DIS-04 · terminación inesperada del proceso de reports: reinicio automático y vuelve a healthy', async () => {
    const id = compose('ps -q reports').trim();
    const before = Number(execSync(`docker inspect -f "{{.RestartCount}}" ${id}`).toString().trim());
    execSync(`docker exec ${id} kill -TERM 1`, { stdio: 'pipe' });
    await sleep(3000);
    const started = Date.now();
    await waitFor(async () => {
      const state = execSync(`docker inspect -f "{{.State.Health.Status}}" ${id}`).toString().trim();
      return state === 'healthy';
    }, 180000, 'reports healthy');
    const after = Number(execSync(`docker inspect -f "{{.RestartCount}}" ${id}`).toString().trim());
    expect(after > before, `RestartCount ${before} → ${after}`);
    const r = await call('GET', '/reports/mine', { token: (await call('POST', '/auth/login', { body: { email: citizen.email, password: citizen.password } })).body.accessToken });
    expect(r.status === 200, `HTTP ${r.status}`);
    return `reinicios ${before} → ${after}, healthy en ${Math.round((Date.now() - started) / 1000)} s`;
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\nResultado: ${results.length - failed.length}/${results.length} pasos correctos`);
process.exit(failed.length ? 1 : 0);
