# Automotriz — Dealer Management System sobre ContabilidadOS

> Living document. El plan maestro del DMS (Dealer Management System) para
> agencias automotrices en México. Se ejecuta por fases; cada fase termina en
> software en producción, no en documentos. Actualizar al cerrar cada fase.

---

## 1. Visión y posicionamiento

Un **DMS de última generación para agencias automotrices mexicanas** — nuevos,
seminuevos, refacciones, servicio y financiamiento — construido como satélite
de **ContabilidadOS**, que ya resuelve lo que ningún DMS del mercado resuelve
bien: la capa contable y fiscal mexicana (CFDI 4.0, IVA de flujo, DIOT,
nómina timbrada, conciliación bancaria, declaraciones).

**Por qué ganamos contra lo que existe (Intelisis, Karbook, CDK, Autologica,
Excel + CONTPAQi):**

1. **Contabilidad y fiscal nativos, no un bolt-on.** Cada evento de negocio
   (compra de unidad, venta, intereses de plan piso, comisión, refacción,
   orden de servicio) cae directo al libro mayor multi-tenant del hub con
   partida doble balanceada, y de ahí a IVA, ISR provisional, DIOT y
   declaración anual. La agencia no "exporta pólizas": el ERP *es* su
   contabilidad.
2. **Migración mágica.** El onboarding no es captura: la descarga masiva del
   SAT (5 ejercicios) puebla clientes, proveedores, facturas, nómina histórica
   y activos fijos desde los propios CFDIs. Una agencia entra en días, no
   meses.
3. **WhatsApp-nativo en dos frentes.** (a) Bot de *ventas* que conoce el
   inventario y las ofertas del mes y captura leads al CRM; (b) el copiloto
   contable/operativo del hub que ya existe.
4. **Rentabilidad por unidad de verdad.** Cada auto ata su CFDI de compra, sus
   costos capitalizados, su interés de plan piso devengado día a día, su ISAN,
   su comisión — y reporta utilidad real por VIN, no por promedios.

**Mercado objetivo:** los miles de agencias y grupos automotrices en México
con operaciones grandes (nuevos multi-marca, seminuevos, servicio,
refacciones, F&I). Multi-empresa y multi-RFC desde el día uno porque el hub ya
es multi-tenant (`Company`, `Despacho`, `Grupo`).

---

## 2. Arquitectura (no negociable)

Sigue al pie de la letra `docs/INTEGRATION-GUIDE-SATELLITE-APPS.md` del hub:

```
contabilidad-os (hub)                      Automotriz (este repo)
─────────────────────                      ──────────────────────
Postgres único                             React/Vite SPA
Auth único (/api/auth/token)               Sin DB propia
Ledger (AccountingEntry)                   Sin auth propio
CFDI / timbrado (Facturapi)                Sin lógica contable
Bancos + conciliación                      UI + fetch a /api/automotriz/*
Nómina, declaraciones                      Portal cliente (fase 5)
CompanyModule(AUTOMOTRIZ)  ◄── gate        Bot WhatsApp: tools en el hub
```

- **Datos del módulo viven en el hub** (`Vehiculo`, `VehiculoCosto`, luego
  refacciones/órdenes), gateados por `CompanyModule(modulo=AUTOMOTRIZ)` y
  siempre con `requireMembership` + `requireModule`.
- **Toda póliza pasa por `src/lib/accounting/postings.ts`** del hub. El
  satélite jamás escribe `AccountingEntry`.
- **Clientes, proveedores, bancos, CFDIs, empleados** son tablas canónicas del
  hub; el módulo las referencia (compraInvoiceId, ventaInvoiceId, clienteId,
  vendedorId), nunca las duplica.
- **El bot de ventas de WhatsApp** se monta sobre la infraestructura Twilio +
  `tool-executor.ts` que ya está en producción en el hub — se agregan tools de
  inventario/ofertas y un system prompt de ventas, no un canal nuevo.

---

## 3. Lo que ContabilidadOS ya nos da (no construir dos veces)

| Necesidad de la agencia | Ya existe en el hub |
|---|---|
| Importar clientes desde CFDIs | Sync SAT → `Customer` |
| Importar proveedores desde CFDIs | Sync SAT → `Supplier` |
| IVA (flujo vs devengado, acreditable/trasladado, saldos a favor) | Motor fiscal completo |
| Conciliación bancaria | Belvo + parser de estados + guardias 1-a-varios |
| Inventario de activos y depreciación | `ActivoFijo` + Art. 31/34/36 (tope automóviles) |
| Onboarding de nómina | Histórico desde CFDIs NOMINA, quincenas, incidencias, IMSS/SIPARE |
| Prefactura | `FacturaBorrador` |
| Timbrado CFDI 4.0 | Facturapi + idempotencia |
| Complementos de pago (PPD) | Detección + emisión de REPs |
| Apertura fiscal / migración | Flujo de apertura con procedencia por dato |
| WhatsApp (canal, identidad, historial) | `WhatsappLink` + webhook Twilio en prod |

**Lo nuevo del vertical:** ciclo de vida de la unidad, ISAN, plan piso,
comisiones, pedido→prefactura→factura de unidades, CRM de piso, bot de
ventas, refacciones con QR, órdenes de servicio, portal del cliente,
seminuevos (toma a cuenta), F&I.

---

## 4. Modelo de dominio (núcleo)

### 4.1 La unidad (`Vehiculo`) — el hilo conductor

Ciclo de vida: `EN_TRANSITO → DISPONIBLE → APARTADO → VENDIDO → ENTREGADO`
(+ `CANCELADO`). Cada transición postea al ledger; la máquina de estados es la
idempotencia (regla 4 de postings).

**Rentabilidad por VIN** = precio de venta (sin IVA)
− costo de compra (CFDI de la planta/proveedor, FK real)
− Σ `VehiculoCosto` (acondicionamiento, traslado, accesorios, **interés de
plan piso devengado**)
− comisión del vendedor.

- **Interés por unidad:** cada unidad conoce su línea de piso
  (`planPisoTasaAnual`, `planPisoInicio`); un cron nocturno devenga interés
  diario como `VehiculoCosto(tipo=INTERES_PISO)` + póliza de gasto financiero.
  El aging del inventario deja de ser una corazonada.
- **ISAN:** se calcula al vender unidades nuevas (`src/lib/fiscal/isan.ts` en
  el hub — tarifa Art. 3 LFISAN + exención/50% Art. 8-II, tablas por
  ejercicio actualizables por PR igual que el INPC).
- **Comisiones:** esquema por vendedor (`Employee` del hub) con reglas por
  monto/margen/unidad; la comisión liquidada viaja a nómina como concepto.

### 4.2 Ventas: pedido → prefactura → factura

`PedidoVehiculo` (fase 1) captura la negociación: unidad, cliente, precio,
accesorios, toma a cuenta (seminuevo), enganche, financiamiento. De ahí:
prefactura = `FacturaBorrador` del hub → timbrado → `ventaInvoiceId` en la
unidad. El apartado postea anticipo de cliente (cuenta 2103, ya existe).

### 4.3 Refacciones y servicio (fases 4-5)

- `Refaccion` + `RefaccionMovimiento` (kardex) con **etiquetas QR** (el hub ya
  trae `qrcode` como dependencia) para alta/salida/inventario físico con
  celular. Compras entran solas desde CFDIs de proveedor.
- `OrdenServicio` con partidas de mano de obra y refacciones, asignación de
  técnico, estados visibles al cliente (portal + WhatsApp), facturación al
  cierre. Patrón de referencia: `RestOrden`/`OrdenTrabajo` de otros módulos.

### 4.4 Seminuevos (fase 6) y F&I (fase 7)

- Compra a particulares (sin CFDI: contrato + complemento de pago plataforma),
  toma a cuenta dentro del pedido, reacondicionamiento como `VehiculoCosto`.
  ⚠️ Diseño fiscal dedicado antes de codificar: IVA en enajenación de usados
  (Art. 9-IV LIVA compra a PF, base y retenciones) — doc en `docs/` del hub.
- F&I: préstamos con tabla de amortización, interés + IVA sobre interés,
  siguiendo el blueprint `CrediproLoan` de la guía de satélites; seguros y
  comisiones por colocación.

---

## 5. Fases de ejecución

> Regla: cada fase entrega un flujo completo usable en producción, con script
> de validación de pólizas pasando antes de tocar frontend (guía §4.4).

### Fase 0 — Fundación (este PR) ✅
- Hub: enum `AUTOMOTRIZ` (ModuloApp + EntrySource), modelos `Vehiculo` +
  `VehiculoCosto`, cuentas contables del módulo, helpers de póliza
  (compra/costo/venta), calculadora ISAN con tests, endpoints
  `/api/automotriz/vehiculos` (+ `recibir`, `costos`, `vender` como proof
  flow), matcher CORS, script `validate-automotriz-postings.mjs`.
- Satélite: scaffold Vite/React con los 5 archivos de la guía, login,
  selector de empresa, página de Inventario y detalle de unidad con
  rentabilidad por VIN.

### Fase 1 — Ciclo de venta de nuevos, completo
- `PedidoVehiculo` (negociación: accesorios, enganche, toma a cuenta,
  financiamiento externo), apartado con anticipo posteado.
- Prefactura vía `FacturaBorrador` → timbrado → liga `ventaInvoiceId`;
  desglose ISAN en el CFDI de venta.
- Cron devengo diario de interés de plan piso + captura de línea de crédito
  de piso por unidad/lote.
- Motor de comisiones v1 (reglas por vendedor, liquidación a nómina).
- Reporte: utilidad por VIN, aging de inventario, interés acumulado por unidad.

### Fase 2 — CRM de piso
- Leads (origen: piso, teléfono, WhatsApp, marketplace), pipeline de
  seguimiento, citas de prueba de manejo, cotizaciones PDF, asignación y
  métricas por vendedor (closing rate, tiempo de respuesta).
- El lead se convierte en `Customer` canónico al cotizar/facturar.

### Fase 3 — Bot de ventas por WhatsApp
- Tools nuevos en el hub: `query_inventario_disponible`,
  `query_ofertas_del_mes`, `crear_lead`, `agendar_cita`.
- `OfertaMensual` (unidad/modelo, precio especial, vigencia) administrada
  desde el satélite; el bot solo ofrece lo vigente y lo disponible.
- Handoff a vendedor humano con contexto; todo lead cae al CRM (fase 2).
- Mismas reglas de seguridad del hub: caller ID ≠ identidad; solo lectura +
  captura de lead; nada de datos sensibles por WhatsApp.

### Fase 4 — Refacciones con QR
- `Refaccion`, ubicaciones, kardex, mín/máx, valuación (costo promedio).
- Etiquetado QR e inventario físico desde el celular.
- Entrada automática desde CFDIs de compra de proveedor; salida por venta de
  mostrador (factura) o por orden de servicio (fase 5).

### Fase 5 — Servicio + portal del cliente
- Citas, recepción con inventario del vehículo, `OrdenServicio` (mano de obra
  + refacciones), tablero de técnicos, cierre → factura.
- Portal del cliente (ruta pública con token, patrón `PurifPortalAccount`):
  estado de la orden, aprobación de trabajos adicionales, historial; avisos
  por WhatsApp ("tu auto está listo").

### Fase 6 — Seminuevos
- Doc de diseño fiscal (IVA usados, compra a PF) → compra directa y toma a
  cuenta, avalúo, reacondicionamiento, publicación e inventario dedicado.

### Fase 7 — F&I (financiamiento y seguros)
- Préstamos con amortización (blueprint CrediproLoan), devengo de intereses,
  IVA sobre intereses, cobranza conciliada con bancos; seguros y comisiones.

### Fase 8 — Estado del arte
- Analytics de grupo (multi-agencia, multi-RFC vía `Grupo`/`Despacho`),
  presupuestos vs real por departamento, integración fábricas/DMS legados,
  app de piso para vendedores, IA de pricing de seminuevos.

---

## 6. Migración / onboarding de una agencia (playbook)

1. Alta de `Company` + FIEL → descarga masiva SAT (5 ejercicios).
2. Clientes y proveedores poblados desde CFDIs; nómina histórica desde CFDIs
   NOMINA; `ActivoFijo` desde CFDIs de inversión; apertura fiscal firmada.
3. Belvo / carga de estados → conciliación al día.
4. Alta de inventario inicial de unidades: import por lote (VIN, CFDI de
   compra matcheado por UUID cuando exista) + refacciones por CFDIs.
5. Habilitar `CompanyModule(AUTOMOTRIZ)` → satélite listo.

## 7. Decisiones abiertas

- Valores ISAN por ejercicio: confirmar contra Anexo 15 RMF / DOF antes de
  activar timbrado con ISAN (mismo mecanismo de actualización que INPC).
- Refacciones: ¿costo promedio o PEPS? (SAT acepta ambos; promedio es más
  simple con entradas por CFDI).
- Toma a cuenta de seminuevos: tratamiento de la permuta en CFDI (dos
  operaciones espejo) — resolver en el doc fiscal de fase 6.
- Plan piso: ¿línea por unidad o por lote con prorrateo? (v1: tasa por
  unidad, capturada al recibirla).
- Bot de ventas: ¿número de WhatsApp separado del copiloto contable por
  empresa? (probable sí: audiencias distintas, templates distintos).
