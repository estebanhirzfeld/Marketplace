import { describe, it, expect } from 'vitest';
import { siteBaseUrl, siteMetadata, SITE_NAME } from '@/lib/siteMetadata';
import { alt, size, contentType } from '@/app/opengraph-image';

describe('siteBaseUrl', () => {
    it('sin la variable, usa el dominio público', () => {
        expect(siteBaseUrl(undefined).href).toBe('https://traspaso.forzalabs.online/');
    });

    it('una variable vacía o en blanco no rompe: cae al dominio público', () => {
        expect(siteBaseUrl('').hostname).toBe('traspaso.forzalabs.online');
        expect(siteBaseUrl('   ').hostname).toBe('traspaso.forzalabs.online');
    });

    it('una dirección que no es una URL no rompe el render', () => {
        expect(siteBaseUrl('no es una url').hostname).toBe('traspaso.forzalabs.online');
    });

    it('respeta la variable cuando tiene contenido', () => {
        expect(siteBaseUrl('https://demo.example.com/').origin).toBe('https://demo.example.com');
    });
});

describe('siteMetadata', () => {
    const metadata = siteMetadata(undefined);

    it('define metadataBase para que las imágenes salgan con dirección absoluta', () => {
        expect(String(metadata.metadataBase)).toBe('https://traspaso.forzalabs.online/');
    });

    it('mantiene título y describe los dos tipos de activo', () => {
        expect(metadata.title).toBe('Traspaso · Compraventa de activos digitales con custodia');
        expect(metadata.description).toMatch(/YouTube/);
        expect(metadata.description).toMatch(/sitios web/);
        expect(metadata.applicationName).toBe(SITE_NAME);
    });

    it('trae Open Graph de sitio web en español de Argentina', () => {
        expect(metadata.openGraph).toMatchObject({
            type: 'website',
            locale: 'es_AR',
            url: '/',
            siteName: SITE_NAME,
            title: metadata.title,
            description: metadata.description,
        });
    });

    it('trae la tarjeta de Twitter con imagen grande', () => {
        expect(metadata.twitter).toMatchObject({
            card: 'summary_large_image',
            title: metadata.title,
            description: metadata.description,
        });
    });

    it('declara el ícono y el apple-touch-icon de la marca', () => {
        const icons = metadata.icons as { icon: unknown; apple: unknown };
        expect(JSON.stringify(icons.icon)).toContain('/brand/traspaso-icono-app-512.png');
        expect(JSON.stringify(icons.apple)).toContain('/brand/traspaso-icono-app-120.png');
    });

    it('sigue gobernando robots con SEARCH_INDEXING', () => {
        expect(metadata.robots).toEqual({ index: true, follow: true });
    });
});

describe('imagen para compartir', () => {
    it('es un PNG de 1200×630 con texto alternativo', () => {
        expect(size).toEqual({ width: 1200, height: 630 });
        expect(contentType).toBe('image/png');
        expect(alt).toMatch(/Traspaso/);
    });
});
