import { ContractType } from '../entities/Contract';
import { hashDocument } from '../services/DocumentHash';
import { ContractData } from './ContractData';
import {
    buyerNdaTemplate,
    sellerNdaTemplate,
    tripartiteTemplate,
} from './ContractTemplates';

export interface GeneratedDocument {
    text: string;
    hash: string;
}

const TEMPLATES: Record<ContractType, (d: ContractData) => string> = {
    seller_nda: sellerNdaTemplate,
    buyer_nda: buyerNdaTemplate,
    tripartite: tripartiteTemplate,
};

/**
 * Arma el documento de un contrato y calcula su huella.
 *
 * La generación es determinista: los mismos datos producen exactamente el
 * mismo texto y el mismo hash. Eso es lo que permite no guardar el documento
 * y aun así demostrar qué se firmó — se regenera y se compara la huella.
 *
 * La única entrada variable es la fecha, que forma parte de los datos y queda
 * fijada al momento de crear el contrato.
 */
export async function generateDocument(data: ContractData): Promise<GeneratedDocument> {
    const template = TEMPLATES[data.type];
    if (!template) {
        throw new Error(`No hay plantilla para el tipo de contrato: ${data.type}`);
    }

    const text = template(data);
    return { text, hash: await hashDocument(text) };
}

/**
 * ¿El documento que se regeneró es el que se firmó?
 *
 * Es la verificación que le da sentido a guardar solo la huella.
 */
export async function documentMatches(
    data: ContractData,
    signedHash: string,
): Promise<boolean> {
    const { hash } = await generateDocument(data);
    return hash === signedHash.toLowerCase();
}
