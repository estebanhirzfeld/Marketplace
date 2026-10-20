import { DomainName } from '../value-objects/DomainName';
import { Email } from '../value-objects/Email';

/**
 * Registrador donde la plataforma tiene la cuenta de custodia de los dominios.
 *
 * El dominio no conoce HTTP ni al proveedor: ve los datos que necesita para
 * decidir si un dominio ya está en custodia o ya salió. Los contactos del
 * titular (WHOIS) son configuración de la cuenta de la plataforma, no un dato
 * del dominio, así que no cruzan este puerto.
 *
 * Los errores se informan con tres tipos del dominio:
 * - `ServiceUnavailableError`: el registrador no respondió (caída, límite de
 *   uso, tiempo agotado) o rechazó nuestras credenciales. Reintentar más tarde
 *   puede funcionar; nada se decidió.
 * - `DomainPremiumProtectionError`: el registrador exige un paso manual
 *   adicional para este dominio.
 * - `DomainRegistrarRejectedError`: el registrador entendió el pedido y lo
 *   rechazó (datos inválidos, dominio en un estado que no lo admite).
 *   Reintentar igual no sirve.
 */

/** Estado del dominio en la cuenta, tal como lo informa el registrador. */
export type RegistrarDomainStatus =
    | 'active'
    | 'pending_setup'
    | 'expired'
    | 'requested'
    | 'pending_verification'
    | 'deleted'
    | 'suspended'
    | 'failed';

export interface RegistrarPortfolioEntry {
    domain: DomainName;
    status: RegistrarDomainStatus;
    /** Bloqueo de transferencia del registrador. */
    isLocked: boolean;
    /** Fin del bloqueo de 60 días tras un alta o un cambio de titular, si lo hay. */
    sixtyDayLockExpiresAt: Date | null;
    registeredAt: Date | null;
    expiresAt: Date | null;
}

/** Etapas de un traslado entre cuentas del registrador. */
export type RegistrarMoveStatus = 'initiated' | 'activating' | 'completed';

export interface RegistrarMove {
    domain: DomainName;
    status: RegistrarMoveStatus;
    createdAt: Date;
    updatedAt: Date;
}

export interface IDomainRegistrar {
    /** El dominio en la cuenta de la plataforma, o `null` si no está en ella. */
    getPortfolioEntry(domain: DomainName): Promise<RegistrarPortfolioEntry | null>;

    /** El traslado que otra cuenta inició hacia la nuestra, o `null` si no hay. */
    getIncomingMove(domain: DomainName): Promise<RegistrarMove | null>;

    /** Acepta el traslado entrante con los contactos de la cuenta de la plataforma. */
    acceptIncomingMove(domain: DomainName): Promise<void>;

    /** El traslado que iniciamos hacia otra cuenta, o `null` si no hay. */
    getOutgoingMove(domain: DomainName): Promise<RegistrarMove | null>;

    /** Inicia el traslado a la cuenta del registrador que usa ese correo. */
    startOutgoingMove(domain: DomainName, recipientEmail: Email): Promise<void>;

    cancelOutgoingMove(domain: DomainName): Promise<void>;

    /** Código para mudar el dominio a otro registrador, o `null` si no hay uno disponible. */
    getAuthCode(domain: DomainName): Promise<string | null>;
}
