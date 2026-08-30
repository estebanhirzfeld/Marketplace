# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Marketplace for digital assets (YouTube channels, websites, social accounts) — thesis project. The platform is an intermediary: it holds the asset in escrow, mediates contracts and NDAs, and takes a commission from both sides. Turborepo + pnpm workspaces. Backend/domain is built out; the API and web apps are still skeletons.

## Commands

The `Makefile` is the sanctioned entry point — `make help` lists every target.

| Task | Command |
|---|---|
| DB up/down | `make up` / `make down` |
| Install + generate Prisma client | `make install` |
| Clean environment with seed data | `make fresh` (up + `db:push` + seed) |
| All tests | `make test` |
| Domain unit tests only (no DB) | `make test-domain` |
| DB integration tests (needs DB) | `make test-db` |
| Reset DB + migrations + seed | `make db-reset` |
| Prisma Studio | `make db-studio` |

Single test file / single case:
```bash
pnpm --filter @marketplace/domain exec vitest run tests/Operation.test.ts
pnpm --filter @marketplace/domain exec vitest run -t "no es el turno"
```

Gotchas that will cost time otherwise:
- **Postgres runs on `localhost:5434`** (`docker-compose.yml` maps `5434:5432`). Two earlier ports were lost to collisions: 5432 to the native macOS Postgres, then 5433 to another project's container (`agency-meli-core-db-1`). When a collision happens the symptom is misleading — another Postgres answers and rejects the credentials, so you get `P1010` / `28P01 password authentication failed` rather than "connection refused". Before believing an auth error, check who actually holds the port: `lsof -nP -iTCP:5434 -sTCP:LISTEN` and `docker ps -a`.
- **`DATABASE_URL` lives in `packages/db/.env`**, not the repo root. Both `prisma.config.ts` and the db vitest setup load `dotenv/config` with cwd = `packages/db`. There is no `.env.example` committed.
- **All Prisma commands must be filtered to the db package**: `pnpm --filter @marketplace/db db:generate`. Running `prisma` from the root fails.
- `prisma migrate reset` needs `--force` here (already in the `db:reset` script) — Turborepo swallows interactive prompts and the command exits 130.
- `pnpm lint` only does anything in `apps/web`; the other packages have no lint script.

## Architecture

Hexagonal / DDD. Dependency direction is strictly `apps/*` → `packages/db` → `packages/domain`. The domain has zero infrastructure imports.

**`packages/domain`** — the business core, and where almost all the real logic lives.
- `entities/` — `User`, `Listing`, `Operation`, `Contract`, all extending `Entity<T>`. Every entity has two factories: `create()` for a genuinely new aggregate (sets defaults, e.g. a `Listing` always starts in `draft`) and `reconstitute()` to rehydrate from persistence without clobbering stored state. Never add defaults to `reconstitute()`.
- `Entity.toSnapshot()` is the only way to read raw props. Its doc comment says "mappers only", and mappers are its intended consumer — but use cases currently also call it as a read escape hatch (`CreateOfferUseCase`, `GetListingDetailsUseCase`). Prefer adding a getter or a behavior method on the entity over reaching for `toSnapshot()` in new use-case code.
- `value-objects/` — `Money` (integer cents only; the constructor throws on non-integers, and `subtract` throws on overdraft), `Email`, `UniqueEntityID`.
- `strategies/` — `IAssetStrategy` with `YouTubeStrategy`, `WebStrategy`, `SocialStrategy`. Each one owns its own valuation formula (`calculateEstimatedPrice()`), its transfer checklist (`getTransferSteps()`), and — critically — which of its fields are public vs. confidential for blind listings.
- `use-cases/` — 16 application services in four flow folders (`listing/`, `negotiation/`, `contract/`, `operation/`). They orchestrate only: load through a repository port, call an entity method, save. Business rules and state guards belong in the entity, not here.
- `ports/Repositories.ts` — the four repository interfaces implemented in `packages/db`.
- `machines/` — xstate v5 machines for `Listing` and `Operation`. They document the lifecycles; the entities enforce them independently.
- Tests live in `packages/domain/tests/`, mirroring `src/use-cases/` with **one test file per flow**, not per use case.

**`packages/db`** — Prisma v7 with the `prisma-client` generator (output: `generated/prisma`, gitignored-ish generated code) over the `@prisma/adapter-pg` driver adapter. Note `schema.prisma`'s `datasource` block has **no `url`** — Prisma v7 takes it from `prisma.config.ts`. Money columns are `Int` cents; `assetData` and `signatures` are `Json`. Consumed as raw TypeScript (`main: src/index.ts`), no build step.

**`packages/shared-types`** — cross-boundary enums (`AssetType`, `UserRole`).

**`apps/api`** — Fastify + fastify-cli, currently a one-route skeleton. **`apps/web`** — Next.js 16 / React 19 / Tailwind 4; per `apps/web/AGENTS.md`, this Next.js has breaking changes vs. training data, so read `node_modules/next/dist/docs/` before writing Next.js code.

### Cross-package imports

There are no barrel files in `packages/domain`. Everything imports through deep source paths — `@marketplace/domain/src/entities/Listing`, `@marketplace/domain/src/value-objects/Money` — resolved via the pnpm workspace symlink straight to `.ts`. Match this style; don't introduce an `index.ts` barrel without deciding what it means for the (currently unused) `dist` builds.

### Adding a new asset type

It touches four places and will fail at runtime if you miss the mapper:
1. `AssetType` enum in `packages/shared-types/src/index.ts`
2. `AssetType` enum in `packages/db/prisma/schema.prisma` (then `make db-push`)
3. A new `IAssetStrategy` implementation in `packages/domain/src/strategies/`
4. The `hydrateStrategy()` switch in `packages/db/src/mappers/ListingMapper.ts` — this is the only thing that turns a persisted `assetType` + `assetData` JSON blob back into a strategy object, and its `default` branch throws.

## Domain rules (already decided — implement against these, don't redesign)

- **Escrow ordering is asset-first**: `contract_signed → transfer_in_progress → asset_in_custody → payment_received → completed`. The platform takes custody of the asset *before* the buyer pays. `Operation.confirmBuyerPayment()` explicitly rejects payment while the asset is not in custody.
- **Cancellation** is only legal in `offer_sent`, `negotiating`, or `contract_pending`. After the contract is signed, both parties are committed.
- **Negotiation** is a bidirectional counter-offer log: `Operation.props.negotiations` is an append-only `Negotiation[]`, and whose turn it is (`pendingResponseFrom`) is *derived* from the last entry, never stored. There is no reject — parties counter or cancel. Use `acceptCurrentOffer(by)`; the price comes from the log, not from the caller.
- **Hybrid multi-offer**: many buyers can hold live `Operation`s on one `Listing` simultaneously. `AcceptOfferUseCase` implements the cascade — accepting one offer cancels every other non-cancelled Operation on that listing and moves the `Listing` to `in_operation`.
- **Commission is 5% / 5% split** (`COMMISSION_RATE` in `Operation.ts`). Buyer pays `finalPrice + 5%`, seller receives `finalPrice − 5%`, platform keeps 10%. Payouts are computed inside the entity whenever `finalPrice` is set — including in the constructor during rehydration — so they are never assigned from outside. Bank transfer only; PayPal was rejected over chargeback risk.
- **Contracts and NDAs are one entity** (`Contract`) with three types: `buyer_nda` (buyer + platform, unlocks confidential listing data), `seller_nda` (seller + platform, to publish), and `tripartite` (buyer + seller + platform, to close the sale). Signatures are a role array, so `isFullySigned()` is agnostic to how many parties a given type has — add a new contract type by adding a factory, not by branching on booleans. DB enforces `@@unique([listingId, signerId, type])`.
- **Blind listings**: when `Listing.isBlind` and the requester has no fully-signed `buyer_nda`, `GetListingDetailsUseCase` filters `assetData` down to the strategy's `getPublicFields()` and returns `hiddenFields[]` so the frontend knows what to blur.
- `SignContractUseCase` auto-transitions the Operation to `contract_signed` once a tripartite contract reaches full signature.

Known gap: `payment_pending` exists in the `OperationStatus` union and the Prisma enum but no transition ever produces it.

## Conventions

- TDD is expected. Vitest everywhere, `globals: true`. Domain tests mock the repository ports; `packages/db/tests/integration.test.ts` hits a real database — each test creates its own data (no shared fixtures between tests) and uses typed value objects (`UniqueEntityID`, `Money`, `Email`), never raw strings.
- Code, comments, docs, and error messages in this repo are Spanish. Match the surrounding file.
- Conventional commits. Never add `Co-Authored-By` or AI attribution.
- Each completed phase gets a write-up in `docs/fase-*.md`.
