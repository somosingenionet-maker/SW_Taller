import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const { clasificarErrorPortal, SIN_CONEXION, ErrorPortal } = await import('./invocarPortal');

describe('clasificarErrorPortal', () => {
  it('sin respuesta del servidor y mensaje de red: sin conexión, en español', () => {
    for (const m of ['Failed to send a request to the Edge Function', 'Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      const e = clasificarErrorPortal(m);
      expect(e.tipo).toBe('conexion');
      expect(e.message).toBe(SIN_CONEXION);
      expect(e.message).not.toContain(m);
    }
  });
  it('sin respuesta y mensaje raro: fallo pasajero, no «enlace no válido»', () => {
    const e = clasificarErrorPortal('algo inesperado');
    expect(e.tipo).toBe('temporal');
  });
  it('404: el enlace no vale (con el texto del servidor si lo hay)', () => {
    expect(clasificarErrorPortal('x', 404, 'Este enlace no es válido.')).toMatchObject({ tipo: 'enlace', message: 'Este enlace no es válido.' });
    expect(clasificarErrorPortal('x', 404).tipo).toBe('enlace');
  });
  it('429 y 5xx: el enlace puede ser bueno, es un fallo pasajero', () => {
    expect(clasificarErrorPortal('x', 429, 'Demasiadas peticiones. Inténtalo de nuevo en un momento.')).toMatchObject({ tipo: 'temporal', message: 'Demasiadas peticiones. Inténtalo de nuevo en un momento.' });
    for (const s of [500, 502, 503]) {
      const e = clasificarErrorPortal('Error interno.', s, 'Error interno.');
      expect(e.tipo).toBe('temporal');
      expect(e.message).toContain('Inténtalo de nuevo');
    }
  });
  it('400/403/409: se enseña lo que dice el servidor (validación o permiso)', () => {
    expect(clasificarErrorPortal('x', 409, 'Esta orden ya no está en reparación.').message).toBe('Esta orden ya no está en reparación.');
    expect(clasificarErrorPortal('x', 403, 'No autorizado.').message).toBe('No autorizado.');
  });
  it('es un Error normal con su tipo', () => {
    const e = clasificarErrorPortal('x', 404);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ErrorPortal);
  });
});
