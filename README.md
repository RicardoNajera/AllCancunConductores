# All Cancún Conductores

PWA para conductores: entra con Google, se conecta, recibe viajes en tiempo
real y **el primero que acepta se lo queda**.

Es la **misma base de datos** que All Cancún (cliente) y All Cancún Comercios.
Aquí solo cambia la cara: RLS decide qué filas ve cada conductor.

- Cliente: https://ricardonajera.github.io/AllCancun/
- Comercios: https://ricardonajera.github.io/AllCancunComerciantes/
- Conductores: https://ricardonajera.github.io/AllCancunConductores/

## Cómo entra un conductor

**Solo con Google.** No hay formularios ni contraseñas que llenar: el
conductor toca *Continuar con Google* y listo.

1. Abre la app → **Continuar con Google**.
2. Elige su cuenta de Google.
3. La central le crea su ficha en `public.conductores` con
   `estado = 'aprobado'`.
4. Al abrir la app ya ve los viajes disponibles y puede ponerse *en línea*.

Si aún no tiene ficha, la app le dice *"Aún no tienes ficha de conductor"*.
La sesión de Google **no** basta: hace falta la fila aprobada en
`public.conductores`. La app nunca se autoasigna roles.

## La regla del viaje

Un viaje nace en `estado = 'solicitado'` con `conductor_id` en `NULL`. Todos
los conductores en línea lo ven; gana el que lo acepta primero.

La carrera se resuelve en la base, no en el teléfono. `public.tomar_viaje(uuid)`
hace un update condicional:

```sql
update public.viajes
   set estado = 'aceptado', conductor_id = auth.uid()
 where id = p_viaje_id
   and estado = 'solicitado'
   and conductor_id is null;
```

**1 fila actualizada = ganaste. 0 filas = alguien llegó antes.** No hacen
falta locks ni transacciones explícitas: el `WHERE` es la resolución.

## Base de datos

Ejecuta una vez en Supabase → SQL Editor, en este orden:

```
03-PASO-1-enums.sql          -- tipos enum
03-PASO-2-tablas.sql         -- tablas + RLS
supabase/04-FIX-tomar-viaje.sql   -- función tomar_viaje + política
```

El último es **idempotente**: puedes correrlo varias veces sin romper nada.
Devuelve `OK | OK` si aplicó bien.

Sin él la app falla al aceptar: la política `"Actualizar viaje"` exige
`conductor_id = auth.uid()`, y al aceptar ese campo todavía está en `NULL`,
así que ningún conductor podría tomar nunca un viaje.

## Estructura

```
index.html            pantalla de entrada (Google) + app
styles.css            estilos, incluido el login inmersivo
app.js                lógica de la app
config.js             URL y anon key de Supabase
jsfiles/supabase.js   cliente, sesión, OAuth, perfil
jsfiles/viajes.js     ficha del conductor, viajes, RPC, Realtime
sw.js                 service worker (cachea el shell)
supabase/             SQL de la base
```

## Uso local

```bash
python3 -m http.server 8102 --bind 127.0.0.1
# http://127.0.0.1:8102
```

Debe servirse por HTTP (no `file://`): el service worker y OAuth lo necesitan.
Si cambiaste `sw.js`, sube `VERSION` y recarga con `Cmd+Shift+R`.

## Configuración en Supabase

- **Authentication → Providers → Google**: activo, con Client ID y Secret
  de Google Cloud Console.
- **Authentication → URL Configuration → Redirect URLs**: agrega el origen
  donde publiques (incluido `http://127.0.0.1:8102` para local), para que
  Google regrese a la app.
- **Database → Replication**: activa `public.viajes` si quieres alertas
  instantáneas. Sin Realtime la app consulta cada 4 segundos.

La anon key es pública a propósito: la seguridad la pone RLS.

