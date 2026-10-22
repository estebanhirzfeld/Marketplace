import type { PaymentReceiptDto, ReceiptRejectionCodeDto } from '@marketplace/api-contract';

/** Los motivos de rechazo, como los elige quien recibió la plata. */
export const REJECTION_LABEL: Record<ReceiptRejectionCodeDto, string> = {
    not_credited: 'Todavía no se acreditó',
    amount_mismatch: 'El monto no coincide',
    other: 'Otro motivo',
};

export const REJECTION_CODES = Object.keys(REJECTION_LABEL) as ReceiptRejectionCodeDto[];

/** Por qué se rechazó un comprobante, en una línea: el motivo y, si lo hay, el detalle. */
export function rejectionText(receipt: Pick<PaymentReceiptDto, 'rejectionCode' | 'rejectionReason'>): string {
    // Un rechazo anterior a los motivos solo tiene el texto.
    if (!receipt.rejectionCode) return receipt.rejectionReason ?? '';
    const label = REJECTION_LABEL[receipt.rejectionCode];
    if (receipt.rejectionCode === 'other' && receipt.rejectionReason) return receipt.rejectionReason;
    return receipt.rejectionReason ? `${label}: ${receipt.rejectionReason}` : label;
}
