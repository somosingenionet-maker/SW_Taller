import { describe, expect, it } from 'vitest';
import { esRetroceso, progresoPasos, siguientePaso } from './etapasOrden';

describe('pasos de una orden', () => {
  it('cada estado apunta al siguiente, hasta entregar', () => {
    expect(siguientePaso('presupuesto')).toEqual({ estado: 'recibido', accion: 'Recibir el coche' });
    expect(siguientePaso('recibido')?.estado).toBe('en_reparacion');
    expect(siguientePaso('en_reparacion')?.estado).toBe('listo');
    expect(siguientePaso('listo')?.estado).toBe('entregado');
    expect(siguientePaso('entregado')).toBeNull();
    expect(siguientePaso('cancelado')).toBeNull();
  });
  it('progreso y retroceso', () => {
    expect(progresoPasos('en_reparacion')).toEqual({ actual: 2, total: 5 });
    expect(progresoPasos('cancelado')).toBeNull();
    expect(esRetroceso('listo', 'recibido')).toBe(true);
    expect(esRetroceso('recibido', 'listo')).toBe(false);
    expect(esRetroceso('recibido', 'recibido')).toBe(false);
  });
});
