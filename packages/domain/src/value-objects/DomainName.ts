import { ValidationError } from '../errors/DomainError';

const MAX_LABEL_LENGTH = 63;
const MAX_NAME_LENGTH = 253;

/** Una etiqueta: letras, números y guiones, sin guion al principio ni al final. */
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const AYUDA =
    'Indicá solo el nombre del sitio, por ejemplo ejemplo.com. ' +
    'Podés copiarlo desde la barra de direcciones: ignoramos el https://, el www. y la ruta.';

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

    public static parse(entrada: string): DomainName {
        let texto = (entrada ?? '').trim().toLowerCase();
        if (texto === '') {
            throw new ValidationError(`Falta el dominio del sitio. ${AYUDA}`);
        }

        texto = texto.replace(/^https?:\/\//, '');
        // Lo que sigue al nombre: ruta, consulta o ancla.
        texto = texto.split(/[/?#]/)[0] ?? '';
        texto = texto.replace(/:\d+$/, '');
        texto = texto.replace(/\.$/, '');
        texto = texto.replace(/^www\./, '');

        if (texto === '' || texto.length > MAX_NAME_LENGTH) {
            throw new ValidationError(`Ese dominio no tiene un formato válido. ${AYUDA}`);
        }

        const etiquetas = texto.split('.');
        if (etiquetas.length < 2) {
            throw new ValidationError(`Ese dominio no tiene extensión (como .com). ${AYUDA}`);
        }

        for (const etiqueta of etiquetas) {
            if (etiqueta.length > MAX_LABEL_LENGTH || !LABEL.test(etiqueta)) {
                throw new ValidationError(`Ese dominio no tiene un formato válido. ${AYUDA}`);
            }
        }

        // Una extensión toda numérica es una dirección IP, no un dominio.
        if (/^[0-9]+$/.test(etiquetas[etiquetas.length - 1]!)) {
            throw new ValidationError(`Ese dominio no tiene un formato válido. ${AYUDA}`);
        }

        return new DomainName(texto);
    }

    public equals(otro: DomainName): boolean {
        return this.value === otro.value;
    }

    public toString(): string {
        return this.value;
    }
}
