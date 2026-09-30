# arVault — Exchange API

Documentación de todos los endpoints expuestos por el servicio de cambio de monedas
(`app/`), tal como se ven **a través de nginx** (`docker-compose.yml`, puerto `5555`), que es
el único punto de entrada soportado — el tráfico entre cliente y servidor debe pasar por el
reverse proxy.

- **Base URL:** `http://<host>:5555`
- **Formato:** JSON (`Content-Type: application/json`) tanto en requests con body como en
  todas las respuestas.
- **Autenticación/autorización:** fuera de alcance de este servicio — se asume un componente
  externo que ya filtró los requests antes de que lleguen acá (ver `README.md`).
- Todos los ejemplos de este documento fueron capturados corriendo el servicio real
  (`node app.js`) contra el seed de `app/state/*.json`.

## Índice

| Método | Path | Descripción |
|---|---|---|
| `GET` | [`/health`](#get-health) | Estado del servicio y de su conexión a Redis |
| `GET` | [`/accounts`](#get-accounts) | Lista las cuentas internas |
| `PUT` | [`/accounts/:id/balance`](#put-accountsidbalance) | Fija el balance de una cuenta interna |
| `GET` | [`/rates`](#get-rates) | Lista las tasas de cambio vigentes |
| `PUT` | [`/rates`](#put-rates) | Fija una tasa de cambio (y su recíproca) |
| `POST` | [`/exchange`](#post-exchange) | Ejecuta una operación de cambio de moneda |
| `GET` | [`/log`](#get-log) | Historial de operaciones de cambio |

## Convenciones comunes

### Errores

Todos los errores de negocio/validación devuelven:

```json
{ "error": "<mensaje>" }
```

con el `status` HTTP correspondiente (ver cada endpoint). Un error no controlado (bug,
excepción no capturada) devuelve `500 { "error": "Internal server error" }` sin más detalle,
y un body con JSON inválido devuelve `400 { "error": "Malformed JSON body" }` antes de
llegar a ninguna ruta (`app/createApp.js`, middleware `express.json()`).

### Rate limiting

Hay límites en dos capas, ambas devuelven `429` al excederse (no cuentan contra el resto de
las rutas, son independientes por path):

| Path | Capa | Límite | Respuesta al exceder |
|---|---|---|---|
| `/exchange` | nginx (`limit_req_zone`) | 500 req/s por IP, ráfaga de 100 sin delay | `429` (sin body definido, lo genera nginx) |
| `/exchange` | Express (`express-rate-limit`) | 500 req/s (ventana 1000 ms) | `429 { "error": "Too many requests, try again shortly" }` |
| `/log` | Express (`express-rate-limit`) | 300 req/s (ventana 1000 ms) | `429 { "error": "Too many requests, try again shortly" }` |

El resto de los endpoints (`/health`, `/accounts`, `/rates`) no tienen rate limit propio.

El límite de Express en `/exchange` y `/log` expone headers estándar `RateLimit-*`:

```
RateLimit-Policy: 500;w=1
RateLimit-Limit: 500
RateLimit-Remaining: 499
RateLimit-Reset: 1
```

### Caching

`GET /log` tiene cache de **1 segundo** en nginx (`proxy_cache_valid 200 1s`, con
`proxy_cache_lock` para no pegarle varias veces al upstream por el mismo segundo). La
respuesta incluye el header `X-Cache-Status` (`MISS` / `HIT` / `STALE` / `UPDATING`) para
saber si vino de cache.

---

## `GET /health`

Chequea que el servicio esté arriba y que Redis responda (con timeout de 500 ms).

**Request:** sin body, sin parámetros.

**Response `200`** (Redis responde a tiempo):

```json
{ "status": "ok", "redis": "up", "uptime": 9.644179049 }
```

**Response `503`** (Redis no responde, o tarda más de 500 ms):

```json
{ "status": "degraded", "redis": "down" }
```

---

## `GET /accounts`

Lista todas las cuentas internas (las que respaldan el negocio, no las de los clientes).

**Request:** sin body, sin parámetros.

**Response `200`:**

```json
[
  { "id": 1, "currency": "ARS", "balance": 120000000 },
  { "id": 2, "currency": "USD", "balance": 60000 },
  { "id": 3, "currency": "EUR", "balance": 40000 },
  { "id": 4, "currency": "BRL", "balance": 60000 }
]
```

---

## `PUT /accounts/:id/balance`

Fija (no incrementa) el balance de una cuenta interna. Pensado para recargar saldo antes de
pruebas de carga, no es un endpoint de negocio real.

**Path params:**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | número | id de la cuenta interna (ver `GET /accounts`) |

**Body:**

```json
{ "balance": 2000000 }
```

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `balance` | número | sí | nuevo balance absoluto de la cuenta |

**Response `200`:** la lista completa de cuentas actualizada (mismo shape que `GET /accounts`).

```json
[
  { "id": 1, "currency": "ARS", "balance": 2000000 },
  { "id": 2, "currency": "USD", "balance": 60000 },
  { "id": 3, "currency": "EUR", "balance": 40000 },
  { "id": 4, "currency": "BRL", "balance": 60000 }
]
```

**Response `400`** — `id` o `balance` ausentes:

```json
{ "error": "Malformed request" }
```

> **Nota de comportamiento (no obvia desde afuera):** el guard de este endpoint es
> `if (!accountId || !balance)` (`app/api/accounts.js`). Como `0` es *falsy* en JS,
> **`{ "balance": 0 }` se rechaza con el mismo 400 que un `balance` ausente** — no hay forma
> de poner una cuenta en cero explícitamente con este endpoint. Confirmado con
> `curl -X PUT .../accounts/1/balance -d '{"balance":0}'` → `400`.

---

## `GET /rates`

Lista todas las tasas de cambio vigentes, como un mapa `moneda base → { moneda contraparte:
tasa }`. No hay gap entre compra y venta (la tasa `A→B` y `B→A` son exactamente recíprocas).

**Request:** sin body, sin parámetros.

**Response `200`:**

```json
{
  "ARS": { "BRL": 0.0034, "EUR": 0.00057, "USD": 0.00066 },
  "BRL": { "ARS": 297.06 },
  "EUR": { "ARS": 1761 },
  "USD": { "ARS": 1513 }
}
```

---

## `PUT /rates`

Fija una tasa de cambio para un par de monedas. Automáticamente calcula y guarda también la
tasa recíproca (redondeada a 5 decimales).

**Body:**

```json
{ "baseCurrency": "USD", "counterCurrency": "ARS", "rate": 1064 }
```

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `baseCurrency` | string | sí | código de moneda base |
| `counterCurrency` | string | sí | código de moneda contraparte |
| `rate` | número | sí | debe ser finito y `> 0` |

**Response `200`:** el mapa completo de tasas actualizado (mismo shape que `GET /rates`), con
`baseCurrency→counterCurrency` en el valor dado y `counterCurrency→baseCurrency` en `1/rate`:

```json
{
  "ARS": { "BRL": 0.0034, "EUR": 0.00057, "USD": 0.00094 },
  "BRL": { "ARS": 297.06 },
  "EUR": { "ARS": 1761 },
  "USD": { "ARS": 1064 }
}
```

**Response `400`** — `baseCurrency`/`counterCurrency`/`rate` ausentes, o `rate` no numérico,
`NaN`, `Infinity` o `≤ 0`:

```json
{ "error": "Malformed request" }
```

o, cuando el campo llega pero es inválido (`rate: -1`, por ejemplo):

```json
{ "error": "rate must be a positive finite number" }
```

---

## `POST /exchange`

Ejecuta una operación de cambio entre dos monedas para un cliente: cobra `baseAmount` en
`baseCurrency` y paga `baseAmount * tasa` en `counterCurrency`, usando dos cuentas internas
como respaldo.

**Body:**

```json
{
  "baseCurrency": "USD",
  "counterCurrency": "ARS",
  "baseAccountId": "client-11",
  "counterAccountId": "client-10",
  "baseAmount": 10
}
```

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `baseCurrency` | string | sí | moneda que entrega el cliente |
| `counterCurrency` | string | sí | moneda que recibe el cliente |
| `baseAccountId` | string/número | sí | cuenta del cliente de la que sale `baseCurrency` |
| `counterAccountId` | string/número | sí | cuenta del cliente a la que entra `counterCurrency` |
| `baseAmount` | número | sí | monto en `baseCurrency` |

**Response `200`** — la operación se completó (ambas transferencias internas, en paralelo,
resultaron ok):

```json
{
  "id": "DaCjRGbYdTkvYXS6bllkb",
  "ts": "2026-09-30T14:15:10.881Z",
  "ok": true,
  "request": {
    "baseCurrency": "USD",
    "counterCurrency": "ARS",
    "baseAccountId": "client-11",
    "counterAccountId": "client-10",
    "baseAmount": 10
  },
  "exchangeRate": 1064,
  "counterAmount": 10640,
  "obs": null
}
```

**Response `500`** — la operación no se pudo completar (**no es un error de servidor**, es un
rechazo de negocio; el código HTTP es discutible pero es el que usa el servicio actual):

```json
{
  "id": "MiCKs6krHePzghNJmy33T",
  "ts": "2026-09-30T14:15:11.178Z",
  "ok": false,
  "request": {
    "baseCurrency": "USD",
    "counterCurrency": "ARS",
    "baseAccountId": "client-11",
    "counterAccountId": "client-10",
    "baseAmount": 999999999
  },
  "exchangeRate": 1064,
  "counterAmount": 0,
  "obs": "Not enough funds on counter currency account"
}
```

Todos los casos posibles del campo `obs` en un `500`:

| Causa | `obs` |
|---|---|
| La cuenta interna de contraparte no tiene saldo suficiente | `"Not enough funds on counter currency account"` |
| Se cobró al cliente pero no se le pudo pagar (falló la segunda pata) | `"Could not transfer to clients' account"` |
| Se le pagó al cliente sin haberle cobrado, o ninguna de las dos patas anduvo | `"Could not withdraw from clients' account"` |
| La reserva se rechazó por un motivo que **no** es falta de fondos (ej. cuenta interna inexistente) | `null` — ver nota abajo |

> **Nota de comportamiento (no obvia desde afuera):** el único motivo de rechazo de reserva
> que efectivamente popula `obs` es `"insufficient_funds"` (`app/services/exchange.js:48`).
> Si la reserva se rechaza por otro motivo (ej. `"account_not_found"`, si `baseCurrency` o
> `counterCurrency` no corresponden a ninguna cuenta interna configurada), la respuesta es
> `500` con `ok:false` y **`obs:null`**, sin ninguna explicación de qué pasó. Confirmado en
> `app/test/unit/exchange.service.test.js`.

En ambos casos (`200` y `500`) la operación queda registrada en `GET /log`.

**Response `400`** — algún campo requerido falta:

```json
{ "error": "Malformed request" }
```

**Response `429`** — se excedió el rate limit de Express (500 req/s) o el de nginx (ver
[Rate limiting](#rate-limiting)).

---

## `GET /log`

Devuelve las entradas más recientes del historial de operaciones de `/exchange` (éxitos y
rechazos, mismo shape que la respuesta de `POST /exchange`).

**Query params:**

| Campo | Tipo | Requerido | Default | Notas |
|---|---|---|---|---|
| `limit` | entero | no | `100` | debe ser un entero entre `1` y `500` inclusive |

**Response `200`:**

```json
[
  {
    "id": "DaCjRGbYdTkvYXS6bllkb",
    "ts": "2026-09-30T14:15:10.881Z",
    "ok": true,
    "request": { "...": "..." },
    "exchangeRate": 1064,
    "counterAmount": 10640,
    "obs": null
  },
  {
    "id": "MiCKs6krHePzghNJmy33T",
    "ts": "2026-09-30T14:15:11.178Z",
    "ok": false,
    "request": { "...": "..." },
    "exchangeRate": 1064,
    "counterAmount": 0,
    "obs": "Not enough funds on counter currency account"
  }
]
```

Las entradas se devuelven en orden cronológico (más antigua primero), recortadas a las
últimas `limit` — es decir, si hay más operaciones que `limit`, se devuelven las **más
recientes**, no las primeras.

**Response `400`** — `limit` no es un entero, o está fuera de `[1, 500]`:

```json
{ "error": "limit must be an integer between 1 and 500" }
```

**Response `429`** — se excedió el rate limit de Express en `/log` (300 req/s).

---

## Resumen de status codes por endpoint

| Endpoint | `200` | `400` | `429` | `500` | `503` |
|---|---|---|---|---|---|
| `GET /health` | ✅ (up) | | | | ✅ (Redis down/timeout) |
| `GET /accounts` | ✅ | | | | |
| `PUT /accounts/:id/balance` | ✅ | ✅ (falta `id`/`balance`, o `balance:0`) | | | |
| `GET /rates` | ✅ | | | | |
| `PUT /rates` | ✅ | ✅ (falta campo, o `rate` inválido) | | | |
| `POST /exchange` | ✅ (`ok:true`) | ✅ (falta campo) | ✅ | ✅ (`ok:false`, rechazo de negocio) | |
| `GET /log` | ✅ | ✅ (`limit` inválido) | ✅ | | |

## Referencias

- Colección de Postman con requests de ejemplo: `doc/TP 1 - arVault.postman_collection.json`.
- Definición de las rutas: `app/api/*.js`.
- Reglas de negocio y validaciones: `app/services/*.js`, `app/exceptions/errors.js`.
- Rate limiting de Express: `app/middleware/rateLimit.js`, configurado en `app/app.js`.
- Rate limiting y cache de nginx: `nginx_reverse_proxy.conf`.
