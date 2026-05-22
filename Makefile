# ═══════════════════════════════════════════════════════════
# Marketplace — Makefile
# ═══════════════════════════════════════════════════════════
# Uso: make <comando>
# Ayuda: make help

.PHONY: help install up down restart db-generate db-push db-migrate db-seed db-studio db-reset db-psql test test-domain test-db

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

test: ## Ejecuta TODOS los tests (dominio + integración)
	pnpm --filter @marketplace/domain test
	pnpm --filter @marketplace/db test

test-domain: ## Ejecuta solo tests de dominio
	pnpm --filter @marketplace/domain test

test-db: ## Ejecuta solo tests de integración (requiere DB)
	pnpm --filter @marketplace/db test

# ── Dev ──────────────────────────────────────────────────

dev: up ## Levanta todo el entorno de desarrollo
	@echo "✅ DB corriendo en localhost:5433"
	@echo "→  make db-studio  para ver los datos"
	@echo "→  make test        para correr tests"

fresh: up db-push db-seed ## Setup limpio: levanta DB, sincroniza schema, carga seeds
	@echo "✅ Entorno listo con datos de ejemplo"
