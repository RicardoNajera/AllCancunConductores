# Que el viaje pedido en All Cancún llegue al conductor

Guía para dejar el circuito completo funcionando:

```
All Cancún (cliente pide)  →  public.viajes (estado='solicitado')
                                      ↓
                    All Conductor (ve, alerta, acepta)
                                      ↓
                    public.viajes (estado='aceptado' + conductor_id)
```

Las tres apps usan **el mismo proyecto Supabase**, así que comparten la
tabla `public.viajes`. No hay que conectar nada entre apps: el problema
siempre estuvo en los permisos de la tabla.

## Diagnóstico (por qué no aparecía)

El código de las dos apps estaba completo y correcto. Fallaban los
permisos de la base de datos, en dos puntos distintos:

### 1. El conductor no podía VER los viajes libres

La política de lectura era:

```sql
using (conductor_id = auth.uid() or cliente_id = auth.uid())
```

Un viaje recién pedido tiene `conductor_id = NULL` y `cliente_id` del
cliente. Para el conductor, las dos comparaciones son falsas, así que
**Postgres no le entrega la fila**. `listarSolicitados()` y el canal de
Realtime devolvían vacío siempre.

El archivo `04-FIX-tomar-viaje.sql` arregló el **UPDATE** (aceptar), pero
nadie arregló el **SELECT**. Sin ver el viaje, no hay nada que aceptar.

### 2. El cliente no podía CREAR el viaje

Sin política de INSERT, `crearViaje()` recibía `42501`, devolvía `null`
y la app lo interpretaba como "no hay sesión", cayendo al modo demo. El
viaje nunca llegaba a la base.

## Pasos (en este orden)

Pega cada archivo en **Supabase → SQL Editor → Run**. Todos son
idempotentes: puedes correrlos varias veces sin romper nada.

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `06-DIAGNOSTICO.sql` | Solo informa. Muestra qué falta. |
| 2 | `05-FIX-conductor-ve-solicitados.sql` | El conductor ve los viajes libres. |
| 3 | `07-FIX-cliente-crea-viaje.sql` | El cliente puede pedir (y cancelar). |
| 4 | `04-FIX-tomar-viaje.sql` | El conductor puede aceptar. |

Al final de cada uno hay una consulta de verificación que devuelve
`OK` / `FALTA`.

### Realtime (opcional pero recomendado)

Sin Realtime, el conductor igual recibe los viajes por el **respaldo de
sondeo cada 4 segundos** que ahora trae la app. Con Realtime, la alerta
aparece al instante.

Supabase → **Database → Replication** → activa `public.viajes`, o por SQL:

```sql
alter publication supabase_realtime add table public.viajes;
```

## Requisitos de la cuenta del conductor

Para que un conductor reciba viajes hacen falta las dos cosas:

1. Una fila en `public.conductores` con `perfil_id` = su usuario.
2. Esa fila con `estado = 'aprobado'`.

Si falta cualquiera, `tomar_viaje()` devuelve `false` y la app muestra
"otro conductor lo tomó primero". La consulta 6 del diagnóstico dice
cuántos conductores aprobados hay.

## Cómo probarlo

1. **Cliente**: abre All Cancún con sesión iniciada, pide un mototaxi.
2. En Supabase, `Table Editor → viajes`: debe aparecer una fila nueva
   con `estado = 'solicitado'` y `conductor_id` vacío.
3. **Conductor**: abre All Conductor con una cuenta aprobada, pulsa
   **Conectado**. En 4 segundos (o al instante con Realtime) debe salir
   la alerta con el origen, destino y tarifa.
4. Acepta. En la tabla, la fila pasa a `estado = 'aceptado'` con el
   `conductor_id` puesto.
5. En All Cancún, el precio cambia a "«Nombre» en camino".

## Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| El viaje no aparece en `viajes` | Falta política INSERT | Corre `07-FIX` |
| El viaje está en la tabla pero el conductor no lo ve | Falta política SELECT | Corre `05-FIX` |
| Al aceptar dice "otro lo tomó primero" | Cuenta sin aprobar | Revisa `conductores.estado` |
| El cliente ve la simulación vieja | Sin sesión iniciada | Inicia sesión en All Cancún |

## Nota sobre el código

Además de los permisos, se corrigieron dos cosas en el código:

- **`features/mototaxis/index.js`** usaba `precioEl` cuando la variable
  real es `priceEl`. Eso lanzaba `ReferenceError` justo al pedir el
  viaje, antes de llegar a Supabase.
- **`app.js`** de All Conductor importaba `listarSolicitados` pero nunca
  lo llamaba: si Realtime no estaba activo, no había ningún respaldo.
  Ahora hay un sondeo cada 4 segundos mientras el conductor está en
  línea.
