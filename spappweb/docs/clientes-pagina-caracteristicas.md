# Página Clientes — características para replicar

Referencia de la lista admin en `/clientes`. Usar este checklist al portar features a otra página de listado similar que aún no las tenga.

## Archivos fuente

| Pieza | Ruta |
| --- | --- |
| Página server | `src/app/(admin)/clientes/page.tsx` |
| Búsqueda + filtros + cartera | `src/components/clientes/clientes-search-live.tsx` |
| Tarjetas + acciones | `src/components/clientes/clientes-search-results.tsx` |
| Filtros / sort / cartera | `src/lib/clientes/clientes-list-filters.ts` |
| Query lista crédito | `listClientesMotoCredito` en `src/lib/pipeline/queries.ts` |
| Query búsqueda | `searchClients` en `src/lib/pipeline/queries.ts` |
| Tipo de fila | `ClientSearchResult` en `src/lib/pipeline/types.ts` |
| Reglas de mora / botón recoger | `src/lib/pipeline/mora-utils.ts` |
| Acción marcar recogida | `markMotoRecogidaByUserId` en `src/lib/actions/admin-actions.ts` |

---

## 1. Datos por cliente (`ClientSearchResult`)

Cada fila debe traer al menos:

- Identidad: `userId`, `username`, `displayName`, `cedula`
- Moto: `placa`, `motoLabel`, `selfieUrl`, `motoImagenUrl`
- Compra: `compraId`, `compraEstado`, `fechaVenta`, `seleccionadoAt`, `cuotasPagadas`
- Mora: `diasAtraso`, `montoAdeudado` (desde vista `atrasos`)
- Estado físico / pipeline: `motoRecogida`, `puedeMarcarRecogida`
- Vigilancia: `vigilado`, `notaVigilancia`
- Origen: `referralLabel`
- (Búsqueda) `matchLabel`

**Importante:** `montoAdeudado` debe viajar en el resultado (no solo usarse en server y descartarse).

---

## 2. Cabecera de página

- Título: **Clientes**
- Descripción que mencione búsqueda (placa / cédula / nombre) y el orden de la lista
- Botón **Crear cliente** (toggle del formulario por cédula)
- Query string: `?q=` (búsqueda), `?nuevo=1` (abre crear)

---

## 3. Búsqueda en vivo

- Input con debounce (~250 ms)
- Mínimo 2 caracteres
- Server action / query: placa, cédula o nombre
- Sin query (o &lt; 2 chars): lista base de clientes con moto a crédito
- Con query: resultados de búsqueda, mismos filtros y misma tarjeta

---

## 4. Filtros

Bloque **Filtros** con:

| Filtro | Valores |
| --- | --- |
| Situación | Toda / Al día / En atraso / Moto recogida / Vigilados / Cancelados |
| Estado compra | Todo + estados de `COMPRA_ESTADO_LABELS` |
| Venta desde | `input type="date"` |
| Venta hasta | `input type="date"` |

- Botón **Limpiar** si hay filtros activos
- Lógica: `filterClientSearchResults` en `clientes-list-filters.ts`
- Tras filtrar, **siempre reordenar** con el mismo comparator

---

## 5. Orden de la lista

Usar `compareClientSearchResults`:

1. **Vigilados** (no cancelados, no recogidos)
2. **Activos** por mora descendente (`diasAtraso`)
3. **Recogidos** (`motoRecogida`)
4. **Cancelados** al final (`compraEstado === "cancelada"`)

Dentro de cada grupo: más atraso primero; empate → `seleccionadoAt` más reciente.

Aplicar el sort:

- En la query server de la lista
- Tras filtrar en cliente
- Tras acciones locales (marcar recogida / cancelar) para que la tarjeta salte de grupo

---

## 6. Cartera en mora (KPI)

Texto tipo: `Cartera en mora: $ X`

- Suma de `montoAdeudado` de la lista **visible** (respeta filtros/búsqueda)
- Helper: `montoCarteraEnMora(client)`
- **Incluye:** clientes con `diasAtraso > 0` y saldo
- **Excluye:**
  - `motoRecogida` (recogidas / retenidas en ese flujo)
  - `compraEstado === "cancelada"`
  - `diasAtraso <= 0`

UI: al lado del conteo de clientes, tipografía `font-semibold tabular-nums`.

---

## 7. Tarjeta de cliente (UI)

### Layout

- Grid 1 col / 2 cols en `lg`
- Izquierda: foto cliente + foto moto (cuadrados apilados)
- Derecha: datos + barra de acciones

### Sellos (estilo “estampa” diagonal)

| Estado | Sello | Fondo tarjeta |
| --- | --- | --- |
| Cancelado | `Cancelado` (rojo) | `border-red-200 bg-red-50/30` |
| Recogida (y no cancelado) | `Recogida` (ámbar) | `border-amber-200 bg-amber-50/30` |

Componente reutilizable: `StatusStamp` (label + tone).

### Badges / señales

- **Cliente vigilado** (estilo pulse) + `notaVigilancia` debajo
- Estado de compra (`Entregada`, etc.)
- Mora: `N días atraso` (rojo) o `Al día` (verde) — ocultar si recogida/cancelado
- Referido, placa, modelo, fecha de venta, cuotas pagadas

### Acciones en la tarjeta

| Acción | Cuándo se muestra | Label |
| --- | --- | --- |
| Recoger | `puedeMarcarRecogida && !cancelado` | **Recoger moto!** |
| Cancelar contrato | `compraId && !cancelado` | Cancelar contrato |
| Generar facturas | Siempre | Generar facturas |
| Ver ficha | Siempre | Link a `/clientes/[userId]` |
| Eliminar | Siempre (icono) | Confirmación destructiva |

Tras recoger: toast + opción ir a Garaje; actualizar `motoRecogida` y reordenar.

---

## 8. Reglas del botón “Recoger moto!”

Fuente: `puedeMarcarMotoRecogida` en `mora-utils.ts`.

Condiciones:

1. `compraEstado === "entregada"`
2. No está ya recogida (`motoYaRecogida`: fila `motos_para_recoger.estado === "recogida"` o `estado_fisico === "recogida"`)
3. `diasAtraso >= 4` (`DIAS_RECOGER_BANDEJA`)
4. `montoAdeudado > 0`

**No bloquear** por filas previas de `motos_para_recoger` en estado `cancelada` (si pagó y volvió a atrasarse, debe poder recogerse de nuevo).

Server (`markMotoRecogidaByUserId`) valida lo mismo y escribe en `motos_para_recoger` + `estado_fisico`.

Sync diaria: RPC `evaluar_mora_diaria` → `sync_mora_for_compra` reabre `cancelada` → `pendiente` cuando vuelve a haber 4+ días de atraso.

---

## 9. Checklist mínimo para otra página similar

- [ ] El tipo/DTO incluye `montoAdeudado`, `motoRecogida`, `puedeMarcarRecogida`, `vigilado`, `notaVigilancia`
- [ ] La query rellena esos campos desde `atrasos` + `motos_para_recoger` / `estado_fisico`
- [ ] Orden: vigilados → mora → recogidos → cancelados
- [ ] KPI cartera con `montoCarteraEnMora` (sin recogidas ni cancelados)
- [ ] Sellos Cancelado / Recogida en tarjetas
- [ ] Botón **Recoger moto!** con la regla de 4+ días (sin bloquear por `cancelada` previa)
- [ ] Filtros de situación (al menos atraso / recogida / vigilado / cancelado) si aplica
- [ ] Reordenar tras acciones locales

### Reuso recomendado (evitar copiar-pegar)

Importar desde `src/lib/clientes/clientes-list-filters.ts`:

- `compareClientSearchResults`
- `montoCarteraEnMora`
- `filterClientSearchResults` (si la otra página usa los mismos filtros)

Reutilizar o extraer:

- `StatusStamp` (hoy en `clientes-search-results.tsx` y listados hermanos del panel)
- Misma etiqueta de botón: `Recoger moto!`

---

## 10. Valores de negocio fijos

| Constante | Valor | Archivo |
| --- | --- | --- |
| Días bandeja “en mora” | 3 | `DIAS_MORA_BANDEJA` |
| Días para poder recoger | 4+ | `DIAS_RECOGER_BANDEJA` |
| Plazo recuperación post-recogida | 3 días | `DIAS_RECUPERACION_CLIENTE` |

---

## 11. Lo que esta página hace y una lista “simple” suele omitir

1. Cartera en mora agregada (excluyendo recogidas)
2. Orden por tiers (vigilado / mora / recogida / cancelado)
3. Sellos visuales Cancelado / Recogida
4. Botón de recoger con elegibilidad 4+ días y sync de mora
5. Filtros de situación + rango de fecha de venta
6. Acciones inline (recoger, cancelar, facturas, eliminar) sin entrar a la ficha
7. Vigilancia con nota visible en la tarjeta
`)