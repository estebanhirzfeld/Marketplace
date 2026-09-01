import { describe, it, expect } from 'vitest';
import { CustodyAccount } from '../../../src/entities/CustodyAccount';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { AssetType } from '@marketplace/shared-types';
import { InvalidStateError, ValidationError } from '../../../src/errors/DomainError';

/**
 * `CustodyAccount` es la identidad real (una cuenta de Google, un usuario de
 * registrador) que sostiene uno o más activos en custodia de la plataforma.
 * Nace activa, no se borra nunca, y no puede darse de baja ni cambiar de tipo
 * mientras sostenga activos: quedarían sin quién los sostenga.
 */

function unaCuenta(over: Partial<Parameters<typeof CustodyAccount.create>[0]> = {}) {
    return CustodyAccount.create({
        label: 'Custodia YouTube 01',
        identifier: 'custodia1@gmail.com',
        assetType: AssetType.YOUTUBE,
        ...over,
    });
}

describe('CustodyAccount.create', () => {
    it('nace activa', () => {
        expect(unaCuenta().isActive).toBe(true);
    });

    it('recorta label e identifier', () => {
        const cuenta = unaCuenta({ label: '  Custodia 01  ', identifier: '  x@gmail.com  ' });
        expect(cuenta.label).toBe('Custodia 01');
        expect(cuenta.identifier).toBe('x@gmail.com');
    });

    it('rechaza label vacío', () => {
        expect(() => unaCuenta({ label: '   ' })).toThrow(ValidationError);
    });

    it('rechaza identifier vacío', () => {
        expect(() => unaCuenta({ identifier: '' })).toThrow(ValidationError);
    });

    it('rechaza un assetType que no pertenece a AssetType', () => {
        expect(() => unaCuenta({ assetType: 'instagram' as AssetType })).toThrow(ValidationError);
    });
});

describe('CustodyAccount.reconstitute', () => {
    it('no fuerza defaults: respeta el estado guardado', () => {
        const cuenta = CustodyAccount.reconstitute(
            {
                label: 'Vieja',
                identifier: 'vieja@gmail.com',
                assetType: AssetType.YOUTUBE,
                isActive: false,
            },
            new UniqueEntityID(),
            new Date('2024-01-01'),
        );
        expect(cuenta.isActive).toBe(false);
    });
});

describe('ciclo de vida', () => {
    it('deactivate sin activos deja la cuenta inactiva', () => {
        const cuenta = unaCuenta();
        cuenta.deactivate(0);
        expect(cuenta.isActive).toBe(false);
    });

    it('deactivate con activos sostenidos es un error de estado', () => {
        const cuenta = unaCuenta();
        expect(() => cuenta.deactivate(2)).toThrow(InvalidStateError);
        expect(cuenta.isActive).toBe(true);
    });

    it('activate vuelve a habilitarla', () => {
        const cuenta = unaCuenta();
        cuenta.deactivate(0);
        cuenta.activate();
        expect(cuenta.isActive).toBe(true);
    });

    it('changeAssetType con activos sostenidos es un error de estado', () => {
        const cuenta = unaCuenta();
        expect(() => cuenta.changeAssetType(AssetType.WEB, 1)).toThrow(InvalidStateError);
        expect(cuenta.assetType).toBe(AssetType.YOUTUBE);
    });

    it('changeAssetType sin activos cambia el tipo', () => {
        const cuenta = unaCuenta();
        cuenta.changeAssetType(AssetType.WEB, 0);
        expect(cuenta.assetType).toBe(AssetType.WEB);
    });

    it('changeAssetType rechaza un tipo fuera de AssetType', () => {
        expect(() => unaCuenta().changeAssetType('tiktok' as AssetType, 0)).toThrow(ValidationError);
    });

    it('rename recorta y exige no vacío', () => {
        const cuenta = unaCuenta();
        cuenta.rename('  Nueva  ');
        expect(cuenta.label).toBe('Nueva');
        expect(() => cuenta.rename('  ')).toThrow(ValidationError);
    });

    it('changeIdentifier recorta y exige no vacío', () => {
        const cuenta = unaCuenta();
        cuenta.changeIdentifier('  nuevo@gmail.com  ');
        expect(cuenta.identifier).toBe('nuevo@gmail.com');
        expect(() => cuenta.changeIdentifier('')).toThrow(ValidationError);
    });
});

describe('compatibilidad de custodia', () => {
    it('canHold es true solo para el mismo assetType', () => {
        const cuenta = unaCuenta({ assetType: AssetType.YOUTUBE });
        expect(cuenta.canHold(AssetType.YOUTUBE)).toBe(true);
        expect(cuenta.canHold(AssetType.WEB)).toBe(false);
    });

    it('assertCanHold lanza InvalidStateError con un tipo distinto', () => {
        const cuenta = unaCuenta({ assetType: AssetType.YOUTUBE });
        expect(() => cuenta.assertCanHold(AssetType.WEB)).toThrow(InvalidStateError);
        expect(() => cuenta.assertCanHold(AssetType.YOUTUBE)).not.toThrow();
    });

    it('assertIsActive lanza InvalidStateError en una cuenta inactiva', () => {
        const cuenta = unaCuenta();
        cuenta.deactivate(0);
        expect(() => cuenta.assertIsActive()).toThrow(InvalidStateError);
    });
});
