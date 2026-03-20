[English](../en/testing-e2e.md) | [Español](../es/testing-e2e.md)

# Pruebas E2E de Navegador

Esta guía define las expectativas de pruebas end-to-end a nivel de navegador para LalaClaw.

Úsala junto con [CONTRIBUTING.md](../../CONTRIBUTING.md). `CONTRIBUTING.md` explica el flujo general de contribución; este archivo explica cuándo añadir cobertura con Playwright, cómo mantenerla estable y qué espera hoy el repositorio de las pruebas de navegador.

## Stack actual

- Framework: Playwright
- Directorio de pruebas: `tests/e2e/`
- Configuración principal: [`playwright.config.js`](../../playwright.config.js)
- Script de arranque de servidores de prueba: [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

La configuración actual inicia:

- servidor frontend en `http://127.0.0.1:5173`
- servidor backend en `http://127.0.0.1:3000`

El script de arranque de Playwright ejecuta el backend en modo `COMMANDCENTER_FORCE_MOCK=1`, así que las pruebas de navegador no dependen de un entorno real de OpenClaw por defecto.

## Cuándo se requiere E2E de navegador

Añade o actualiza cobertura e2e de navegador cuando el cambio afecte una o más de estas áreas:

- comportamiento de envío / stop / retry de mensajes
- turnos en cola y entrada diferida en la conversación
- bootstrap de sesión, cambio de sesión o ruteo de pestañas
- comportamiento de hydration y recuperación que solo se ve tras un render real
- regresiones visibles en el navegador que no inspiran confianza con solo pruebas de hook o controller

Prefiere pruebas Vitest a nivel controller o `App` para transiciones de estado puras. Añade e2e de navegador cuando el riesgo dependa del timing real del DOM, del foco, del ruteo, del orden de las peticiones o de un flujo UI de varios pasos.

## Qué cubrir primero

El repositorio no necesita una cobertura amplia de navegador antes de tener cobertura estable para las rutas de usuario de mayor riesgo.

Prioriza estos flujos:

1. arranque de la app y primer render
2. un ciclo normal de envío / respuesta
3. que los envíos en cola no entren en la conversación hasta que empiece su turno
4. stop / abort durante una respuesta en curso
5. rutas de bootstrap de sesión como pestañas IM o cambio de agent

Si un bug fix cambia cola, streaming, stop, hydration o sincronización session/runtime, normalmente una regresión de navegador debe apuntar exactamente al fallo visible por el usuario.

## Reglas de estabilidad

Las pruebas e2e de navegador deben escribirse para estabilidad, no para detalles visuales triviales.

- Prioriza aserciones sobre comportamiento visible para el usuario en lugar de detalles internos
- Aserta texto, roles, labels y controles estables
- No hagas que la prueba dependa del tiempo de animación salvo que el bug trate de eso
- Evita aserciones frágiles sobre clases Tailwind si la clase no es el comportamiento bajo prueba
- Mantén el comportamiento de red determinista interceptando las llamadas `/api/*` relevantes en la prueba
- Usa interacción real del navegador para escribir, hacer clic, enfocar pestañas y ordenar peticiones

Para flujos de cola o streaming, prioriza aserciones sobre:

- si un mensaje es visible en la región de conversación
- si sigue quedándose solo en la región de cola
- si aparece solo después de que termine el turno anterior
- si el orden visible coincide con el orden real de turnos

## Estrategia de mock

No envíes por defecto los e2e de navegador a un despliegue real de OpenClaw.

Orden de preferencia:

1. enrutar las llamadas `/api/*` relevantes dentro de la prueba de Playwright
2. usar el modo mock del backend del repositorio
3. usar una dependencia externa real solo cuando la tarea exija explícitamente validación equivalente en vivo

Los ejemplos actuales en [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) siguen este patrón:

- `/api/auth/state` está stubbed
- `/api/lalaclaw/update` está stubbed
- `/api/runtime` está stubbed
- `/api/chat` se controla por prueba para mantener deterministas el orden de cola y el momento de finalización

## Guía de autoría

Mantén cada e2e de navegador con un alcance estrecho.

- Un archivo spec normalmente debe centrarse en una sola área del producto
- Una prueba normalmente debe verificar un solo flujo de usuario
- Prefiere un archivo pequeño de helper / fixture antes que copiar JSON grandes en cada prueba
- Reutiliza builders de snapshot cuando sea posible para mantener alineación con `App.test.jsx`

Buenos ejemplos:

- "los turnos en cola se mantienen fuera de la conversación hasta que realmente empiezan"
- "stop devuelve el botón de envío tras abortar una respuesta en curso"
- "una pestaña bootstrap de Feishu se resuelve al session user nativo antes del primer envío"

Ejemplos menos útiles:

- "el botón tiene exactamente este conjunto de clases utilitarias"
- "tres flujos no relacionados en una sola prueba"
- "usa un servicio remoto real aunque un route mock ya cubriría el comportamiento"

## Ejecución local

Instala una vez el navegador de Playwright:

```bash
npm run test:e2e:install
```

Ejecuta los e2e de navegador:

```bash
npm run test:e2e
```

Ejecuta con navegador visible:

```bash
npm run test:e2e:headed
```

Ejecuta con la UI de Playwright:

```bash
npm run test:e2e:ui
```

## Expectativas de CI

CI ya tiene un job dedicado a e2e de navegador en [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

Ese job debe mantenerse enfocado y estable:

- mantén la suite de navegador lo bastante pequeña para ejecutarse con fiabilidad en cada PR
- añade primero regresiones de alto valor antes de escenarios exploratorios más amplios
- evita waits flaky o sleeps largos

Si una nueva prueba de navegador es demasiado lenta o demasiado sensible al entorno para la CI por defecto, no debe entrar en la ruta `test:e2e` hasta que se simplifique o estabilice.

## Checklist recomendada de review

Antes de fusionar un cambio de e2e de navegador, revisa:

- ¿esto realmente necesita e2e de navegador o bastaría con cobertura `App` / controller?
- ¿la prueba verifica comportamiento visible para el usuario y no detalles de implementación?
- ¿el estado de red necesario está controlado de forma determinista?
- ¿esta prueba seguirá teniendo sentido dentro de seis meses si cambia el estilo de la UI?
- ¿la prueba falla por la regresión de usuario que realmente nos importa?

## Archivos relacionados

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
