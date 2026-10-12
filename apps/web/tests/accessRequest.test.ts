import { describe, it, expect } from 'vitest';
import { accessDialogShouldClose } from '@/lib/accessRequest';

describe('accessDialogShouldClose', () => {
    it('cierra cuando el aviso salió bien', () => {
        expect(accessDialogShouldClose({ ok: true }, false)).toBe(true);
    });

    it('no cierra mientras la acción sigue en curso', () => {
        expect(accessDialogShouldClose({}, true)).toBe(false);
        expect(accessDialogShouldClose({ ok: true }, true)).toBe(false);
    });

    it('no cierra si hubo un error: el diálogo lo muestra', () => {
        expect(accessDialogShouldClose({ error: 'No pudimos registrar el aviso.' }, false)).toBe(false);
    });

    it('no cierra antes de que se haya tocado nada', () => {
        expect(accessDialogShouldClose({}, false)).toBe(false);
    });
});
