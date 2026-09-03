import { describe, it, expect } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';

/**
 * Confirmar custodia era un admin apretando un botón, sin constancia de qué
 * había verificado. Ahora exige un registro.
 *
 * La regla más importante sale de la investigación de la API: YouTube exige
 * haber sido propietario durante 7 días antes de poder volverse propietario
 * principal. Mientras tanto el vendedor sigue siendo el principal y conserva
 * la facultad de expulsar a la plataforma. La custodia NO es efectiva hasta
 * que el cambio de propietario principal se completa, y por eso la entidad
 * rechaza declararla antes.
 */

const ADMIN = new UniqueEntityID();

function unaOperacionEnTransferencia(): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: new UniqueEntityID(),
        sellerId: new UniqueEntityID(),
        offerPrice: Money.fromCents(1_500_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract();
    op.initiateTransfer();
    return op;
}

function unaVerificacion(over: Partial<Parameters<Operation['confirmAssetCustody']>[0]> = {}) {
    return {
        verifiedBy: ADMIN,
        isPrimaryOwner: true,
        accessSecured: true,
        metrics: { subscribers: 55000, views: 1_200_000 },
        ...over,
    };
}

describe('Operation.confirmAssetCustody — exige constancia', () => {
    it('confirma la custodia y guarda el registro', () => {
        const op = unaOperacionEnTransferencia();

        op.confirmAssetCustody(unaVerificacion());

        expect(op.status).toBe('asset_in_custody');
        expect(op.custodyVerification).toBeDefined();
        expect(op.custodyVerification?.verifiedBy.toString()).toBe(ADMIN.toString());
    });

    it('registra el momento de la verificación', () => {
        const op = unaOperacionEnTransferencia();

        op.confirmAssetCustody(unaVerificacion());

        expect(op.custodyVerification?.verifiedAt).toBeInstanceOf(Date);
    });

    it('guarda la foto de las métricas del momento', () => {
        const op = unaOperacionEnTransferencia();

        op.confirmAssetCustody(unaVerificacion({ metrics: { subscribers: 55000 } }));

        expect(op.custodyVerification?.metrics.subscribers).toBe(55000);
    });

    it('acepta notes libres del verificador', () => {
        const op = unaOperacionEnTransferencia();

        op.confirmAssetCustody(unaVerificacion({ notes: 'Sin strikes activos.' }));

        expect(op.custodyVerification?.notes).toBe('Sin strikes activos.');
    });
});

describe('La custodia no es efectiva sin propiedad principal', () => {
    /**
     * El hallazgo de la investigación, convertido en invariante: pedirle el
     * pago al comprador mientras el vendedor todavía puede expulsar a la
     * plataforma expondría al comprador exactamente al riesgo que el escrow
     * existe para eliminar.
     */
    it('rechaza confirmar si la plataforma todavía no es propietaria principal', () => {
        const op = unaOperacionEnTransferencia();

        expect(() =>
            op.confirmAssetCustody(unaVerificacion({ isPrimaryOwner: false })),
        ).toThrow(InvalidStateError);

        expect(op.status).toBe('transfer_in_progress');
    });

    it('rechaza confirmar sin los accesos asegurados', () => {
        const op = unaOperacionEnTransferencia();

        expect(() =>
            op.confirmAssetCustody(unaVerificacion({ accessSecured: false })),
        ).toThrow(InvalidStateError);
    });

    it('rechaza un registro sin quién verificó', () => {
        const op = unaOperacionEnTransferencia();

        expect(() =>
            op.confirmAssetCustody(unaVerificacion({ verifiedBy: undefined as never })),
        ).toThrow(ValidationError);
    });
});

describe('Estado previo', () => {
    it('sigue rechazando la confirmación si no hay transferencia en curso', () => {
        const op = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(1_000_000, 'USD'),
        });

        expect(() => op.confirmAssetCustody(unaVerificacion())).toThrow(InvalidStateError);
    });

    it('no deja confirmar dos veces', () => {
        const op = unaOperacionEnTransferencia();
        op.confirmAssetCustody(unaVerificacion());

        expect(() => op.confirmAssetCustody(unaVerificacion())).toThrow(InvalidStateError);
    });
});

describe('El pago solo se pide con la custodia registrada', () => {
    it('confirmar el pago después de una custodia verificada funciona', () => {
        const op = unaOperacionEnTransferencia();
        op.confirmAssetCustody(unaVerificacion());

        expect(() => op.confirmBuyerPayment(unPagoDe(op))).not.toThrow();
        expect(op.status).toBe('payment_received');
    });
});


describe('CustodyVerification congela la cuenta de custodia de origen', () => {
    /**
     * La constancia guarda desde qué cuenta salió el activo. Es una copia: si
     * más tarde el listing revoca y vuelve a registrar el acceso apuntando a
     * otra cuenta, esta constancia no cambia. Quién resuelve cuál era la cuenta
     * vigente es el use case —cruza a `Listing`—; la entidad solo la recibe y
     * la guarda.
     */
    it('guarda el custodyAccountId que le pasa quien confirma', () => {
        const op = unaOperacionEnTransferencia();
        const cuenta = new UniqueEntityID();

        op.confirmAssetCustody(unaVerificacion({ custodyAccountId: cuenta }));

        expect(op.custodyVerification?.custodyAccountId?.toString()).toBe(cuenta.toString());
    });

    it('sigue aceptando una confirmación sin cuenta (constancias previas)', () => {
        const op = unaOperacionEnTransferencia();

        op.confirmAssetCustody(unaVerificacion());

        expect(op.custodyVerification?.custodyAccountId).toBeUndefined();
    });
});

/** El pago que una operación espera: exactamente lo que el comprador debe. */
function unPagoDe(op: Operation) {
    return {
        provider: 'transferencia' as const,
        method: 'transferencia_bancaria',
        amountCents: op.buyerPays!.getCents(),
        currency: op.buyerPays!.getCurrency(),
    };
}
