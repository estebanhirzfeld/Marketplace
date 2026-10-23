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
| Test data on the VPS (create `[TEST]` listings/operations in a given state, delete them) | `make testbed-custody` / `make testbed-clean` (see `make help` for `testbed-*`; docs in `docs/fase-15-cobro-con-reparto.md`) |

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
- **Commission is 5% / 5% split** (`COMMISSION_RATE` in `Operation.ts`). Buyer pays `finalPrice + 5%`, seller receives `finalPrice − 5%`, platform keeps 10%. Payouts are computed inside the entity whenever `finalPrice` is set — including in the constructor during rehydration — so they are never assigned from outside. The buyer chooses how to pay once the asset is in custody: **Mercado Pago** (the seller links their own account by OAuth and collects directly; the platform keeps its 10% as `marketplace_fee`, always in pesos) or **bank transfer** (in the operation's own currency, confirmed by an admin). Mercado Pago always charges in pesos, so USD operations are converted by the platform with the BCRA A3500 rate, frozen in a `SettlementQuote`. All of it is behind flags (`MERCADOPAGO_SPLIT_ENABLED`, `EXCHANGE_RATE_ENABLED`, `REQUIRE_MP_LINK_TO_PUBLISH`), off by default. PayPal was rejected over chargeback risk.
- **Contracts and NDAs are one entity** (`Contract`) with three types: `buyer_nda` (buyer + platform, unlocks confidential listing data), `seller_nda` (seller + platform, to publish), and `tripartite` (buyer + seller + platform, to close the sale). Signatures are a role array, so `isFullySigned()` is agnostic to how many parties a given type has — add a new contract type by adding a factory, not by branching on booleans. DB enforces `@@unique([listingId, signerId, type])`.
- **Blind listings**: when `Listing.isBlind` and the requester has no fully-signed `buyer_nda`, `GetListingDetailsUseCase` filters `assetData` down to the strategy's `getPublicFields()` and returns `hiddenFields[]` so the frontend knows what to blur.
- `SignContractUseCase` auto-transitions the Operation to `contract_signed` once a tripartite contract reaches full signature.

### Decided for fase 21, being implemented (`openspec/changes/handover-journey/`)

These override the rules above as each unit lands; `odd/tasks/recorrido-del-traspaso.md` tracks which ones are live.

**Website sales are paused since 22/10/2026** (`WEBSITE_SALES_ENABLED` in `apps/web/src/lib/assetAvailability.ts`): `/vender` shows the website card as «Próximamente» and publishing rejects one. The website code stays; the remaining units are built for YouTube. Research on handing over the site itself is in `odd/tasks/entrega-de-un-sitio.md`.

- **Deadline cancellation** is the only exception to "committed after signing": a seller who does not hand over within their deadline cancels the operation and the listing returns to the market; a buyer who does not pay with the asset in custody cancels it and the platform returns the asset to the seller. Manual cancellation after signing stays illegal.
- **Ready to sign** is decided per strategy (`transferReadiness`): YouTube needs the platform's 7-day manager access; a website needs its domain at Hostinger, active and 45+ days from expiry (RDAP). A website never needs `platformAccess`.
- **Bank transfer is split like Mercado Pago**: the buyer sends `sellerReceives` to the seller's own account and `platformEarns` to the platform's, uploading one receipt each; the seller confirms theirs, an admin confirms the commission. The platform never receives the seller's money (holding third-party funds would make it a PSP under BCRA rules).
- **The buyer confirms receipt** of what cannot be verified automatically, or it is deemed received at the deadline; an open claim freezes closing. `Operation.complete()` takes no admin checkboxes and runs automatically.
- **Publishing requires a signed `seller_nda`** (ownership declaration, confidentiality, non-circumvention for 6 months). A listing can be withdrawn only with no signed operation.

## Conventions

- TDD is expected. Vitest everywhere, `globals: true`. Domain tests mock the repository ports; the `packages/db` integration tests (and the API's HTTP tests) hit a real database, but never the development one: they wipe whole tables, so a `globalSetup` (`packages/db/test-support/`) points them at `marketplace_test` (derived from `DATABASE_URL`, or `TEST_DATABASE_URL` if set), creates and migrates it with `prisma migrate deploy`, and aborts the suite if the database name does not end in `_test` — each test creates its own data (no shared fixtures between tests) and uses typed value objects (`UniqueEntityID`, `Money`, `Email`), never raw strings.
- **Identifiers are English; prose is Spanish.** Every name the compiler sees — functions, methods, classes, interfaces, type aliases, object and DTO properties, variables, React components, server actions, file names — is in English. Comments, error messages, UI copy and the `docs/` write-ups are in Spanish. Match the surrounding file.
- Conventional commits. Never add `Co-Authored-By` or AI attribution.

## UI copy: register and criteria

Every user-facing string (screens, notifications, emails) follows this register. It was set by the user on 22/10/2026 by correcting the payment screen; existing copy that does not follow it gets fixed in a later phase, not ad hoc.

- **Write as the person who reads it, never as the system.** Cut whatever the reader already knows or cannot act on: "sos el comprador", the counterpart's name, status badges as a header, internal references with no explanation (`OP-3F2B…`), or notes about how the system works ("no hace falta iniciar sesión: el QR ya dice…").
- **The platform speaks in the first-person plural future:** "Te redirigiremos a Mercado Pago para realizar el pago", "te avisaremos cuando estén confirmados". Not "te llevamos" or "te avisamos".
- **Processes are stated impersonally, with nouns:** "La confirmación es manual", "La revisión es manual y puede demorar", "Luego de la acreditación, se realizará la entrega del sitio". Not "la confirmamos a mano" or "puede tardar".
- **Instructions use formal voseo and the future of obligation:** "Pagá tu compra", "Realizarás 2 transferencias", "Deberás adjuntar el comprobante", "Tenés tiempo hasta el 29 de octubre". Numbers are digits.
- **Name the object instead of a pronoun:** "¿Tenés el comprobante en tu teléfono?", not "¿Lo tenés…?".
- **Bold the data the reader acts on:** the amount, the date, the account (alias or CBU), and who the message is about when it matters ("**El comprador** recibirá el motivo").
- **Labels use the infinitive** ("Transferir exactamente"); buttons say the action ("Confirmar la acreditación", "Adjuntar comprobante").
- **Spelling is correct**, accents included ("Transferir", "realizará").
- **Every state is drawn:** loading ("Registrando tu confirmación…"), success saying what happens next and who is told, and the unhappy path. Waits end with what we will do: "te avisaremos cuando…".
- **Flows go one decision per step:** choose the method with two cards (the `/vender` pattern), then numbered steps ("Paso 1 de 2"). One attach button (the phone offers gallery or camera), always with a preview.

Skills to load before designing or writing a screen (user-level, in `~/.claude/skills/`):

- **`role-aware-ui`** — before any layout, name the role, how often it comes and the single decision it makes; cut what does not serve that decision; design the loading, empty and error states. This is what removed the status badges and the counterpart's name from the payment screen.
- **`ui-ux-pro-max`** — use it for its UX rules (contrast 4.5:1, touch targets of at least 44 px, progress shown in multi-step flows, loading feedback, visible labels) and its pre-delivery checklist. Do **not** take its palettes or styles: the app has its own identity (dark ground, `#cff245` accent, Space Grotesk and JetBrains Mono, tokens in `apps/web/src/app/globals.css`).
- Before coding the screens of a new unit, publish a design canvas round in its own folder (`design/<topic>/project/`) and wait for the user's corrections. Phase 21 canvas: `design/recorrido-traspaso/`.
- Each completed phase gets a write-up in `docs/fase-*.md`.

## Phase write-ups (`docs/fase-*.md`)

A phase is planned, discussed, then coded; the `.md` goes up when the work is done,
not while it is in progress. A phase with a decimal (`2.1`, `4.1`, `5.1`) is a
**deviation that surfaced during planning** — necessary for the parent phase but too
small to justify a phase of its own. Open a subphase instead of stretching the parent's
scope or inventing a new phase. `docs/gant.json` records every phase, its commit window
and its parent; update it when a phase closes.

Heading rules, in force for every write-up:

- A heading is a **noun phrase**. It names its subject and stops there. No moral, no
  conclusion, no colour commentary. "Métricas públicas: redondeo de `subscriberCount`"
  — not "Métricas públicas: el redondeo obliga a pensar".
- If a heading uses a colon, what follows is *which one specifically*, never *what it
  means*. Compare "Titularidad: se compara por ID, no por handle" (good) with
  "El dato que definió la arquitectura" (a teaser that hides its own subject).
- **No emoji in headings.** The `✅ Completa` / `🚧 En curso` of the status blockquote is
  not a heading and stays.
- Identifiers go in backticks, in headings too.
- One `#` H1 per document, and it follows `# Fase N — <noun phrase>`.
- No jargon or anglicisms in headings (`la VM`, not `la caja`; `desmontaje`, not
  `teardown`).

Templates to copy rather than improvise: `docs/fase-04.1-unit-of-work.md` is the cleanest
in the repo, and `docs/fase-00-scaffold.md` and `docs/fase-01-dominio.md` hold the canonical
skeleton — status blockquote, summary paragraph, `## Objetivos cumplidos`, decisions
numbered under `##`, `## Tests`, `## Deuda técnica conocida`, `## Siguiente paso`. Closing
sections are named for what they hold: `## Tests` for suite results, `## Dónde quedó cada
pieza` for the `Pieza | Dónde` map, `## Pendiente` for what remains.
