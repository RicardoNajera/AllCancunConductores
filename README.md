# All Cancún Conductores

PWA para conductores: cuentas reales con Supabase Auth, viajes asignados,
aceptar/rechazar y ganancias del día y del mes.

Es la **misma base de datos** que All Cancún (cliente) y All Cancún Comercios.
Aquí solo cambia la cara: RLS decide qué filas ve cada conductor.

## Cómo entra un conductor

**Solo con Google.** No hay formularios ni contraseñas que llenar: el
conductor toca *Continuar con Google* y listo.

1. Abre la app → **Continuar con Google**.
2. Elige su cuenta de Google.
3. La central le otorga el permiso `conducir` en `public.permisos`.
4. Al abrir la app ya ve sus viajes.

Mientras no tenga el permiso, la app le muestra *"permiso de conducir
pendiente"* y no lo deja entrar a los viajes. La app nunca se autoasigna
roles: eso es privilegio del sistema.

## Base de datos

Ejecuta una vez en Supabase → SQL Editor:

```
supabase/viajes.sql
```

Crea `public.viajes` con RLS: cada conductor ve y actualiza solo lo suyo.
Requiere que existan `public.perfiles` y `public.permisos` (los crea
`comercios.sql` del repo de Comercios).

## Uso local

```bash
node dev-server.mjs   # http://127.0.0.1:8767
```

## Configuración en Supabase

- **Authentication → Providers → Google**: activo, con Client ID y Secret
  de Google Cloud Console.
- **Authentication → URL Configuration → Redirect URLs**: agrega el origen
  donde publiques, para que Google regrese a la app.
