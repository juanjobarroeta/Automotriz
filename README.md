# Automotriz — DMS satélite de ContabilidadOS

SPA React/Vite para agencias automotrices. **No tiene base de datos, ni auth,
ni lógica contable propia** — todo vive en el hub
[contabilidad-os](../contabilidad-os) detrás de
`CompanyModule(modulo=AUTOMOTRIZ)`. Ver [ROADMAP.md](./ROADMAP.md) para el
plan maestro por fases y la arquitectura completa.

## Correr en desarrollo

```bash
npm install
cp .env.example .env   # apunta VITE_API_URL al hub (default: localhost:3000)
npm run dev            # http://localhost:5173
```

Requisitos en el hub:
1. `AUTOMOTRIZ` habilitado en al menos una empresa
   (`CompanyModule(companyId, modulo=AUTOMOTRIZ)`).
2. El origen del satélite en `API_ALLOWED_ORIGINS`
   (`http://localhost:5173` en dev).

Login con las credenciales de contabilidad-os (`POST /api/auth/token`).

## Qué hay hoy (fase 0)

- Inventario de unidades con filtro por estado y alta de unidad.
- Detalle de unidad: recibir (postea inventario al ledger), costos
  (acondicionamiento / traslado / accesorios / interés de plan piso) y venta
  con ISAN + IVA + pólizas automáticas.
- Rentabilidad por VIN: precio − costo − costos adicionales − comisión.

## Estructura

```
src/
  config/api.js        # fetch con bearer token (guía de satélites §5.2)
  auth/AuthContext.jsx # login, empresas, empresa activa
  components/Layout.jsx
  pages/Inventario.jsx
  pages/VehiculoDetalle.jsx
```
