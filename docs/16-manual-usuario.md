# 16 · Manual de usuario

## Ciudadanos

### Crear una cuenta
1. En la página de inicio pulse **Crear cuenta**.
2. Escriba su nombre, correo y una contraseña con al menos 8 caracteres, una mayúscula, una minúscula y un número.
3. Recibirá un correo de bienvenida.

### Reportar un problema ambiental
1. Pulse **+ Reportar**.
2. Escriba un **título** corto y elija la **categoría**: basura, contaminación hídrica, deforestación, humo y quemas, vertimientos, minería ilegal u otra.
3. En la **descripción** indique qué ocurre, desde cuándo y si hay riesgo para personas o animales.
4. Marque el lugar **tocando el mapa** o pulse **📍 Usar mi ubicación**. Por ahora solo se atienden puntos dentro de **Mocoa**.
5. Adjunte hasta **5 fotografías** (JPEG, PNG o WEBP, máximo 5 MB cada una).
6. Pulse **Enviar reporte**.

Si las fotos o el análisis automático fallan, **su reporte queda registrado igualmente**; el sistema se lo indicará.

### Seguir sus reportes
- **Mis reportes** muestra su lista con el estado: *Pendiente*, *En revisión*, *En proceso*, *Resuelto* o *Rechazado*.
- En el detalle verá las fotos, la ubicación, la **línea de tiempo** del seguimiento y las observaciones de los funcionarios. Puede agregar observaciones con información adicional.
- Puede editar su reporte solo mientras está *Pendiente*.
- Recibirá un correo cada vez que cambie el estado. En **Mi perfil** encontrará el historial de notificaciones.

### Mapa público
**Mapa** muestra los reportes de la comunidad con su categoría y estado. Nunca muestra quién reportó.

### Clasificación automática
Al adjuntar fotos, el sistema puede sugerir una categoría. Esta sugerencia la produce hoy un **servicio de prueba basado en palabras clave, no una inteligencia artificial entrenada**; un funcionario siempre la revisa.

## Funcionarios y gestores ambientales

### Panel institucional
**Panel institucional** muestra el total de reportes, la cantidad por estado (pulse un indicador para ver la lista), gráficos por categoría y municipio, y el mapa. Si algún servicio interno falla, aparece un aviso de *modo degradado*.

### Gestionar reportes
1. **Gestionar reportes** permite filtrar por estado (pestañas), categoría y "Solo asignados a mí".
2. En el detalle del reporte, el bloque **Gestión institucional** permite:
   - **Cambiar el estado** según el flujo permitido: Pendiente → En revisión → En proceso → Resuelto; se puede rechazar desde Pendiente o En revisión; En proceso puede volver a En revisión. **Resolver o rechazar exige un comentario** para el ciudadano.
   - **Asignar un responsable** (solo *Gestor ambiental* y *Administrador*).
   - **Aceptar la categoría sugerida** por el análisis automático, si difiere de la actual.
3. Registre **observaciones** de seguimiento (visitas, hallazgos).

## Administradores

- **Usuarios**: lista de cuentas con filtro por rol; permite cambiar el rol (Ciudadano, Funcionario, Gestor ambiental, Administrador), asociar la **entidad** (Corpoamazonia, Alcaldía de Mocoa, Gobernación del Putumayo, Parques Nacionales, MinAmbiente) y activar/desactivar cuentas. Un administrador no puede modificar su propia cuenta desde esta vista.
- **Cobertura geográfica**: habilitar otro municipio del Putumayo se hace con `PATCH /api/municipalities/{códigoDANE}` (Swagger, sección *geolocation*), indicando `enabled: true` y su rectángulo de cobertura. (No hay pantalla para esta función todavía.)

## Preguntas frecuentes

| Pregunta | Respuesta |
|---|---|
| ¿Por qué no puedo reportar fuera de Mocoa? | La cobertura inicial es Mocoa; se ampliará al Putumayo. |
| ¿Quién ve mis datos? | El sistema registra quién creó cada reporte para su seguimiento; el mapa público nunca muestra su identidad. |
| ¿Por qué me pide iniciar sesión de nuevo? | La sesión dura 1 hora y se cierra al cerrar la pestaña. |
| ¿GreenAlert es un canal oficial de las autoridades? | No. Es un proyecto académico; no existe integración oficial con las entidades. |
