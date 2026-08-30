import { describe, it, expect } from 'vitest';
import {
    floorToThreeSignificantFigures,
    subscribersAreConsistent,
} from '../src/services/YouTubeMetrics';

/**
 * La API no devuelve el número real de suscriptores: lo redondea hacia abajo a
 * tres cifras significativas. Compararlo de forma literal contra lo declarado
 * marcaría como mentira cualquier canal de más de mil suscriptores.
 *
 * Como el redondeo es determinístico, la comparación correcta no es tolerante
 * ni aproximada: se aplica el mismo redondeo al valor declarado y se exige
 * igualdad exacta. Eso detecta una inconsistencia real sin falsos positivos.
 */

describe('floorToThreeSignificantFigures', () => {
    it('recorta hacia abajo a tres cifras significativas', () => {
        expect(floorToThreeSignificantFigures(55432)).toBe(55400);
        expect(floorToThreeSignificantFigures(1234567)).toBe(1230000);
        expect(floorToThreeSignificantFigures(1999)).toBe(1990);
    });

    it('deja intactos los números de menos de tres cifras', () => {
        expect(floorToThreeSignificantFigures(55)).toBe(55);
        expect(floorToThreeSignificantFigures(7)).toBe(7);
        expect(floorToThreeSignificantFigures(0)).toBe(0);
    });

    it('deja intacto un número que ya tiene exactamente tres cifras', () => {
        expect(floorToThreeSignificantFigures(999)).toBe(999);
        expect(floorToThreeSignificantFigures(100)).toBe(100);
    });

    it('nunca redondea hacia arriba', () => {
        // 55999 no puede convertirse en 56000: eso inflaría el canal.
        expect(floorToThreeSignificantFigures(55999)).toBe(55900);
    });
});

describe('subscribersAreConsistent', () => {
    it('acepta un declarado que redondea a lo que informa la API', () => {
        expect(subscribersAreConsistent(55432, 55400)).toBe(true);
    });

    it('acepta el caso exacto de un canal chico', () => {
        expect(subscribersAreConsistent(840, 840)).toBe(true);
    });

    /**
     * El caso que justifica la verificación: alguien declara diez veces sus
     * suscriptores reales para inflar la valuación.
     */
    it('rechaza un declarado inflado', () => {
        expect(subscribersAreConsistent(550000, 55400)).toBe(false);
    });

    it('rechaza un declarado apenas por encima del tramo', () => {
        // 55500 redondea a 55500, no a 55400: no es el mismo canal o el dato
        // está desactualizado.
        expect(subscribersAreConsistent(55500, 55400)).toBe(false);
    });

    /**
     * Un canal puede ocultar su número de suscriptores. Sin dato no hay
     * comparación posible, y decir que "no coincide" sería mentir.
     */
    it('no se pronuncia cuando el canal oculta los suscriptores', () => {
        expect(subscribersAreConsistent(55432, undefined)).toBeUndefined();
    });
});
