import { ContractData, ContractParty } from './ContractData';

/**
 * ⚠️ BORRADORES PENDIENTES DE REVISIÓN LEGAL
 *
 * Este texto lo redactó el equipo de desarrollo, no un abogado. Antes de que
 * una persona firme algo generado acá, tiene que revisarlo un profesional
 * matriculado en Argentina.
 *
 * Qué se tuvo en cuenta al escribirlo:
 *
 * - Código Civil y Comercial: contratos de adhesión (arts. 984-989), cláusula
 *   penal (arts. 790-804), depósito (arts. 1356 y ss.).
 * - Ley 25.506 de Firma Digital: la firma electrónica de estos documentos NO
 *   es firma digital en sentido legal, y por eso la cláusula correspondiente
 *   la declara como firma electrónica con valor probatorio, sin exagerarlo.
 * - Ley 25.326 de Protección de Datos Personales.
 *
 * Se redactó de cero, no adaptando los contratos de terceros que hay en el
 * material de referencia: aquellos describen un modelo distinto —sin custodia
 * de fondos, con comisión íntegra a cargo del vendedor y pago directo entre
 * las partes— y copiar su redacción sería además un problema de propiedad
 * intelectual.
 */

const AVISO_BORRADOR =
    'DOCUMENTO EN BORRADOR — PENDIENTE DE REVISIÓN LEGAL. No utilizar en operaciones reales sin la aprobación de un profesional matriculado.';

function pesos(cents: number, currency: string): string {
    const monto = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(cents / 100);
    return `${currency} ${monto}`;
}

function fechaLarga(f: Date): string {
    return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
        .format(f);
}

function describirParte(p: ContractParty, rol: string): string {
    const address = p.address ? `, con domicilio en ${p.address}` : '';
    return `${p.name}, mayor de edad, DNI ${p.dni}${address}, con correo electrónico ${p.email}, en adelante “${rol}”.`;
}

function encabezado(d: ContractData, titulo: string): string[] {
    return [
        AVISO_BORRADOR,
        '',
        titulo,
        '',
        `Referencia: ${d.reference}`,
        `Fecha: ${fechaLarga(d.date)}`,
        '',
        'COMPARECEN',
        '',
        `De una parte, ${d.platform.legalName}, CUIT ${d.platform.cuit}, con domicilio legal en ${d.platform.address} y correo electrónico ${d.platform.email}, en adelante “LA PLATAFORMA”.`,
    ];
}

const CLAUSULA_FIRMA = [
    'FIRMA ELECTRÓNICA.',
    'Las partes aceptan suscribir el presente mediante firma electrónica en los términos del artículo 5 de la Ley 25.506. Reconocen que no se trata de firma digital en el sentido del artículo 2 de dicha ley y que, por lo tanto, no goza de la presunción de autoría allí establecida; su valor probatorio queda sujeto a apreciación judicial.',
    'A los fines probatorios se registran, por cada firma, la identidad del firmante, la fecha y hora, la dirección IP desde la que se firmó y la huella criptográfica SHA-256 del presente documento. Cualquier modificación posterior al texto alteraría dicha huella y resultaría detectable.',
];

const CLAUSULA_DATOS = [
    'PROTECCIÓN DE DATOS PERSONALES.',
    'El tratamiento de los datos personales intercambiados se rige por la Ley 25.326. Cada parte se obliga a utilizarlos exclusivamente para el cumplimiento de este contrato, a no cederlos a terceros sin autorización y a adoptar las medidas de seguridad que la normativa exige.',
    'El titular de los datos puede ejercer los derechos de acceso, rectificación y supresión dirigiéndose a la dirección de correo consignada en el encabezado.',
];

function clausulaJurisdiccion(ciudad = 'la Ciudad Autónoma de Buenos Aires'): string[] {
    return [
        'LEY APLICABLE Y JURISDICCIÓN.',
        `El presente se rige por las leyes de la República Argentina. Para toda controversia derivada de su interpretación o cumplimiento, las partes se someten a los tribunales ordinarios de ${ciudad}, renunciando a cualquier otro fuero.`,
    ];
}

function numerar(clausulas: string[][]): string[] {
    const salida: string[] = ['CLÁUSULAS', ''];
    clausulas.forEach((bloque, i) => {
        const [titulo, ...cuerpo] = bloque;
        salida.push(`${i + 1}. ${titulo}`);
        cuerpo.forEach((p) => salida.push(p));
        salida.push('');
    });
    return salida;
}

function pieDeFirmas(roles: string[]): string[] {
    return [
        'FIRMAS',
        '',
        'Las partes suscriben el presente en la fecha indicada, prestando conformidad a la totalidad de sus términos.',
        '',
        ...roles.flatMap((r) => [`____________________________`, r, '']),
    ];
}

// ═══════════════════════════════════════════════════════════
// NDA del vendedor
// ═══════════════════════════════════════════════════════════

export function sellerNdaTemplate(d: ContractData): string {
    if (!d.seller) throw new Error('El NDA del vendedor requiere los datos del vendedor.');

    return [
        ...encabezado(d, 'ACUERDO DE CONFIDENCIALIDAD Y AUTORIZACIÓN DE PUBLICACIÓN'),
        `De la otra parte, ${describirParte(d.seller, 'EL VENDEDOR')}`,
        '',
        'Ambas partes se reconocen capacidad legal suficiente para obligarse y',
        '',
        'MANIFIESTAN',
        '',
        `I. Que LA PLATAFORMA opera un mercado de compraventa de activos digitales en el que actúa como intermediaria y depositaria, sin adquirir en ningún caso la titularidad definitiva de los activos que se negocian.`,
        `II. Que EL VENDEDOR declara ser titular exclusivo del siguiente activo digital: ${d.asset.description} (tipo: ${d.asset.type}), en adelante “EL ACTIVO”.`,
        'III. Que EL VENDEDOR desea ofrecer EL ACTIVO en venta a través de LA PLATAFORMA, para lo cual resulta necesario regular el tratamiento de la información sensible vinculada al mismo.',
        '',
        ...numerar([
            [
                'OBJETO.',
                'El presente regula la confidencialidad de la información que EL VENDEDOR aporta sobre EL ACTIVO y autoriza a LA PLATAFORMA a publicar una descripción del mismo con fines de comercialización.',
            ],
            [
                'ALCANCE DE LA PUBLICACIÓN.',
                'EL VENDEDOR autoriza a LA PLATAFORMA a publicar únicamente los datos que no permitan identificar unívocamente EL ACTIVO, tales como nicho, métricas agregadas de audiencia, ingresos declarados y país principal de la audiencia.',
                'Los datos que permiten identificar EL ACTIVO —enlace, identificador de la cuenta, métricas en crudo y antecedentes de sanciones— no serán publicados y sólo se revelarán a interesados que hayan suscrito previamente un acuerdo de confidencialidad con LA PLATAFORMA.',
            ],
            [
                'VERACIDAD DE LA INFORMACIÓN.',
                'EL VENDEDOR declara bajo juramento que la información aportada sobre EL ACTIVO es veraz, completa y actual, y asume la responsabilidad exclusiva por cualquier inexactitud. LA PLATAFORMA no verifica ni garantiza dicha información frente a terceros, sin perjuicio de las verificaciones que realice al momento de tomar EL ACTIVO en custodia.',
            ],
            [
                'CONFIDENCIALIDAD RECÍPROCA.',
                'Ambas partes se obligan a no divulgar la información confidencial de la otra a la que accedan con motivo de esta relación, y a mantener dicha reserva de modo indefinido, aun después de extinguido el presente.',
            ],
            [
                'SIN EXCLUSIVIDAD NI OBLIGACIÓN DE VENTA.',
                'La suscripción del presente no obliga a EL VENDEDOR a concretar venta alguna ni le impide ofrecer EL ACTIVO por otros medios. Tampoco obliga a LA PLATAFORMA a conseguir un comprador.',
            ],
            [
                'GRATUIDAD.',
                'La publicación de EL ACTIVO no tiene costo. LA PLATAFORMA sólo percibe remuneración si la operación de venta se perfecciona, conforme al contrato que en su caso se suscriba.',
            ],
            CLAUSULA_DATOS,
            CLAUSULA_FIRMA,
            clausulaJurisdiccion(),
        ]),
        ...pieDeFirmas(['EL VENDEDOR', 'LA PLATAFORMA']),
    ].join('\n');
}

// ═══════════════════════════════════════════════════════════
// NDA del comprador
// ═══════════════════════════════════════════════════════════

export function buyerNdaTemplate(d: ContractData): string {
    if (!d.buyer) throw new Error('El NDA del comprador requiere los datos del comprador.');

    return [
        ...encabezado(d, 'ACUERDO DE CONFIDENCIALIDAD PARA ACCESO A INFORMACIÓN RESERVADA'),
        `De la otra parte, ${describirParte(d.buyer, 'EL INTERESADO')}`,
        '',
        'Ambas partes se reconocen capacidad legal suficiente para obligarse y',
        '',
        'MANIFIESTAN',
        '',
        'I. Que LA PLATAFORMA publica activos digitales en venta manteniendo reservados los datos que permiten identificarlos, a pedido de sus titulares.',
        `II. Que EL INTERESADO desea acceder a la información reservada del siguiente activo: ${d.asset.description} (tipo: ${d.asset.type}), en adelante “EL ACTIVO”, con el fin de evaluar su eventual adquisición.`,
        '',
        ...numerar([
            [
                'OBJETO.',
                'Regular las condiciones bajo las cuales LA PLATAFORMA revela a EL INTERESADO la información reservada de EL ACTIVO.',
            ],
            [
                'INFORMACIÓN RESERVADA.',
                'Se considera reservada toda la información que LA PLATAFORMA revele a EL INTERESADO con motivo del presente y que no se encuentre públicamente disponible, en particular el enlace y el identificador de la cuenta, sus métricas en crudo, sus antecedentes de sanciones y la identidad de su titular.',
            ],
            [
                'OBLIGACIONES DE EL INTERESADO.',
                'EL INTERESADO se obliga a: (a) utilizar la información reservada exclusivamente para evaluar la adquisición de EL ACTIVO; (b) no divulgarla a terceros bajo ningún concepto; (c) no contactar directamente al titular de EL ACTIVO con el fin de concretar la operación por fuera de LA PLATAFORMA; y (d) no utilizarla para replicar, competir con o perjudicar EL ACTIVO.',
            ],
            [
                'CLÁUSULA PENAL.',
                'El incumplimiento de cualquiera de las obligaciones de la cláusula anterior faculta a LA PLATAFORMA a exigir, en concepto de cláusula penal conforme los artículos 790 y siguientes del Código Civil y Comercial, una suma equivalente al DIEZ POR CIENTO (10%) del precio publicado de EL ACTIVO, sin perjuicio del derecho a reclamar los daños que excedan dicho monto.',
                'La determinación de este importe considera que la remuneración de LA PLATAFORMA depende íntegramente de que la operación se perfeccione a través de ella.',
            ],
            [
                'DURACIÓN.',
                'Las obligaciones de confidencialidad asumidas subsisten de modo indefinido, con independencia de que EL INTERESADO concrete o no la adquisición de EL ACTIVO.',
            ],
            [
                'AUSENCIA DE OBLIGACIÓN DE COMPRA.',
                'La suscripción del presente no obliga a EL INTERESADO a formular oferta alguna, ni le otorga derecho de preferencia sobre EL ACTIVO.',
            ],
            CLAUSULA_DATOS,
            CLAUSULA_FIRMA,
            clausulaJurisdiccion(),
        ]),
        ...pieDeFirmas(['EL INTERESADO', 'LA PLATAFORMA']),
    ].join('\n');
}

// ═══════════════════════════════════════════════════════════
// Contrato tripartito de compraventa con custodia
// ═══════════════════════════════════════════════════════════

export function tripartiteTemplate(d: ContractData): string {
    if (!d.buyer || !d.seller || !d.price) {
        throw new Error('El contrato tripartito requiere comprador, vendedor y precio.');
    }

    const p = d.price;

    return [
        ...encabezado(d, 'CONTRATO DE COMPRAVENTA DE ACTIVO DIGITAL CON INTERMEDIACIÓN Y CUSTODIA'),
        `De otra parte, ${describirParte(d.seller, 'EL VENDEDOR')}`,
        `De otra parte, ${describirParte(d.buyer, 'EL COMPRADOR')}`,
        '',
        'Las tres partes se reconocen capacidad legal suficiente para obligarse y',
        '',
        'MANIFIESTAN',
        '',
        `I. Que EL VENDEDOR declara ser titular exclusivo del siguiente activo digital: ${d.asset.description} (tipo: ${d.asset.type}), en adelante “EL ACTIVO”.`,
        'II. Que EL COMPRADOR desea adquirir EL ACTIVO y ha tenido acceso a la información necesaria para evaluarlo.',
        'III. Que LA PLATAFORMA ha intermediado entre ambas partes y actuará como depositaria tanto de EL ACTIVO como del precio, en los términos que se establecen a continuación.',
        '',
        ...numerar([
            [
                'OBJETO.',
                'Regular la compraventa de EL ACTIVO entre EL VENDEDOR y EL COMPRADOR, y la intervención de LA PLATAFORMA como intermediaria y depositaria durante el proceso.',
            ],
            [
                'PRECIO Y REMUNERACIÓN.',
                `Precio acordado por EL ACTIVO: ${pesos(p.finalCents, p.currency)}.`,
                `EL COMPRADOR abonará a LA PLATAFORMA la suma total de ${pesos(p.buyerPaysCents, p.currency)}, comprensiva del precio y de una comisión del CINCO POR CIENTO (5%) a su cargo.`,
                `EL VENDEDOR percibirá la suma de ${pesos(p.sellerReceivesCents, p.currency)}, resultante de deducir del precio una comisión del CINCO POR CIENTO (5%) a su cargo.`,
                `La remuneración total de LA PLATAFORMA asciende a ${pesos(p.totalCommissionCents, p.currency)} y sólo se devenga si la operación se perfecciona.`,
                'Los impuestos y gastos de transferencia que la operación genere son ajenos a los importes aquí consignados y quedan a cargo de la parte que la normativa aplicable determine.',
            ],
            [
                'MEDIO DE PAGO.',
                'Los pagos se realizarán exclusivamente mediante transferencia bancaria a la cuenta que LA PLATAFORMA indique. No se admiten medios de pago que habiliten la reversión unilateral de la operación por parte del ordenante.',
            ],
            [
                'PROCEDIMIENTO Y CUSTODIA.',
                'La operación se ejecuta en el siguiente orden, y ninguna etapa se inicia sin que la anterior se encuentre cumplida:',
                'a) Suscripción del presente por las tres partes.',
                'b) EL VENDEDOR transfiere a LA PLATAFORMA la titularidad de EL ACTIVO, quien la recibe en carácter de depositaria y no de adquirente.',
                'c) LA PLATAFORMA verifica la efectiva recepción de EL ACTIVO, su estado y sus métricas, y deja constancia de dicha verificación.',
                'd) Verificada la recepción, LA PLATAFORMA requiere a EL COMPRADOR el pago previsto en la cláusula 2. Con anterioridad a este momento EL COMPRADOR no está obligado a desembolso alguno.',
                'e) Acreditado el pago, LA PLATAFORMA transfiere EL ACTIVO a EL COMPRADOR y liquida a EL VENDEDOR el importe que le corresponde.',
                'La finalidad de esta secuencia es que ninguna de las partes deba entregar su prestación confiando en la buena fe de la otra.',
            ],
            [
                'OBLIGACIONES DE LA PLATAFORMA COMO DEPOSITARIA.',
                'Mientras EL ACTIVO se encuentre bajo su custodia, LA PLATAFORMA se obliga a conservarlo, a no explotarlo ni modificarlo, y a no disponer de él para finalidad distinta de la ejecución del presente.',
                'Los fondos recibidos de EL COMPRADOR se mantienen afectados a esta operación hasta su liquidación y no integran el patrimonio de libre disposición de LA PLATAFORMA.',
            ],
            [
                'DECLARACIONES DE EL VENDEDOR.',
                'EL VENDEDOR declara que EL ACTIVO se encuentra libre de gravámenes, litigios, sanciones vigentes y reclamos de terceros, y que su transferencia no infringe los términos de servicio de la plataforma en la que se aloja.',
                'La falsedad de estas declaraciones habilita a EL COMPRADOR a resolver el contrato y a reclamar los daños que acredite.',
            ],
            [
                'RESPONSABILIDAD DE LA PLATAFORMA.',
                'LA PLATAFORMA responde por el cumplimiento diligente de sus obligaciones como intermediaria y depositaria.',
                'No responde por la veracidad de las declaraciones de EL VENDEDOR sobre EL ACTIVO, ni por el desempeño futuro de éste, ni por decisiones que adopte la plataforma tecnológica en la que EL ACTIVO se aloja.',
            ],
            [
                'FRUSTRACIÓN DE LA OPERACIÓN.',
                'Si la operación no se perfecciona por causas ajenas a LA PLATAFORMA con anterioridad a la entrega de EL ACTIVO a EL COMPRADOR, LA PLATAFORMA restituirá a cada parte lo que hubiera recibido de ella y no percibirá remuneración alguna.',
                'La restitución se practicará dentro de los DIEZ (10) días hábiles de constatada la frustración, por el mismo medio por el que se recibió.',
            ],
            [
                'CONFIDENCIALIDAD.',
                'Las partes mantendrán reserva sobre los términos de la operación y sobre la información que se hubieran revelado con motivo de ella, de modo indefinido.',
            ],
            CLAUSULA_DATOS,
            CLAUSULA_FIRMA,
            clausulaJurisdiccion(),
        ]),
        ...pieDeFirmas(['EL COMPRADOR', 'EL VENDEDOR', 'LA PLATAFORMA']),
    ].join('\n');
}
