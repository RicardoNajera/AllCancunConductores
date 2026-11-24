# All Cancún Conductores

PWA para conductores: cuentas reales con Supabase Auth, viajes asignados,
aceptar/rechazar y ganancias del día y del mes.

Es la **misma base de datos** que All Cancún (cliente) y All Cancún Comercios.
Aquí solo cambia la cara: RLS decide qué filas ve cada conductor.

## Cómo se registra un conductor

1. Abre la app → **No tengo cuenta · Registrarme**.
2. Correo y contraseña.
3. Confirma el correo si el proyecto lo exige (Authentication → Email).
4. La central le otorga el permiso `conducir` en `public.permisos`.
5. Al abrir la app ya ve sus viajes.

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

- **Authentication → Providers**: activa *Email*.
- **Authentication → URL Configuration → Redirect URLs**: agrega el origen
  donde publiques, para que el enlace de confirmación vuelva a la app.
