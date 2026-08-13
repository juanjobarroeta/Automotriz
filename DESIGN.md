# Sistema de diseño — Automotriz PRO

Extraído de `Automotriz PRO.dc.html` (mockup de 9 pantallas, sync 2026-08-12T05:22Z).
Sustituye al sistema «Nórdico» (verde `#0B7A4B`, Schibsted Grotesk, radio 16 px).

**Regla base: no inventar valores.** Todo hex, radio, tamaño y espaciado de este
documento viene del mockup. Si necesitas un valor que no está aquí, búscalo en el
mockup antes de inventarlo.

---

## 1 · Carácter

Monocromo. La tinta es el acento: no hay color de marca. El color aparece solo
como **estado** (verde/ámbar/rojo) y siempre en su forma más apagada — chip con
fondo tenue, nunca un bloque saturado.

Densidad alta y bordes finos. La jerarquía se construye con **tamaño y peso de
letra**, no con sombras ni cajas: las tarjetas tienen borde de 1 px y cero
sombra. Las cifras mandan — un KPI es un número de 30 px sobre una etiqueta de
12 px, sin caja alrededor.

Voz: español de México, directo. Los datos duros (VIN, folios, RFC, UUID) van
siempre en mono.

---

## 2 · Color

### Tinta y texto

| Token | Hex | Uso |
|---|---|---|
| `--ink` | `#0A0A0A` | Texto principal, botón primario, acento |
| `--ink-2` | `#404040` | Texto enfatizado sobre fondo tenue |
| `--ink-3` | `#525252` | Texto secundario en celdas y controles |
| `--muted` | `#737373` | Etiquetas, subtítulos, encabezados de tabla |
| `--muted-2` | `#767676` | Sub-línea de KPI, texto terciario |
| `--faint` | `#A3A3A3` | Iconos inactivos, carets |
| `--faint-2` | `#C0C0C0` | Chevron de fila |

### Superficies

| Token | Hex | Uso |
|---|---|---|
| `--surface` | `#FFFFFF` | Fondo de app, tarjetas, rail |
| `--surface-subtle` | `#FAFAFA` | Nota al pie dentro de tarjeta |
| `--surface-soft` | `#F4F4F4` | Riel de barra, fondo de chip neutro |
| `--surface-row` | `#F2F2F2` | Fila seleccionada / zebra |
| `--surface-hover` | `#EDEDED` | Hover de nav y de fila |

### Bordes

| Token | Hex | Uso |
|---|---|---|
| `--border` | `#E8E8E8` | Borde de tarjeta, control, topbar, rail |
| `--border-strong` | `#DEDEDE` | Línea bajo el `<thead>` |
| `--border-hairline` | `#F2F2F2` | Línea entre filas de tabla |
| `--border-inner` | `#F0F0F0` | Divisor dentro de una tarjeta |

### Estados

Cada estado es un par **texto / fondo tenue**. El texto sirve también como color
de cifra cuando un KPI es bueno o malo.

| Estado | Texto | Fondo | Uso |
|---|---|---|---|
| ok | `#2E7D46` | `#EDF6EF` | Disponible, lista, timbrado, al corriente |
| warn | `#8A6A1F` | `#FDF6E7` | Apartado, en proceso, por vencer |
| danger | `#B3402E` | `#FCEFEC` | Vencido, cancelado, existencia negativa |
| info | `#2A4C9B` | `#EFF3FB` | Informativo, en tránsito |
| neutral | `#525252` | `#F2F2F2` | Entregado, cerrado, sin estado |

---

## 3 · Tipografía

- **Instrument Sans** (400/500/600/700) — toda la interfaz.
- **IBM Plex Mono** (400/500) — VIN, folios, RFC, UUID, series, claves SAT.
- `font-variant-numeric: tabular-nums` global: las cifras alinean en columna.

| Rol | Tamaño | Peso | Notas |
|---|---|---|---|
| H1 de pantalla | 25px | 700 | `letter-spacing:-0.025em` |
| KPI grande | 30px | 600 | `line-height:1`, `letter-spacing:-0.03em` |
| KPI en tarjeta | 29px | 600 | idem |
| KPI en pantalla de catálogo | 27px | 600 | ver la regla abajo |
| Título de tarjeta | 13px | 600 | |
| Nombre de unidad | 15px | 600 | |
| Cuerpo / celda | 12.5px | 400 | tamaño por defecto del body |
| Celda destacada | 13px | 400/600 | primera columna de una tabla |
| Etiqueta de KPI | 12px | 400 | `--muted` |
| Encabezado de tabla | 11.5px | 400 | `--muted`, **sin mayúsculas** |
| Sub-línea de KPI | 11.5px | 400 | `--muted-2` |
| Chip y mono | 11px | 400/500 | |

> El encabezado de tabla del sistema anterior era 10px, 700, MAYÚSCULAS con
> `letter-spacing`. Aquí es 11.5px, peso normal, capitalización normal.

---

## 4 · Forma y espaciado

- Radio **8px** — tarjetas, botones, controles, ítems de nav, avatar cuadrado.
- Radio **4px** — chips de estado, y el cuadro de marca de 16px del topbar.
- Radio **3px** — barras del waterfall (6px de alto).
- **Sin sombras.** Única excepción: el rail cuando está desplegado, que flota
  sobre el contenido.
- Rejilla base 4px. Padding de pantalla: `26px 28px 36px`.
- `--rowpad: 9px` — padding vertical de fila de tabla (12px horizontal).

---

## 5 · Shell

### Rail (60px → 216px)

Columna de iconos de **60px** que se despliega a **216px** al pasar el mouse
(`transition: width .18s ease`) y flota sobre el contenido con sombra; el
contenido **no se recorre**. Fondo blanco, borde derecho `--border`.

- Marca: cuadro de 30px, radio 8px, fondo `--ink`, letra «A» blanca 700/14px;
  al desplegar aparece «Automotriz PRO» en 13px/600.
- Ítem: alto 36px, radio 8px, icono de 18px (`stroke-width:1.4`, `fill:none`,
  `currentColor`), gap 10px, etiqueta 13px. Hover `--surface-hover`.
- Activo: fondo `--surface-hover`, texto `--ink`. Inactivo: texto `--muted-2`.
- Las etiquetas se desvanecen con `opacity` (`.14s`), no con `display`, para que
  la animación no salte. `title` en cada ítem para el estado colapsado.
- Al pie: Configuración, y la ficha de usuario (avatar + nombre 12.5px/600 +
  rol 11px `--muted-2`).

### Topbar (56px)

Alto fijo 56px, borde inferior `--border`, padding lateral 18px, gap 14px.

1. Selector de agencia: cuadro de 16px radio 4px con la inicial, nombre en
   12.5px/600, caret `--faint`; todo dentro de un borde `--border` radio 8px.
2. Buscador: icono lupa 14px + placeholder «Buscar VIN, cliente, orden,
   refacción…» en 13px `--muted-2`. Sin caja.
3. A la derecha (`margin-left:auto`): estado de sync (punto de 6px `ok` con
   `animation: pulse 2.6s infinite` + texto 11.5px), campana de 32px con punto
   de aviso `#C2410C`, y avatar redondo de 32px con iniciales.

---

## 6 · Patrones

### Franja de KPIs
Rejilla de 3–5 columnas, `gap:28px`, **sin cajas**, cerrada por
`border-bottom:1px solid --border` y `padding-bottom:20-22px`. Cada ítem:
etiqueta 12px `--muted` → cifra → sub-línea 11.5px `--muted-2`. La cifra toma
color de estado solo cuando el dato es bueno o malo.

**Tamaño de la cifra: 30px por defecto, 27px en las pantallas de catálogo**
(Inventario y Refacciones — las que llevan una tabla larga debajo). No es una
regla de número de columnas: en el mockup, Panel lleva 4 columnas a 30px y
Refacciones 4 columnas a 27px; Inventario lleva 5 a 27px. Baja también a 27px
cualquier franja de 5 ítems o más, para que un importe largo no se parta en dos
renglones.

### Encabezado de pantalla
`<h1>` de 25px seguido de una glosa en 13px `--muted` en la misma línea
(`align-items:baseline`). Las acciones van a la derecha con `margin-left:auto`.

### Barra de herramientas
Controles de 7px/11px, borde `--border`, radio 8px, 12.5px:
buscador (`cursor:text`, texto `--muted`), filtros «Etiqueta ▾» (`--ink-3`),
y por último el botón primario: fondo `--ink`, texto blanco, `8px 13px`,
12.5px/600, radio 8px.

### Tabla
`border-collapse:collapse`, **sin borde exterior ni sombra**.
- `th`: 11.5px, peso 400, `--muted`, `padding:9px 12px`,
  `border-bottom:1px solid --border-strong`. Numéricas a la derecha.
- `td`: `padding: var(--rowpad) 12px`, `border-bottom:1px solid --border-hairline`.
- Primera columna 13px; columnas de dato duro en mono 11px; secundarias 12.5px
  `--ink-3`; importes 12.5px a la derecha.
- Hover de fila `--surface-hover`.

### Chip de estado
`font-size:11px; border-radius:4px; padding:2px 7px`, par de color del §2.
Nunca en mayúsculas forzadas ni en negrita.

### Tarjeta
`border:1px solid --border; border-radius:8px; padding:18-20px`. Sin sombra.
Cabecera: título 13px/600 a la izquierda, enlace 12px `--muted` a la derecha.
Divisor interno: `border-top:1px solid --border-inner` con `padding-top:12px`.
Nota al pie: fondo `--surface-subtle`, borde `--border-inner`, radio 7px,
padding `11px 13px`, 12.5px `--ink-3`, `line-height:1.5`.

### Tabs segmentados
Contenedor con borde `--border`, radio 8px, `overflow:hidden`. Cada tab
`padding:6px 13px`, 12.5px/600. Activo: fondo `--ink`, texto blanco.

### Filtros conmutables
Píldoras con borde, radio 8px, `padding:6px 11px`, 12px. Activo: fondo `--ink`,
texto blanco, borde `--ink`.

### Waterfall
Filas de `padding:7px 0` con divisor: etiqueta de 220px, barra flexible de 6px
(riel `--surface-soft`, radio 3px) y valor de 92px alineado a la derecha. La
fila de total va en peso 600. Cierra con la cifra en 29px + glosa 13px.

---

## 7 · Aplicación

`src/styles.css` define los tokens y las primitivas; **los nombres de clase del
sistema anterior se conservan** (`.card`, `.badge`, `.kpi`, `.muted`, `.num`,
`.mono`, `.ghost`, `.page-head`…) y ahora resuelven a los valores de arriba, de
modo que una pantalla que solo use clases ya queda re-vestida sin tocarla.

Al portar una pantalla:
1. Quita estilos en línea que peleen con los tokens (verdes, radios de 16px,
   sombras, encabezados en mayúsculas).
2. Cambia las cajas de KPI por la franja `.kpi-strip`.
3. Pon en `.mono` todo VIN, folio, RFC, UUID y clave SAT.
4. Los `<h1>` van con su glosa al lado, no debajo.
5. Los botones secundarios son `.ghost`; el primario de la pantalla es uno solo.
