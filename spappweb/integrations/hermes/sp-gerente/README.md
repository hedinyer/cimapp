# Plugin Hermes — SP Gerente (panel cliente)

Lectura directa al proyecto Supabase del **panel admin del cliente** para la
gerente: inventarios, ventas de tienda, caja, cartera/mora, clientes y garaje.

| Sede | Descripción | Supabase |
| --- | --- | --- |
| `cliente` (alias sede default) | Punto de venta del cliente | **CONFIGURAR** (`SP_CLIENT_SUPABASE_URL`) |

**Solo lectura.** No aprueba créditos ni registra pagos.

## Instalar

```bash
cp -r integrations/hermes/sp-gerente ~/.hermes/plugins/sp-gerente
hermes plugins enable sp-gerente
```

Opcional — override de credenciales:

```bash
export SP_CLIENT_SUPABASE_URL="CONFIGURAR"          # https://<ref>.supabase.co
export SP_CLIENT_SUPABASE_ANON_KEY="CONFIGURAR"
export SP_CLIENT_PANEL_URL="http://localhost:3000"  # o URL de prod
```

Credenciales en blanco para clone de cliente — configurar `SP_CLIENT_SUPABASE_*`
(o `public-env.ts` del panel) más adelante. Panel default: `http://localhost:3000`.

## Tools

| Tool | Uso |
| --- | --- |
| `sp_sedes` | Lista el punto de venta |
| `sp_informe_diario` | Caja + ventas + alertas stock + top mora |
| `sp_inventario` | Stock / bajo mínimo |
| `sp_ventas` | Productos + motos contado del día |
| `sp_caja` | Sesión de caja + egresos |
| `sp_cartera_mora` | Vista `atrasos` |
| `sp_buscar_cliente` | Cédula / nombre |
| `sp_cliente` | Ficha 360° (`sede` + `user_id`) |
| `sp_garaje` | Motos físicas por estado |

Parámetro común: `sede = cliente` (default; aliases legacy `ambas|all|*` → sede única).
Fechas: `YYYY-MM-DD` en `America/Bogota`.

## Prompts útiles (gerente)

- «Dame el informe diario.»
- «¿Qué hay bajo mínimo?»
- «Ventas de tienda de hoy.»
- «Top mora, solo ≥4 días.»
- «Busca el cliente por cédula … y dame la ficha.»

## Self-check

```bash
python ~/.hermes/plugins/sp-gerente/__init__.py
# o desde el repo:
python integrations/hermes/sp-gerente/__init__.py
```

## Relación con el plugin `spappweb`

| Plugin | Canal | Para quién |
| --- | --- | --- |
| **sp-gerente** | Supabase REST (proyecto del cliente) | Gerente / reportes PDV |
| **spappweb** | `/api/agent/tools` (`SPAPP_BASE_URL`) | Operación admin (mutaciones) |

Para mutar (aprobar crédito, confirmar pago) usa `spappweb` apuntando al panel.
Para preguntar «cómo vamos hoy en el punto de venta» usa **sp-gerente**.
