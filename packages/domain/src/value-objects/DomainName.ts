import { ValidationError } from '../errors/DomainError';

const MAX_LABEL_LENGTH = 63;
const MAX_NAME_LENGTH = 253;

/** Una etiqueta: letras, números y guiones, sin guion al principio ni al final. */
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const HELP =
    'Indicá solo el nombre del sitio, por ejemplo ejemplo.com. ' +
    'Podés copiarlo desde la barra de direcciones: ignoramos el https://, el www. y la ruta.';

const INVALID_FORMAT = `Ese dominio no tiene un formato válido: tiene que ser algo como ejemplo.com. ${HELP}`;

/**
 * Nombre de dominio de un sitio, reducido a lo que el DNS sabe consultar.
 *
 * El vendedor escribe lo que tiene a mano: con esquema, con `www.`, con una
 * ruta. La verificación por registro TXT consulta y deriva su desafío del
 * nombre pelado, así que normalizarlo es una regla del negocio —de ella
 * depende que dos escrituras del mismo sitio den el mismo desafío— y vive acá,
 * probada sin red.
 *
 * Se descarta solo el `www.` inicial: cualquier otro subdominio es otro nombre.
 */
export class DomainName {
    private constructor(public readonly value: string) {}

    public static parse(input: string): DomainName {
        let text = (input ?? '').trim().toLowerCase();
        if (text === '') {
            throw new ValidationError(`Falta el dominio del sitio. ${HELP}`);
        }

        text = text.replace(/^https?:\/\//, '');
        // Lo que sigue al nombre: ruta, consulta o ancla.
        text = text.split(/[/?#]/)[0] ?? '';
        text = text.replace(/:\d+$/, '');
        text = text.replace(/\.$/, '');
        text = text.replace(/^www\./, '');

        if (text === '') {
            throw new ValidationError(INVALID_FORMAT);
        }

        text = DomainName.toAscii(text);

        if (text.length > MAX_NAME_LENGTH) {
            throw new ValidationError(INVALID_FORMAT);
        }

        const labels = text.split('.');
        if (labels.length < 2) {
            throw new ValidationError(`Ese dominio no tiene extensión (como .com). ${HELP}`);
        }

        for (const label of labels) {
            if (label.length > MAX_LABEL_LENGTH || !LABEL.test(label)) {
                throw new ValidationError(INVALID_FORMAT);
            }
        }

        // Una extensión toda numérica es una dirección IP, no un dominio.
        if (/^[0-9]+$/.test(labels[labels.length - 1]!)) {
            throw new ValidationError(INVALID_FORMAT);
        }

        return new DomainName(text);
    }

    /**
     * Pasa un nombre internacionalizado (`niño.com.ar`) a su forma ASCII
     * (`xn--nio-8ma.com.ar`), que es la que consulta el DNS. Si el nombre no se
     * puede interpretar se devuelve tal cual y la validación de etiquetas lo
     * rechaza.
     */
    private static toAscii(host: string): string {
        try {
            return new URL(`http://${host}`).hostname;
        } catch {
            return host;
        }
    }

    public equals(other: DomainName): boolean {
        return this.value === other.value;
    }

    public toString(): string {
        return this.value;
    }
}
