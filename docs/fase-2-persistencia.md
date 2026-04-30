# Bitácora de Desarrollo - Fase 2: Persistencia

Esta fase se centró en la transición del dominio puro a una arquitectura con persistencia real utilizando **Prisma v7** y **PostgreSQL**, manteniendo la integridad de la Arquitectura Hexagonal.

## 🎯 Objetivos Cumplidos
- Implementación del paquete compartido `@marketplace/db`.
- Definición del esquema de base de datos basado en los Agregados del Dominio.
- Creación de Mappers para transformar modelos de DB en Entidades de Dominio (y viceversa).
- Configuración de infraestructura con Docker Compose.

## 🛠 Decisiones Técnicas y Arquitectura

### 1. Desacoplamiento (Mappers & Repositories)
Para que el Dominio no dependa de Prisma, implementamos el patrón **Mapper**. 
- **Domain → DB**: Las entidades ahora tienen un método `toSnapshot()` que expone los datos crudos.
- **DB → Domain**: Se usa el método `reconstitute()` de las entidades para recrearlas con su estado e identidad originales.

### 2. Cambios en el Modelo de Dominio
- **Contract unificado**: Se eliminó la entidad `NDA` por completo. Ahora existe una sola entidad `Contract` con 3 tipos: `buyer_nda`, `seller_nda`, `tripartite`.
  - **Tell, Don't Ask**: En vez de 3 booleanos fijos (`signedByBuyer`, `signedBySeller`, `signedByPlatform`), cada contrato tiene un array de `Signature[]` con solo las partes que le corresponden. Se usa `contract.sign(role, ip)` sin preguntarle al contrato qué tipo es.
  - **Factory methods**: `Contract.createBuyerNda()`, `Contract.createSellerNda()`, `Contract.createTripartite()` — cada uno inicializa las firmas correctas.
  - Los NDAs se relacionan al `Listing` (pre-operación), el tripartito a la `Operation`.
- **Money**: Todos los valores monetarios se almacenan como `Int` (centavos) en PostgreSQL para evitar errores de redondeo de punto flotante.
- **`signaturitId` → `externalSignatureId`**: Agnóstico al proveedor de firmas.

### 3. Infraestructura y Docker
- **Puerto 5433**: Se cambió el mapeo de puertos de PostgreSQL a `5433:5432`. Esto es vital para evitar conflictos si ya tenés un Postgres corriendo nativo en el puerto default (5432).
- **Prisma v7**: Usamos la nueva configuración `prisma.config.ts` y el generador apunta a una carpeta local dentro del paquete para evitar problemas de resolución de tipos en el monorepo.

## 🚀 Guía para el Coworker

Si te bajás estos cambios, seguí estos pasos para tener el ambiente listo:

1.  **Instalar dependencias**:
    ```bash
    pnpm install
    ```
2.  **Levantar la DB**:
    ```bash
    docker compose up -d
    ```
    *Nota: Chequeá que el puerto 5433 esté libre.*
3.  **Generar el Cliente de Prisma**:
    ```bash
    pnpm --filter @marketplace/db db:generate
    ```
4.  **Sincronizar el Schema**:
    ```bash
    pnpm --filter @marketplace/db db:push
    ```
5.  **Explorar datos**:
    ```bash
    pnpm --filter @marketplace/db db:studio
    ```

## ⚠️ Deuda Técnica / Pendientes
- Las estrategias `WebStrategy` y `SocialStrategy` siguen usando cálculos base; falta refinarlos con métricas reales.
- Falta implementar los tests de integración de los Repositorios de Prisma (CRUD round-trip).

---
*Bitácora generada por Antigravity - Pair Programming Session*
