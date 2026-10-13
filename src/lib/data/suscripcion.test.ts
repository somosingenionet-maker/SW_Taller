import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const { avisoSuscripcion, diasRestantes, finPeriodo } = await import('./suscripcion');

const AHORA = new Date('2026-10-13T12:00:00Z').getTime();
const en = (dias: number) => new Date(AHORA + dias * 86_400_000).toISOString();
const base = { estado: 'activa', estadoStripe: 'activa', accesoHasta: null, periodoFin: null, pruebaHasta: null, plan: null, cancelarAlFinal: false, tieneCliente: false, puedeEscribir: true } as const;

describe('diasRestantes', () => {
  it('redondea hacia arriba y no baja de 0', () => {
    expect(diasRestantes(en(5), AHORA)).toBe(5);
    expect(diasRestantes(new Date(AHORA + 3_600_000).toISOString(), AHORA)).toBe(1);
    expect(diasRestantes(en(-1), AHORA)).toBe(0);
    expect(diasRestantes(null, AHORA)).toBe(0);
  });
});

describe('avisoSuscripcion', () => {
  it('sin límite y activa al día: sin aviso', () => {
    expect(avisoSuscripcion({ ...base, estado: 'sin_limite' }, AHORA)).toBeNull();
    expect(avisoSuscripcion({ ...base }, AHORA)).toBeNull();
  });

  it('prueba: informa los días y se vuelve aviso en los últimos 3', () => {
    expect(avisoSuscripcion({ ...base, estado: 'prueba', estadoStripe: 'prueba', accesoHasta: en(10) }, AHORA)).toMatchObject({ nivel: 'info', texto: 'Prueba gratuita: te quedan 10 días.', accion: 'suscribirse' });
    expect(avisoSuscripcion({ ...base, estado: 'prueba', estadoStripe: 'prueba', accesoHasta: en(3) }, AHORA)?.nivel).toBe('aviso');
    expect(avisoSuscripcion({ ...base, estado: 'prueba', estadoStripe: 'prueba', accesoHasta: en(0.5) }, AHORA)?.texto).toContain('termina hoy o mañana');
  });

  it('activa pero cancelada: avisa de la fecha de fin', () => {
    const a = avisoSuscripcion({ ...base, cancelarAlFinal: true, accesoHasta: en(20) }, AHORA);
    expect(a?.nivel).toBe('info');
    expect(a?.accion).toBe('gestionar');
    expect(a?.texto).toContain('cancelada');
  });

  it('impago: aviso con acción de gestionar el pago', () => {
    expect(avisoSuscripcion({ ...base, estado: 'impago', estadoStripe: 'impago', accesoHasta: en(2) }, AHORA)).toMatchObject({ nivel: 'aviso', accion: 'gestionar' });
  });

  it('vencida tras la prueba: error y propone suscribirse', () => {
    const a = avisoSuscripcion({ ...base, estado: 'vencida', estadoStripe: 'prueba', puedeEscribir: false }, AHORA);
    expect(a).toMatchObject({ nivel: 'error', accion: 'suscribirse' });
    expect(a?.texto).toContain('prueba gratuita ha terminado');
  });

  it('vencida de un cliente que ya pagó: propone gestionar el pago', () => {
    const a = avisoSuscripcion({ ...base, estado: 'vencida', estadoStripe: 'impago', tieneCliente: true, puedeEscribir: false }, AHORA);
    expect(a).toMatchObject({ nivel: 'error', accion: 'gestionar' });
    expect(a?.texto).toContain('suscripción ha terminado');
  });

  it('cancelada con acceso vigente: informa y permite reactivar', () => {
    expect(avisoSuscripcion({ ...base, estado: 'cancelada', estadoStripe: 'cancelada', accesoHasta: en(5) }, AHORA)).toMatchObject({ nivel: 'info', accion: 'suscribirse' });
  });
});

describe('finPeriodo', () => {
  it('usa el fin real del periodo cuando lo hay', () => {
    expect(finPeriodo({ periodoFin: en(30), accesoHasta: en(33) })).toBe(en(30));
  });
  it('si no, resta el margen de 3 días al acceso (empresas anteriores a la columna)', () => {
    expect(finPeriodo({ periodoFin: null, accesoHasta: en(33) })).toBe(en(30));
    expect(finPeriodo({ periodoFin: null, accesoHasta: null })).toBeNull();
  });
  it('el aviso de cancelación habla del fin del periodo, no del margen', () => {
    const a = avisoSuscripcion({ ...base, cancelarAlFinal: true, periodoFin: en(10), accesoHasta: en(13) }, AHORA);
    expect(a?.texto).toBe(`Tu suscripción está cancelada y termina el ${new Date(en(10)).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.`);
  });
});
