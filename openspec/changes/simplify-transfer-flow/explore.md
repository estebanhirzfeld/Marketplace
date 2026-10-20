# Exploration — simplify-transfer-flow

Investigation of the seller-facing "Iniciar la transferencia" step and the
`contract_signed → asset_in_custody` window.

## The reframe

The step is not merely useless. The window is under-specified, and the interface
actively misleads the seller inside it.

`initiateTransfer()` (`packages/domain/src/entities/Operation.ts:464-469`) guards
on `status === 'contract_signed'` and assigns the new status. It takes no
argument and records nothing. It is the only transition method in the entity
that demands no evidence — contrast `confirmAssetCustody(data)` (`:479`),
`confirmBuyerPayment(datos)` (`:568`), `complete(data)` (`:605`).

But the seller *does* have real work in that window: promoting the platform from
administrator to primary owner (`YouTubeStrategy`, seller step 6, tagged
`afterPlatformStarts: true`). The platform physically cannot do it for them.

Two defects follow:

1. **The instruction is unreachable exactly when it applies.** It renders on
   `apps/web/src/app/activos/[id]/page.tsx:466-480` under the heading "Y MÁS
   ADELANTE, CON EL CONTRATO FIRMADO", inside a branch that only shows *before*
   platform access is registered. Access is a precondition for signing
   (`SignContractUseCase.ts:60-66` → `Listing.assertCanBeTransferred()`), so by
   the time the contract is signed the instruction has disappeared.
2. **The operation screen contradicts itself.** `queEsperar()`
   (`apps/web/src/app/operaciones/[id]/page.tsx:75-78`) tells the seller "no
   necesitamos nada más de vos por ahora", and the same screen then renders the
   button they must press (`:502-508`).

This is precisely the criterion `platform-access-role` set and did not meet
(`openspec/changes/platform-access-role/proposal.md:156`).

## Correction to the brief

`payment_pending` is ALREADY removed — union, Prisma enum and DTO are clean;
`migrations/20260830010140_remove_payment_pending/` did it, and
`docs/fase-05.1-kyc-y-deudas.md:43-51` records it as resolved. The only surviving
reference is the stale "Known gap" line in `CLAUDE.md:80`. Action: delete that
sentence. Nothing to design.

## Consumer inventory for `transfer_in_progress`

- **Hard dependency (1)**: `confirmAssetCustody()` guards on it
  (`Operation.ts:480-482`). Custody cannot be declared from `contract_signed`.
- **Soft (2)**: `declareRecipientIdentity()` state list (`Operation.ts:539-545`);
  `GetPlatformDashboardUseCase.ts:62-71` `ESPERAN_A_LA_PLATAFORMA`.
- **Real side effect (1)**: `InitiateTransferUseCase.ts:29` fires
  `PlatformNotifier.custodyNeeded()` → one `custodia_pendiente` per admin.
- **Documentation only**: `machines/OperationMachine.ts:10-11,43-52` (xstate
  documents, entities enforce).
- **Pass-through**: Prisma enum `schema.prisma:38`; `OperationMapper.ts:245,276`.
- **Cosmetic**: badge `ui.tsx:58`, `Timeline.tsx:21`, admin `PROXIMO_PASO`,
  `/sistema`, copy strings.

## Why the state cannot simply be derived

"`contract_signed` + a `platformAccess` record" does not distinguish anything:
`platformAccess` already exists at `contract_signed`, being a precondition for
signing. There IS a latent semantic difference — signed-but-not-yet-promoted vs.
seller-says-promoted — but `initiateTransfer` is self-asserted with zero
verification. The hard gate is downstream: the admin cannot truthfully set
`isPrimaryOwner: true` (`Operation.ts:488-492`) if the promotion never happened.

## Options

**A — Remove the state.** Delete the method and use case, point
`confirmAssetCustody` at `contract_signed`, drop the enum value. Migration: enum
recreation (two precedents in-repo). Costs: `custodyNeeded` must move to
`SignContractUseCase`, where it fires while the platform is actually waiting on
the *seller*; the dashboard loses that nuance; the seller's real task still has
to be surfaced somewhere.

**B — Keep the state, make the transition evidence-bearing.**
`initiateTransfer(data)` demands an attestation and records a
`TransferInitiation`. Migration: one additive nullable Json column, matching
`custodyCheck` / `recipientIdentity` / `deliveryCheck`
(`schema.prisma:203-208`). Every downstream consumer stays intact. The button
becomes a real form carrying the step-6 instruction.

**C — Collapse into `contract_signed`, track seller progress on `Listing`.**
Coherent but splits one concern across two aggregates; enum recreation plus a
`PlatformAccessRecord` change.

**D — Leave the domain, fix only the UI.** Cheapest; the "state means someone
pressed a button" critique survives.

## Recommendation

**B, folding in D's UI fix.**

1. The seller has real work in the window that the platform cannot perform, so
   A and C must resurface the instruction anyway. B is the only option that
   gives it a home *and* records it.
2. It completes an established project pattern. `docs/fase-07-contratos-y-constancias.md:15`
   converted "actos con consecuencias y sin constancia" into constancias
   (`OwnershipVerification`, `CustodyVerification`, `DeliveryVerification`).
   `initiateTransfer` is the last holdout.
3. Cheapest migration; zero rows at risk; `make fresh` untouched.
4. Answers the examiner's question — "what stops the seller clicking without
   doing anything?" — with a timestamped attestation under a KYC-verified
   identity, independently verified before custody.

Sub-decisions for propose: whether to rename the state (pulls in the enum
migration) or only its display strings; the payload shape; phrasing the evidence
generically so `WebStrategy` (no primary-owner concept) fits; fixing
`queEsperar()`; reflecting the new form on `/sistema`.

## Risks

- `asset-custody-identity` and `platform-access-role` are implemented but not
  archived, and their specs contain scenarios worded around `transfer_in_progress`
  (`asset-delivery/spec.md:34,50`, `custody-account/spec.md:125`).
- Enum removal (A/C) aborts if any live row holds the value. A fresh seed has
  none, but a manual walkthrough on the live deployment could have left one.
- The web escrow contradiction (`WebStrategy` has no platform step while
  `assertCanBeTransferred()` demands `platformAccess`) is out of scope, but the
  evidence wording must not assume a YouTube-shaped handover.

## Test blast radius

Nine files reference `initiateTransfer` / `transfer_in_progress`; most changes
are one line inside six state-walker helpers. Under B: ~6 call sites gain an
argument, plus new guard tests. Realistically 15–25 cases touched.
