import { describe, it, expect } from 'vitest';
import { Report } from '../src/entities/Report';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { ForbiddenError, InvalidStateError, ValidationError } from '../src/errors/DomainError';

/**
 * La denuncia de una parte contra la otra.
 *
 * Ninguno de sus estados dice quién tiene razón, y es deliberado: la
 * plataforma no arbitra el fondo del reclamo. Recibe la denuncia, la fecha,
 * avisa a la contraparte y reúne lo que registró para que quien se considere
 * perjudicado inicie las acciones que correspondan.
 */

const DENUNCIANTE = new UniqueEntityID();
const DENUNCIADO = new UniqueEntityID();

function unaDenuncia(over: Partial<Parameters<typeof Report.create>[0]> = {}): Report {
    return Report.create({
        operationId: new UniqueEntityID(),
        reportedBy: DENUNCIANTE,
        reporterRole: 'buyer',
        reportedUserId: DENUNCIADO,
        reason: 'ingreso_falso',
        detail: 'El canal factura menos de la mitad de lo que decía la publicación.',
        ...over,
    });
}

describe('Report — al abrirse', () => {
    it('nace abierta y guarda de qué lado se denuncia', () => {
        const denuncia = unaDenuncia();

        expect(denuncia.status).toBe('open');
        expect(denuncia.reporterRole).toBe('buyer');
        expect(denuncia.reportedUserId.toString()).toBe(DENUNCIADO.toString());
    });

    /**
     * El detalle es lo que va a leer la otra parte y lo que queda asentado.
     * Una denuncia de tres palabras no le sirve a nadie ni sostiene un reclamo.
     */
    it('exige un detalle con sustancia', () => {
        expect(() => unaDenuncia({ detail: 'me estafaron' })).toThrow(ValidationError);
    });

    it('rechaza un detalle vacío', () => {
        expect(() => unaDenuncia({ detail: '   ' })).toThrow(ValidationError);
    });

    it('recorta los espacios del detalle', () => {
        const denuncia = unaDenuncia({ detail: '   El canal no produce lo que decía la ficha.   ' });

        expect(denuncia.detail).toBe('El canal no produce lo que decía la ficha.');
    });

    it('no deja denunciarse a uno mismo', () => {
        expect(() => unaDenuncia({ reportedUserId: DENUNCIANTE })).toThrow(ValidationError);
    });
});

describe('Report — quién la ve', () => {
    /** Las dos partes: el reclamo sin la palabra del denunciado no sirve. */
    it('la ve quien denuncia', () => {
        expect(unaDenuncia().involves(DENUNCIANTE.toString())).toBe(true);
    });

    it('la ve quien es denunciado', () => {
        expect(unaDenuncia().involves(DENUNCIADO.toString())).toBe(true);
    });

    it('no la ve un tercero', () => {
        const denuncia = unaDenuncia();

        expect(denuncia.involves(new UniqueEntityID().toString())).toBe(false);
        expect(() => denuncia.assertInvolves(new UniqueEntityID().toString())).toThrow(ForbiddenError);
    });
});

describe('Report — al cerrarse', () => {
    it('la cierra quien la abrió, con un motivo', () => {
        const denuncia = unaDenuncia();

        denuncia.close('Nos arreglamos entre las partes.');

        expect(denuncia.status).toBe('closed');
        expect(denuncia.closedAt).toBeInstanceOf(Date);
        expect(denuncia.closedReason).toBe('Nos arreglamos entre las partes.');
    });

    it('exige un motivo para cerrarla', () => {
        expect(() => unaDenuncia().close('  ')).toThrow(ValidationError);
    });

    it('no se cierra dos veces', () => {
        const denuncia = unaDenuncia();
        denuncia.close('Resuelto.');

        expect(() => denuncia.close('Resuelto de nuevo.')).toThrow(InvalidStateError);
    });

    /**
     * El denunciado no puede cerrarla: sería dar por terminado un reclamo en su
     * contra por decisión propia.
     */
    it('el denunciado no puede cerrarla', () => {
        expect(() => unaDenuncia().assertCanClose(DENUNCIADO.toString())).toThrow(ForbiddenError);
    });

    it('quien la abrió sí puede', () => {
        expect(() => unaDenuncia().assertCanClose(DENUNCIANTE.toString())).not.toThrow();
    });
});
