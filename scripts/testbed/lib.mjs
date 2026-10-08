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

// ── Configuración ──────────────────────────────────────────────────────────

const HOST_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/;

/** Variables `TESTBED_*` sobre los valores por defecto. Valida todo lo que se usa en SQL o ssh. */
export function resolveConfig(env) {
    const host = env.TESTBED_HOST || 'ubuntu@144.22.175.14';
    if (!HOST_RE.test(host)) {
        throw new Error(`Host inválido: ${JSON.stringify(host)} (se espera usuario@host)`);
    }
    return {
        host,
        emails: {
            seller: assertSafeEmail(env.TESTBED_SELLER_EMAIL || 'seller@forzalabs.online'),
            buyer: assertSafeEmail(env.TESTBED_BUYER_EMAIL || 'buyer@forzalabs.online'),
            admin: assertSafeEmail(env.TESTBED_ADMIN_EMAIL || 'admin@forzalabs.online'),
        },
    };
}

/**
 * Comando remoto de psql dentro del contenedor. Es una constante: nada externo
 * entra al shell remoto, el SQL viaja por stdin. Las comillas dobles de
 * `$POSTGRES_*` se expanden dentro del contenedor, no en la VPS.
 */
export const PSQL_REMOTE_COMMAND =
    `sudo -n docker exec -i marketplace-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At -F"|"'`;

/** Resuelve los tres usuarios por correo. Solo lectura. */
export function userLookupSql(emails) {
    const list = emails.map((e) => `'${assertSafeEmail(e)}'`).join(',');
    return `SELECT "id", "email", "role"::text, "isKycVerified" FROM "users" WHERE "email" IN (${list});`;
}

/** Marcador de cada fila de `userLookupSql`: `id|email|role|t/f`. */
export function parseUserRows(output) {
    return output
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const [id, email, role, kyc] = line.split('|');
            return { id: assertUuid(id), email, role, kyc: kyc === 't' };
        });
}

/** SQL de `status`: una fila `tipo|id|estado|nombre` por activo y por operación marcados. */
export function statusListStatement() {
    return [
        `SELECT 'listing', l."id", l."status"::text, l."assetData"->>'name' FROM "listings" l WHERE l."id" IN (${MARKED_LISTINGS})`,
        `SELECT 'operation', o."id", o."status"::text, l."assetData"->>'name' FROM "operations" o JOIN "listings" l ON l."id" = o."listingId" WHERE o."id" IN (${MARKED_OPERATIONS})`,
    ].join('\nUNION ALL\n') + ';';
}

/** Verifica que los usuarios existan, tengan el rol esperado y KYC donde el flujo lo exige. */
export function assertActorsReady(users, state) {
    for (const who of ['seller', 'buyer', 'admin']) {
        if (!users[who]) {
            throw new Error(`No se encontró el usuario ${who} en la base: revisá TESTBED_${who.toUpperCase()}_EMAIL.`);
        }
    }
    if (users.admin.role !== 'admin') {
        throw new Error(`El usuario ${users.admin.email} no tiene rol admin.`);
    }
    const needsKyc = ['seller'];
    if (state === 'contract_signed' || state === 'in_custody') needsKyc.push('buyer');
    for (const who of needsKyc) {
        if (!users[who].kyc) {
            throw new Error(`El usuario ${users[who].email} (${who}) no tiene KYC verificado: verificalo desde el navegador antes de crear datos de prueba.`);
        }
    }
}

// ── Cuentas de custodia ────────────────────────────────────────────────────

export function pickCustodyAccount(accounts, assetType) {
    return accounts.find((a) => a.isActive && a.assetType === assetType) ?? null;
}

/** Cuerpo de `POST /admin/custody-accounts`, con los placeholders del seed. */
export function custodyAccountBody(assetType) {
    return assetType === 'youtube'
        ? { label: 'Custodia YouTube 01', identifier: 'custodia-yt-01@forzalabs.online', assetType, notes: 'Creada por el testbed: reemplazar por la cuenta real.' }
        : { label: 'Custodia Web 01', identifier: 'custodia-web-01@forzalabs.online', assetType, notes: 'Creada por el testbed: reemplazar por la cuenta real.' };
}

// ── Peticiones concretas ───────────────────────────────────────────────────

const MS_PER_DAY = 86400000;
// YouTube exige 7 días de espera; 8 deja margen.
const ACCESS_BACKDATE_DAYS = 8;

const CUSTODY_METRICS = {
    youtube: { subscribers: 120000 },
    web: { sessions: 10000, revenue: 150000 },
};

/**
 * Resuelve un paso del plan a una petición HTTP: ruta con ids reales y cuerpo.
 * `ctx` guarda los ids que se van creando; `opts` lo elegido en la línea de comandos.
 */
export function buildRequest(step, ctx, opts = {}) {
    const path = step.path.replace(/:(\w+)/g, (_, name) => {
        if (ctx[name] === undefined) throw new Error(`Falta ${name} en el contexto para ${step.key}`);
        return assertUuid(ctx[name]);
    });

    const type = opts.type ?? 'youtube';
    const currency = opts.currency ?? 'USD';
    let body;
    switch (step.key) {
        case 'create-listing':
            body = buildListingBody(type, opts);
            break;
        case 'offer':
            body = { offerPrice: { cents: opts.price ?? DEFAULT_PRICE_CENTS[type], currency } };
            break;
        case 'platform-access': {
            const now = opts.now ?? new Date();
            body = {
                accessSince: new Date(now.getTime() - ACCESS_BACKDATE_DAYS * MS_PER_DAY).toISOString(),
                custodyAccountId: ctx.custodyAccountId,
            };
            break;
        }
        case 'transfer':
            body = { controlCeded: true };
            break;
        case 'confirm-custody':
            body = { isPrimaryOwner: true, accessSecured: true, metrics: CUSTODY_METRICS[type], notes: 'Verificación de prueba (testbed).' };
            break;
        default:
            body = undefined;
    }
    return { method: step.method, path, body };
}

// ── Token de vida corta, firmado en la VPS ─────────────────────────────────

const ROLES = ['seller', 'buyer', 'admin'];

/**
 * Programa de Node que se ejecuta EN LA VPS (por stdin, con sudo) y firma un JWT
 * HS256 igual al que firma `@fastify/jwt` en el login: payload `{id, role}` más
 * `iat`/`exp`, sin issuer ni audience. Lee `JWT_SECRET` del archivo de entorno
 * de la API y solo imprime el token: el secreto no sale de la VPS.
 */
export function mintTokenScript({ id, role }, { envFile = '/etc/marketplace/api.env', ttlSeconds = 600 } = {}) {
    assertUuid(id);
    if (!ROLES.includes(role)) throw new Error(`Rol desconocido: ${role}`);
    // JSON.stringify produce literales JS válidos y escapados.
    return `
const fs = require('node:fs');
const crypto = require('node:crypto');
const text = fs.readFileSync(${JSON.stringify(envFile)}, 'utf8');
const match = text.match(/^\\s*(?:export\\s+)?JWT_SECRET=(.*)$/m);
if (!match) { console.error('JWT_SECRET no está definido en el archivo de entorno.'); process.exit(1); }
let secret = match[1].trim();
if (/^(["']).*\\1$/.test(secret)) secret = secret.slice(1, -1);
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const iat = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64({ id: ${JSON.stringify(id)}, role: ${JSON.stringify(role)}, iat, exp: iat + ${Number(ttlSeconds)} });
const sig = crypto.createHmac('sha256', secret).update(head + '.' + body).digest('base64url');
process.stdout.write(head + '.' + body + '.' + sig + '\\n');
`;
}
