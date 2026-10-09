import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));

const { mensajeErrorVehiculo } = await import('./vehiculos');

describe('mensajeErrorVehiculo', () => {
  it('matrícula duplicada en el mismo taller: mensaje claro', () => {
    expect(mensajeErrorVehiculo({ code: '23505', message: 'duplicate key value violates unique index "vehiculos_empresa_matricula_uq"' }))
      .toBe('Ya tienes un vehículo registrado con esa matrícula.');
  });

  it('bastidor duplicado en el mismo taller: mensaje claro', () => {
    expect(mensajeErrorVehiculo({ code: '23505', message: 'duplicate key value violates unique index "vehiculos_empresa_bastidor_uq"' }))
      .toBe('Ya tienes un vehículo registrado con ese número de bastidor.');
  });

  it('cualquier otro error se deja tal cual', () => {
    expect(mensajeErrorVehiculo({ code: '23503', message: 'violates foreign key constraint' })).toBe('violates foreign key constraint');
    expect(mensajeErrorVehiculo({ message: 'network error' })).toBe('network error');
  });
});
