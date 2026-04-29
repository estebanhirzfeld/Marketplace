import { createMachine } from 'xstate';

/**
 * Máquina de estados de una Operation.
 *
 * Flujo completo (Opción 2 — escrow de activo):
 *   offer_sent → negotiating ↔ (contraofertas)
 *   offer_sent / negotiating → contract_pending (seller acepta)
 *   contract_pending → contract_signed (ambas partes + plataforma firman)
 *   contract_signed → transfer_in_progress (seller inicia transferencia del activo a la plataforma)
 *   transfer_in_progress → asset_in_custody (plataforma confirma recepción del activo)
 *   asset_in_custody → payment_received (buyer paga a la plataforma vía transferencia bancaria)
 *   payment_received → completed (plataforma paga al seller y transfiere activo al buyer)
 *
 * Cancelación posible hasta contract_pending. Después, ambas partes están comprometidas.
 */
export const operationMachine = createMachine({
    id: 'operation',
    initial: 'offer_sent',
    states: {
        offer_sent: {
            on: {
                COUNTER_OFFER: 'negotiating',
                ACCEPT_OFFER: 'contract_pending',
                REJECT_OFFER: 'cancelled',
                TIMEOUT: 'cancelled'
            }
        },
        negotiating: {
            on: {
                ACCEPT_OFFER: 'contract_pending',
                COUNTER_OFFER: 'negotiating',
                REJECT_OFFER: 'cancelled'
            }
        },
        contract_pending: {
            on: {
                ALL_PARTIES_SIGN: 'contract_signed',
                CANCEL: 'cancelled',
                TIMEOUT: 'cancelled'
            }
        },
        contract_signed: {
            on: {
                INITIATE_TRANSFER: 'transfer_in_progress'
            }
        },
        transfer_in_progress: {
            on: {
                CONFIRM_ASSET_CUSTODY: 'asset_in_custody'
            }
        },
        asset_in_custody: {
            on: {
                CONFIRM_BUYER_PAYMENT: 'payment_received'
            }
        },
        payment_received: {
            on: {
                CONFIRM_COMPLETION: 'completed'
            }
        },
        completed: {
            type: 'final'
        },
        cancelled: {
            type: 'final'
        }
    }
});
