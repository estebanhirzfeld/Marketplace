import { describe, it, expect } from 'vitest';
import { Contract } from '../src/entities/Contract';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';
import { hashDocument } from '../src/services/DocumentHash';

/**
 * Antes de esto, firmar registraba rol, IP y fecha — pero no existía ningún
 * documento al que la firma se refiriera. El sistema guardaba "el comprador
 * firmó desde 190.1.2.3", sin poder responder **qué** firmó.
 *
 * Un contrato sin documento adjunto no se puede firmar. Y cada firma queda
 * atada al hash del documento vigente, así que si el texto cambiara después,
 * la firma deja de corresponderle.
 */

const HASH = 'a'.repeat(64);
const OTRO_HASH = 'b'.repeat(64);

function unTripartito(): Contract {
    return Contract.createTripartite(new UniqueEntityID(), new UniqueEntityID());
}

describe('Contract — no se firma lo que no existe', () => {
    it('un contrato nace sin documento', () => {
        expect(unTripartito().documentHash).toBeUndefined();
    });

    it('firmar sin documento adjunto es un error', () => {
        expect(() => unTripartito().sign('buyer', '1.1.1.1')).toThrow(InvalidStateError);
    });

    it('con el documento adjunto, la firma pasa', () => {
        const c = unTripartito();
        c.attachDocument(HASH);

        expect(() => c.sign('buyer', '1.1.1.1')).not.toThrow();
    });
});

describe('Contract.attachDocument', () => {
    it('rechaza un hash que no es SHA-256 en hexadecimal', () => {
        expect(() => unTripartito().attachDocument('corto')).toThrow(ValidationError);
        expect(() => unTripartito().attachDocument('z'.repeat(64))).toThrow(ValidationError);
    });

    it('normaliza el hash a minúsculas', () => {
        const c = unTripartito();
        c.attachDocument('A'.repeat(64));

        expect(c.documentHash).toBe('a'.repeat(64));
    });

    /**
     * Cambiar el documento después de que alguien firmó invalidaría esa firma
     * en silencio: habría firmado un texto que ya no es el vigente.
     */
    it('no deja reemplazar el documento si ya hay una firma', () => {
        const c = unTripartito();
        c.attachDocument(HASH);
        c.sign('buyer', '1.1.1.1');

        expect(() => c.attachDocument(OTRO_HASH)).toThrow(InvalidStateError);
    });

    it('sí deja reemplazarlo mientras nadie firmó', () => {
        const c = unTripartito();
        c.attachDocument(HASH);

        expect(() => c.attachDocument(OTRO_HASH)).not.toThrow();
        expect(c.documentHash).toBe(OTRO_HASH);
    });
});

describe('Contract — la firma queda atada al documento', () => {
    it('cada firma guarda el hash que estaba vigente', () => {
        const c = unTripartito();
        c.attachDocument(HASH);
        c.sign('buyer', '1.1.1.1');

        const firma = c.signatures.find((s) => s.role === 'buyer');
        expect(firma?.documentHash).toBe(HASH);
    });

    it('reconoce si el documento sigue siendo el que se firmó', () => {
        const c = unTripartito();
        c.attachDocument(HASH);
        c.sign('buyer', '1.1.1.1');
        c.signAsPlatform();

        expect(c.signaturesMatchDocument()).toBe(true);
    });
});

describe('hashDocument', () => {
    it('produce un SHA-256 en hexadecimal de 64 caracteres', async () => {
        const hash = await hashDocument('contenido del contrato');

        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('el mismo texto da siempre el mismo hash', async () => {
        const a = await hashDocument('mismo texto');
        const b = await hashDocument('mismo texto');

        expect(a).toBe(b);
    });

    /** Un cambio mínimo tiene que dar un hash completamente distinto. */
    it('un solo carácter distinto cambia el hash', async () => {
        const a = await hashDocument('precio: USD 15.000');
        const b = await hashDocument('precio: USD 15.001');

        expect(a).not.toBe(b);
    });

    it('distingue acentos y espacios', async () => {
        const a = await hashDocument('operación');
        const b = await hashDocument('operacion');
        const c = await hashDocument('operación ');

        expect(new Set([a, b, c]).size).toBe(3);
    });
});
