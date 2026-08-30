'use server';

import { redirect } from 'next/navigation';
import { cerrarSesion } from '@/lib/sesion';

export async function cerrarSesionAccion(): Promise<void> {
    await cerrarSesion();
    redirect('/');
}
