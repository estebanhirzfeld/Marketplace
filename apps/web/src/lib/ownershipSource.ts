/** La fuente que sí pasa por el consentimiento de Google. */
export type OAuthOwnershipSource = 'youtube' | 'adsense';

/** Cómo se nombra la fuente de titularidad en pantalla («Con tu cuenta de…», «Comprobar con…»). */
export function ownershipSourceLabel(source: string): string {
    if (source === 'adsense') return 'AdSense';
    if (source === 'dns') return 'tu DNS';
    return 'YouTube';
}

/**
 * La fuente con la que se redirige a Google. DNS no pasa por Google: su
 * alternativa con Google es AdSense, que además verifica los ingresos.
 */
export function oauthOwnershipSource(source: 'youtube' | 'adsense' | 'dns'): OAuthOwnershipSource {
    return source === 'dns' ? 'adsense' : source;
}
