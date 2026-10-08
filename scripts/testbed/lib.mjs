// Núcleo puro del testbed: sin red, sin SSH, sin lectura de archivos.
// Todo lo que tiene efectos secundarios vive en cli.mjs.

/** Marca de toda fila de prueba: `assetData.name` de cada activo empieza así. */
export const TEST_PREFIX = '[TEST] ';

export const STATES = ['published', 'offer', 'contract_signed', 'in_custody'];
export const ASSET_TYPES = ['youtube', 'web'];
export const CURRENCIES = ['ARS', 'USD'];

const COMMANDS = ['up', 'status', 'clean', 'list-users'];

const DEFAULT_PRICE_CENTS = { youtube: 500000, web: 300000 };

// ── Validación de valores que se interpolan en SQL o en rutas ──────────────

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertSafeEmail(value) {
    if (typeof value !== 'string' || !EMAIL_RE.test(value)) {
        throw new Error(`Correo inválido o inseguro: ${JSON.stringify(value)}`);
    }
    return value;
}

export function assertUuid(value) {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
        throw new Error(`Id inválido (se esperaba un uuid): ${JSON.stringify(value)}`);
    }
    return value;
}

// ── Cuerpo del activo de prueba ────────────────────────────────────────────

function stamp(now) {
    return now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * Cuerpo de `POST /listings`. Los campos salen de `createAssetStrategy`
 * (packages/domain): el rubro tiene que pertenecer a la lista cerrada.
 */
export function buildListingBody(type, { price, currency = 'USD', now = new Date() } = {}) {
    if (!ASSET_TYPES.includes(type)) {
        throw new Error(`Tipo de activo desconocido: ${type}`);
    }
    const ts = stamp(now);
    const name = `${TEST_PREFIX}${type} ${ts}`;
    const askingPrice = { cents: price ?? DEFAULT_PRICE_CENTS[type], currency };

    if (type === 'youtube') {
        return {
            assetType: 'youtube',
            assetData: {
                niche: 'gaming',
                monthlyRevenueUsdCents: 200000,
                currency: 'USD',
                subscribers: 120000,
                growthFactor: 1.1,
                isMonetized: true,
                audienceTopCountry: 'US',
                hasNoFaceContent: true,
                name,
                channelUrl: `https://www.youtube.com/@test-${ts.toLowerCase()}`,
            },
            askingPrice,
        };
    }

    return {
        assetType: 'web',
        assetData: {
            niche: 'technology',
            monthlyRevenueUsdCents: 150000,
            currency: 'USD',
            domainAuthority: 45,
            name,
            domain: `test-${ts.toLowerCase()}.example.com`,
        },
        askingPrice,
    };
}

// ── Plan de pasos por estado ───────────────────────────────────────────────
// Cada paso es una llamada a la API real: los estados del dominio nunca se
// escriben por SQL, así que se respetan todas sus reglas.

const STEPS = {
    'create-listing': { actor: 'seller', method: 'POST', path: '/listings', bodyKeys: ['assetType', 'assetData', 'askingPrice'] },
    submit: { actor: 'seller', method: 'POST', path: '/listings/:listingId/submit', bodyKeys: [] },
    approve: { actor: 'admin', method: 'POST', path: '/listings/:listingId/approve', bodyKeys: [] },
    offer: { actor: 'buyer', method: 'POST', path: '/listings/:listingId/offers', bodyKeys: ['offerPrice'] },
    'custody-account': { actor: 'admin', method: 'GET', path: '/admin/custody-accounts', bodyKeys: [], note: 'reusa la primera activa del tipo; si no hay, la crea con POST' },
    'platform-access': { actor: 'admin', method: 'POST', path: '/admin/listings/:listingId/acceso', bodyKeys: ['accessSince', 'custodyAccountId'] },
    accept: { actor: 'seller', method: 'POST', path: '/operations/:operationId/accept', bodyKeys: [] },
    'find-contract': { actor: 'buyer', method: 'GET', path: '/operations/:operationId', bodyKeys: [], note: 'busca el contrato tripartito' },
    'sign-buyer': { actor: 'buyer', method: 'POST', path: '/contracts/:contractId/sign', bodyKeys: [] },
    'sign-seller': { actor: 'seller', method: 'POST', path: '/contracts/:contractId/sign', bodyKeys: [] },
    transfer: { actor: 'seller', method: 'POST', path: '/operations/:operationId/transfer', bodyKeys: ['controlCeded'] },
    'confirm-custody': { actor: 'admin', method: 'POST', path: '/operations/:operationId/custody', bodyKeys: ['isPrimaryOwner', 'accessSecured', 'metrics'] },
};

const PLAN_KEYS = {
    published: ['create-listing', 'submit', 'approve'],
    offer: ['create-listing', 'submit', 'approve', 'offer'],
    contract_signed: [
        'create-listing', 'submit', 'approve', 'offer',
        'custody-account', 'platform-access', 'accept', 'find-contract', 'sign-buyer', 'sign-seller',
    ],
    in_custody: [
        'create-listing', 'submit', 'approve', 'offer',
        'custody-account', 'platform-access', 'accept', 'find-contract', 'sign-buyer', 'sign-seller',
        'transfer', 'confirm-custody',
    ],
};

export function planForState(state) {
    const keys = PLAN_KEYS[state];
    if (!keys) {
        throw new Error(`Estado desconocido: ${state}. Opciones: ${STATES.join(', ')}`);
    }
    return keys.map((key) => ({ key, ...STEPS[key] }));
}

/** Texto del `--dry-run`: pasos numerados, sin valores de cuerpo ni credenciales. */
export function renderPlan(plan) {
    return plan
        .map((step, i) => {
            const body = step.bodyKeys.length ? `  cuerpo: {${step.bodyKeys.join(', ')}}` : '';
            const note = step.note ? `  (${step.note})` : '';
            return `${i + 1}. [${step.actor}] ${step.method} ${step.path}${body}${note}`;
        })
        .join('\n');
}

// ── SQL de conteo y borrado, acotado al marcador ───────────────────────────
// El prefijo es una constante sin comillas: no entra ningún dato externo.

const MARKED_LISTINGS = `SELECT "id" FROM "listings" WHERE starts_with("assetData"->>'name', '${TEST_PREFIX}')`;
const MARKED_OPERATIONS = `SELECT "id" FROM "operations" WHERE "listingId" IN (${MARKED_LISTINGS})`;

/** Conteo por tabla, una fila `tabla|cantidad` cada una. Solo lectura. */
export function countStatements() {
    return [
        `SELECT 'listings', count(*) FROM "listings" WHERE "id" IN (${MARKED_LISTINGS})`,
        `SELECT 'operations', count(*) FROM "operations" WHERE "id" IN (${MARKED_OPERATIONS})`,
        `SELECT 'contracts', count(*) FROM "contracts" WHERE "listingId" IN (${MARKED_LISTINGS}) OR "operationId" IN (${MARKED_OPERATIONS})`,
        `SELECT 'notifications', count(*) FROM "notifications" WHERE "listingId" IN (${MARKED_LISTINGS}) OR "operationId" IN (${MARKED_OPERATIONS})`,
        `SELECT 'reports', count(*) FROM "reports" WHERE "operationId" IN (${MARKED_OPERATIONS})`,
    ].join('\nUNION ALL\n') + ';';
}

/**
 * Borrado en orden seguro para las claves foráneas. Nunca toca usuarios,
 * cuentas de custodia ni cuentas de pago: solo lo que cuelga de un activo marcado.
 */
export function cleanupStatements() {
    return [
        'BEGIN;',
        `DELETE FROM "notifications" WHERE "listingId" IN (${MARKED_LISTINGS}) OR "operationId" IN (${MARKED_OPERATIONS});`,
        `DELETE FROM "reports" WHERE "operationId" IN (${MARKED_OPERATIONS});`,
        `DELETE FROM "contracts" WHERE "listingId" IN (${MARKED_LISTINGS}) OR "operationId" IN (${MARKED_OPERATIONS});`,
        `DELETE FROM "operations" WHERE "listingId" IN (${MARKED_LISTINGS});`,
        `DELETE FROM "listings" WHERE "id" IN (${MARKED_LISTINGS});`,
        'COMMIT;',
    ];
}

// ── Argumentos de la línea de comandos ─────────────────────────────────────

export function parseArgs(argv) {
    const [command, ...rest] = argv;
    if (!COMMANDS.includes(command)) {
        throw new Error(`Comando desconocido: ${command ?? '(ninguno)'}. Opciones: ${COMMANDS.join(', ')}`);
    }

    const flags = { state: undefined, type: 'youtube', price: undefined, currency: 'USD', dryRun: false, yes: false };

    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        const next = () => {
            const value = rest[++i];
            if (value === undefined) throw new Error(`Falta el valor de ${arg}`);
            return value;
        };
        switch (arg) {
            case '--state': flags.state = next(); break;
            case '--type': flags.type = next(); break;
            case '--price': flags.price = Number(next()); break;
            case '--currency': flags.currency = next(); break;
            case '--dry-run': flags.dryRun = true; break;
            case '--yes': flags.yes = true; break;
            default: throw new Error(`Opción desconocida: ${arg}`);
        }
    }

    if (command === 'up') {
        if (flags.state === undefined) throw new Error(`Falta --state (${STATES.join('|')})`);
        if (!STATES.includes(flags.state)) throw new Error(`Estado desconocido: ${flags.state}`);
        if (!ASSET_TYPES.includes(flags.type)) throw new Error(`Tipo desconocido: ${flags.type}`);
        if (flags.price !== undefined && !(Number.isInteger(flags.price) && flags.price > 0)) {
            throw new Error('El precio debe ser un entero positivo en centavos.');
        }
        if (!CURRENCIES.includes(flags.currency)) throw new Error(`Moneda desconocida: ${flags.currency}`);
    }

    return { command, flags };
}
