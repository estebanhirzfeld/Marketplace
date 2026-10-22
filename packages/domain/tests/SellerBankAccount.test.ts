import { describe, it, expect, vi } from 'vitest';
import { BankDestination } from '../src/value-objects/BankDestination';
import { SellerBankAccount } from '../src/entities/SellerBankAccount';
import { DeclareSellerBankAccountUseCase } from '../src/use-cases/payment-account/SellerBankAccountUseCases';
import { ISellerBankAccountRepository } from '../src/ports/Repositories';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { ForbiddenError, ValidationError } from '../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * Con una transferencia, cada parte recibe lo suyo: el comprador le transfiere
 * al vendedor lo que le corresponde, directo a su cuenta. Por eso el vendedor
 * declara su cuenta bancaria para cobrar, una por moneda, como vincula Mercado
 * Pago. El CBU se valida con los dígitos verificadores del BCRA: un número mal
 * copiado manda la plata a otro lado.
 */

// Armado con los pesos del BCRA: 0110599 → verificador 5; 2000000000000 → verificador 4.
const VALID_CBU = '0110599520000000000004';

describe('BankDestination', () => {
    it('acepta un CBU válido, con o sin espacios', () => {
        const d = BankDestination.create({ cbu: '0110 5995 2000 0000 0000 04', holder: 'Delia Orrego', currency: 'ARS' });

        expect(d.cbu).toBe(VALID_CBU);
        expect(d.alias).toBeUndefined();
        expect(d.holder).toBe('Delia Orrego');
        expect(d.currency).toBe('ARS');
    });

    it('un CBU de otro largo se rechaza pidiendo los 22 dígitos', () => {
        expect(() => BankDestination.create({ cbu: '01105995200000000000', holder: 'Delia', currency: 'ARS' })).toThrow(
            new ValidationError('El CBU tiene 22 dígitos.'),
        );
    });

    it('un CBU con un dígito cambiado se rechaza', () => {
        expect(() => BankDestination.create({ cbu: '0110599520000000000005', holder: 'Delia', currency: 'ARS' })).toThrow(
            new ValidationError('El CBU no es válido: revisá los números.'),
        );
    });

    it('acepta un alias en lugar del CBU', () => {
        const d = BankDestination.create({ alias: 'delia.orrego.mp', holder: 'Delia Orrego', currency: 'USD' });

        expect(d.alias).toBe('delia.orrego.mp');
        expect(d.cbu).toBeUndefined();
    });

    it.each([['corto'], ['un alias con espacios'], ['demasiado.largo.para.ser.alias']])('el alias «%s» se rechaza', (alias) => {
        expect(() => BankDestination.create({ alias, holder: 'Delia', currency: 'ARS' })).toThrow(ValidationError);
    });

    it('pide uno de los dos, y uno solo', () => {
        expect(() => BankDestination.create({ holder: 'Delia', currency: 'ARS' })).toThrow(
            new ValidationError('Decinos el CBU o el alias de tu cuenta.'),
        );
        expect(() =>
            BankDestination.create({ cbu: VALID_CBU, alias: 'delia.orrego.mp', holder: 'Delia', currency: 'ARS' }),
        ).toThrow(new ValidationError('Decinos el CBU o el alias, no los dos.'));
    });

    it('pide el titular', () => {
        expect(() => BankDestination.create({ cbu: VALID_CBU, holder: '  ', currency: 'ARS' })).toThrow(
            new ValidationError('Decinos el titular de la cuenta.'),
        );
    });
});

describe('DeclareSellerBankAccountUseCase', () => {
    function repo(existing: SellerBankAccount | null = null): ISellerBankAccountRepository {
        return {
            findByUser: vi.fn().mockResolvedValue(existing ? [existing] : []),
            findByUserAndCurrency: vi.fn().mockResolvedValue(existing),
            save: vi.fn().mockResolvedValue(undefined),
        };
    }

    const SELLER = { id: new UniqueEntityID().toString(), role: UserRole.SELLER };

    it('guarda la cuenta del vendedor para esa moneda', async () => {
        const r = repo();

        const account = await new DeclareSellerBankAccountUseCase(r).execute(
            { cbu: VALID_CBU, holder: 'Delia Orrego', currency: 'ARS' },
            SELLER,
        );

        expect(account.userId.toString()).toBe(SELLER.id);
        expect(account.destination.cbu).toBe(VALID_CBU);
        expect(r.save).toHaveBeenCalledWith(account);
    });

    it('declarar de nuevo la misma moneda reemplaza la cuenta, con el mismo id', async () => {
        const previa = SellerBankAccount.declare({
            userId: new UniqueEntityID(SELLER.id),
            destination: BankDestination.create({ alias: 'delia.viejo', holder: 'Delia', currency: 'ARS' }),
        });
        const r = repo(previa);

        const account = await new DeclareSellerBankAccountUseCase(r).execute(
            { alias: 'delia.nuevo', holder: 'Delia Orrego', currency: 'ARS' },
            SELLER,
        );

        expect(account.id.toString()).toBe(previa.id.toString());
        expect(account.destination.alias).toBe('delia.nuevo');
    });

    it('un admin no cobra ventas, así que no declara cuenta', async () => {
        await expect(
            new DeclareSellerBankAccountUseCase(repo()).execute(
                { cbu: VALID_CBU, holder: 'Admin', currency: 'ARS' },
                { id: 'a1', role: UserRole.ADMIN },
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});
