# ═══════════════════════════════════════════════════════════
# Marketplace — Makefile
# ═══════════════════════════════════════════════════════════
# Uso: make <comando>
# Ayuda: make help

.PHONY: help install up down restart db-generate db-push db-migrate db-seed db-studio db-reset db-psql test test-domain test-db test-api api web front env-check testbed-users testbed-published testbed-offer testbed-contract testbed-custody testbed-status testbed-clean

# ── Setup ────────────────────────────────────────────────

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Instala dependencias + genera cliente Prisma
	pnpm install
	pnpm --filter @marketplace/db db:generate

# ── Docker ───────────────────────────────────────────────

up: ## Levanta PostgreSQL (docker compose)
	docker compose up -d

down: ## Baja los contenedores
	docker compose down

restart: down up ## Reinicia los contenedores

# ── Base de Datos ────────────────────────────────────────

db-generate: ## Regenera el cliente Prisma desde el schema
	pnpm --filter @marketplace/db db:generate

db-push: ## Sincroniza el schema con la DB (sin migración)
	pnpm --filter @marketplace/db db:push

db-migrate: ## Crea y aplica una migración nueva
	pnpm --filter @marketplace/db db:migrate

db-seed: ## Carga datos de ejemplo en la DB
	pnpm --filter @marketplace/db db:seed

db-studio: ## Abre Prisma Studio (UI visual de la DB)
	pnpm --filter @marketplace/db db:studio

db-reset: ## Resetea la DB y re-aplica migraciones + seed
	pnpm --filter @marketplace/db db:reset

db-psql: ## Abre una consola psql contra la DB
	docker exec -it $$(docker compose ps -q db) psql -U marketplace -d marketplace_dev

# ── Tests ────────────────────────────────────────────────

test: ## Ejecuta TODOS los tests (dominio + integración + API)
	pnpm --filter @marketplace/domain test
	pnpm --filter @marketplace/db test
	pnpm --filter @marketplace/api-client test
	pnpm --filter @marketplace/api test

test-domain: ## Ejecuta solo tests de dominio
	pnpm --filter @marketplace/domain test

test-db: ## Ejecuta solo tests de integración (requiere DB)
	pnpm --filter @marketplace/db test

test-api: ## Ejecuta solo tests HTTP de la API (requiere DB)
	pnpm --filter @marketplace/api test

api: ## Levanta solo la API (http://localhost:3001)
	pnpm --filter @marketplace/api dev

web: ## Levanta solo el front (http://localhost:3000)
	pnpm --filter web dev

front: up ## Levanta DB + API + front, todo junto
	@echo "→  API   http://localhost:3001"
	@echo "→  Front http://localhost:3000"
	@echo "→  Sistema de diseño: http://localhost:3000/sistema"
	@echo ""
	pnpm exec turbo dev --filter=@marketplace/api --filter=web

env-check: ## Verifica que existan los .env necesarios
	@test -f packages/db/.env    && echo "✓ packages/db/.env"    || echo "✗ FALTA packages/db/.env"
	@test -f apps/api/.env       && echo "✓ apps/api/.env"       || echo "✗ FALTA apps/api/.env (DATABASE_URL + JWT_SECRET)"
	@test -f apps/web/.env.local && echo "✓ apps/web/.env.local" || echo "✗ FALTA apps/web/.env.local (API_URL)"

# ── Dev ──────────────────────────────────────────────────

dev: up ## Levanta todo el entorno de desarrollo
	@echo "✅ DB corriendo en localhost:5434"
	@echo "→  make db-studio  para ver los datos"
	@echo "→  make test        para correr tests"

fresh: up db-push db-seed ## Setup limpio: levanta DB, sincroniza schema, carga seeds
	@echo "✅ Entorno listo con datos de ejemplo"

# ── Testbed (datos de prueba en la VPS) ──────────────────
# Crea activos y operaciones marcados con "[TEST] " usando usuarios EXISTENTES,
# siempre a través de la API real, y los borra con `testbed-clean`.
# Opcionales: TYPE=youtube|web  PRICE=<centavos>  CURRENCY=ARS|USD
# Entorno: TESTBED_HOST, TESTBED_SELLER_EMAIL, TESTBED_BUYER_EMAIL, TESTBED_ADMIN_EMAIL
# Detalle en docs/fase-15-cobro-con-reparto.md ("Datos de prueba en la VPS").

TESTBED = node scripts/testbed/cli.mjs
TESTBED_UP_FLAGS = $(if $(TYPE),--type $(TYPE)) $(if $(PRICE),--price $(PRICE)) $(if $(CURRENCY),--currency $(CURRENCY))

testbed-users: ## Testbed: muestra los usuarios que se usan (id, rol, KYC)
	$(TESTBED) list-users

testbed-published: ## Testbed: crea un activo [TEST] publicado
	$(TESTBED) up --state published $(TESTBED_UP_FLAGS)

testbed-offer: ## Testbed: crea un activo [TEST] con una oferta enviada
	$(TESTBED) up --state offer $(TESTBED_UP_FLAGS)

testbed-contract: ## Testbed: crea una operación [TEST] con el contrato firmado
	$(TESTBED) up --state contract_signed $(TESTBED_UP_FLAGS)

testbed-custody: ## Testbed: crea una operación [TEST] en custodia, lista para pagar
	$(TESTBED) up --state in_custody $(TESTBED_UP_FLAGS)

testbed-status: ## Testbed: cuenta y lista lo marcado como [TEST] en la VPS
	$(TESTBED) status

testbed-clean: ## Testbed: borra TODO lo marcado como [TEST] (pide confirmación)
	$(TESTBED) clean $(if $(YES),--yes)
