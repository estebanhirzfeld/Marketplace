import { describe, it, expect } from 'vitest';
import {
    generateDocument,
    documentMatches,
} from '../src/contracts/ContractGenerator';
import {
    ContractData,
    PLATFORM_PENDING,
} from '../src/contracts/ContractData';

/**
 * La generación tiene que ser determinista: los mismos datos, el mismo texto y
 * el mismo hash. Eso es lo que permite no guardar el documento y aun así poder
 * demostrar qué se firmó — se regenera y se compara la huella.
 */

const VENDEDOR = {
    name: 'Esteban Gómez',
    dni: '20987654',
    address: 'Av. Siempre Viva 742, Buenos Aires',
    email: 'esteban@example.com',
};

const COMPRADOR = {
    name: 'Ana Pérez',
    dni: '20123456',
    email: 'ana@example.com',
};

function data(over: Partial<ContractData> = {}): ContractData {
    return {
        type: 'tripartite',
        reference: 'op-abc123',
        date: new Date('2026-08-30T12:00:00Z'),
        platform: PLATFORM_PENDING,
        seller: VENDEDOR,
        buyer: COMPRADOR,
        asset: { type: 'youtube', description: 'Canal de finanzas personales, 55.000 suscriptores' },
        price: {
            finalCents: 1_500_000,
            buyerPaysCents: 1_575_000,
            sellerReceivesCents: 1_425_000,
            totalCommissionCents: 150_000,
            currency: 'USD',
        },
        ...over,
    };
}

describe('generateDocument — determinismo', () => {
    it('los mismos datos dan exactamente el mismo hash', async () => {
        const a = await generateDocument(data());
        const b = await generateDocument(data());

        expect(a.hash).toBe(b.hash);
        expect(a.text).toBe(b.text);
    });

    it('cambiar el precio cambia el hash', async () => {
        const a = await generateDocument(data());
        const b = await generateDocument(
            data({ price: { ...data().price!, finalCents: 1_500_001 } }),
        );

        expect(a.hash).not.toBe(b.hash);
    });

    it('cambiar una parte cambia el hash', async () => {
        const a = await generateDocument(data());
        const b = await generateDocument(data({ buyer: { ...COMPRADOR, dni: '30111222' } }));

        expect(a.hash).not.toBe(b.hash);
    });

    it('documentMatches reconoce el documento original y rechaza uno alterado', async () => {
        const { hash } = await generateDocument(data());

        await expect(documentMatches(data(), hash)).resolves.toBe(true);
        await expect(
            documentMatches(data({ asset: { type: 'web', description: 'Otro activo' } }), hash),
        ).resolves.toBe(false);
    });
});

describe('Contenido del tripartito', () => {
    it('lleva el aviso de borrador bien visible', async () => {
        const { text } = await generateDocument(data());
        expect(text.startsWith('DOCUMENTO EN BORRADOR')).toBe(true);
    });

    /**
     * Los tres importes tienen que aparecer explícitos. El modelo de comisión
     * es 5 % a cada parte, distinto del 10 % íntegro a cargo del vendedor que
     * usan otros intermediarios.
     */
    it('detalla los tres importes del modelo 5 % + 5 %', async () => {
        const { text } = await generateDocument(data());

        expect(text).toContain('USD 15.000,00');
        expect(text).toContain('USD 15.750,00');
        expect(text).toContain('USD 14.250,00');
        expect(text).toContain('USD 1.500,00');
    });

    it('describe la custodia antes del pago, que es el diferencial', async () => {
        const { text } = await generateDocument(data());

        expect(text).toContain('carácter de depositaria');
        expect(text).toContain('Con anterioridad a este momento EL COMPRADOR no está obligado');
    });

    it('excluye medios de pago reversibles', async () => {
        const { text } = await generateDocument(data());

        expect(text).toContain('transferencia bancaria');
        expect(text).toContain('reversión unilateral');
        expect(text).not.toContain('PayPal');
    });

    it('no exagera el valor de la firma electrónica', async () => {
        const { text } = await generateDocument(data());

        expect(text).toContain('Ley 25.506');
        // Declarar que es firma digital sería falso y jurídicamente riesgoso.
        expect(text).toContain('no se trata de firma digital');
    });

    it('menciona las tres firmas', async () => {
        const { text } = await generateDocument(data());

        expect(text).toContain('EL COMPRADOR');
        expect(text).toContain('EL VENDEDOR');
        expect(text).toContain('LA PLATAFORMA');
    });
});

describe('NDAs', () => {
    it('el del vendedor distingue lo publicable de lo reservado', async () => {
        const { text } = await generateDocument(data({ type: 'seller_nda', buyer: undefined }));

        expect(text).toContain('ACUERDO DE CONFIDENCIALIDAD Y AUTORIZACIÓN DE PUBLICACIÓN');
        expect(text).toContain('no serán publicados');
        expect(text).toContain('EL VENDEDOR');
    });

    it('el del comprador tiene cláusula penal referida al Código Civil y Comercial', async () => {
        const { text } = await generateDocument(data({ type: 'buyer_nda', seller: undefined }));

        expect(text).toContain('CLÁUSULA PENAL');
        expect(text).toContain('790');
        expect(text).toContain('DIEZ POR CIENTO (10%)');
    });

    it('el del comprador prohíbe saltear la plataforma', async () => {
        const { text } = await generateDocument(data({ type: 'buyer_nda', seller: undefined }));

        expect(text).toContain('por fuera de LA PLATAFORMA');
    });

    it('falla si faltan los datos de la parte que corresponde', async () => {
        await expect(
            generateDocument(data({ type: 'buyer_nda', buyer: undefined })),
        ).rejects.toThrow();
    });
});

describe('Datos de la plataforma', () => {
    /**
     * Mientras no exista la sociedad, los marcadores son explícitos. Un
     * contrato con una razón social inventada es peor que uno que dice
     * claramente qué falta completar.
     */
    it('los marcadores pendientes se ven en el documento', async () => {
        const { text } = await generateDocument(data());

        expect(text).toContain('[RAZÓN SOCIAL DE LA PLATAFORMA]');
        expect(text).toContain('[CUIT]');
    });
});
