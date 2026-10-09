import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FilaValidada } from '../../utils/csvImport';

// Mock mínimo de Supabase: cada tabla tiene un `insert` y un `select` que se programan por test.
const { insertar, seleccionar } = vi.hoisted(() => ({
  insertar: vi.fn(),
  seleccionar: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: (tabla: string) => ({
      insert: (rows: unknown) => {
        const resultado = insertar(tabla, rows);
        // .select('id') devuelve el resultado; sin .select() también es "thenable".
        return Object.assign(Promise.resolve(resultado), { select: () => Promise.resolve(resultado) });
      },
      select: (cols: string) => ({
        order: () => ({ range: (desde: number) => Promise.resolve(seleccionar(tabla, cols, desde)) }),
      }),
    }),
  },
}));

const { importarFilas, cargarExistentes } = await import('./importacion');

const cliente = (linea: number, nombre: string, nif = ''): FilaValidada => ({
  linea, errores: [], avisos: [], duplicado: null,
  datos: { nombre, apellidos: '', nif, correo: '', telefono: '', direccion: '', ciudad: '', pais: '' },
});
const vehiculo = (linea: number, matricula: string, clienteNif = '', clienteCorreo = ''): FilaValidada => ({
  linea, errores: [], avisos: [], duplicado: null,
  datos: { matricula, marca: 'Seat', modelo: 'Ibiza', bastidor: '', anio: null, color: '', combustible: null, kilometraje: 0, itv: null, seguro: null, impuesto: null, clienteNif, clienteCorreo },
});
const producto = (linea: number, nombre: string, stock: number): FilaValidada => ({
  linea, errores: [], avisos: [], duplicado: null,
  datos: { nombre, sku: '', descripcion: '', precioVenta: 10, costo: 5, stock, stockMinimo: 0, unidad: 'ud' },
});

beforeEach(() => {
  insertar.mockReset();
  seleccionar.mockReset();
});

describe('importarFilas — clientes', () => {
  it('inserta en lotes de 200', async () => {
    insertar.mockImplementation((_t, rows: unknown[]) => ({ data: rows.map((_, i) => ({ id: `id${i}` })), error: null }));
    const filas = Array.from({ length: 450 }, (_, i) => cliente(i + 2, `C${i}`));
    const r = await importarFilas('clientes', filas);
    expect(r).toEqual({ importadas: 450, fallidas: [], avisos: [] });
    expect(insertar.mock.calls.map((c) => (c[1] as unknown[]).length)).toEqual([200, 200, 50]);
  });

  it('si un lote falla, reintenta fila a fila e importa el resto indicando cuál falló', async () => {
    insertar.mockImplementation((_t, rows: { nombre: string }[]) => {
      if (rows.length > 1) return { data: null, error: { message: 'lote rechazado' } };
      if (rows[0].nombre === 'MALO') return { data: null, error: { message: 'valor no permitido' } };
      return { data: [{ id: 'x' }], error: null };
    });
    const r = await importarFilas('clientes', [cliente(2, 'A'), cliente(3, 'MALO'), cliente(4, 'B')]);
    expect(r.importadas).toBe(2);
    expect(r.fallidas).toEqual([{ linea: 3, mensaje: 'valor no permitido' }]);
  });

  it('informa del progreso', async () => {
    insertar.mockImplementation((_t, rows: unknown[]) => ({ data: rows.map(() => ({ id: 'x' })), error: null }));
    const pasos: [number, number][] = [];
    await importarFilas('clientes', Array.from({ length: 250 }, (_, i) => cliente(i + 2, `C${i}`)), (h, t) => pasos.push([h, t]));
    expect(pasos).toEqual([[200, 250], [250, 250]]);
  });
});

describe('importarFilas — vehículos', () => {
  it('asigna el propietario por NIF (normalizado) o por correo, y avisa si no lo encuentra', async () => {
    seleccionar.mockImplementation((tabla: string) => ({
      data: tabla === 'clientes'
        ? [{ id: 'c-ana', nif_nie_pasaporte: '12345678Z', correo: 'ana@x.com' }, { id: 'c-luis', nif_nie_pasaporte: '', correo: 'luis@x.com' }]
        : [],
      error: null,
    }));
    insertar.mockImplementation((tabla: string, rows: unknown[]) =>
      tabla === 'vehiculos' ? { data: rows.map((_, i) => ({ id: `v${i}` })), error: null } : { data: null, error: null });

    const r = await importarFilas('vehiculos', [
      vehiculo(2, '1111AAA', '12345678-Z'),
      vehiculo(3, '2222BBB', '', 'luis@x.com'),
      vehiculo(4, '3333CCC', '99999999R'),
      vehiculo(5, '4444DDD'),
    ]);
    expect(r.importadas).toBe(4);
    expect(r.avisos).toEqual([{ linea: 4, mensaje: expect.stringContaining('no se encontró al propietario') }]);
    const vinculos = insertar.mock.calls.find((c) => c[0] === 'cliente_vehiculo')![1];
    expect(vinculos).toEqual([
      { cliente_id: 'c-ana', vehiculo_id: 'v0' },
      { cliente_id: 'c-luis', vehiculo_id: 'v1' },
    ]);
  });

  it('no consulta clientes si ningún vehículo trae propietario', async () => {
    insertar.mockImplementation((_t, rows: unknown[]) => ({ data: rows.map(() => ({ id: 'v' })), error: null }));
    await importarFilas('vehiculos', [vehiculo(2, '1111AAA')]);
    expect(seleccionar).not.toHaveBeenCalled();
    expect(insertar.mock.calls.some((c) => c[0] === 'cliente_vehiculo')).toBe(false);
  });

  it('traduce el error de matrícula repetida a un mensaje claro', async () => {
    insertar.mockImplementation((_t, rows: unknown[]) =>
      rows.length > 1 ? { data: null, error: { message: 'dup' } }
        : { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "vehiculos_empresa_matricula_uq"' } });
    const r = await importarFilas('vehiculos', [vehiculo(2, '1111AAA'), vehiculo(3, '2222BBB')]);
    expect(r.fallidas.map((f) => f.mensaje)).toEqual(Array(2).fill('Ya tienes un vehículo registrado con esa matrícula.'));
  });
});

describe('importarFilas — inventario', () => {
  it('registra el stock inicial como movimiento de entrada solo si es mayor que 0', async () => {
    insertar.mockImplementation((tabla: string, rows: unknown[]) =>
      tabla === 'productos' ? { data: rows.map((_, i) => ({ id: `p${i}` })), error: null } : { data: null, error: null });
    const r = await importarFilas('productos', [producto(2, 'Filtro', 24), producto(3, 'Aceite', 0), producto(4, 'Bujía', 8)]);
    expect(r.importadas).toBe(3);
    const mov = insertar.mock.calls.find((c) => c[0] === 'movimientos_stock')![1] as { producto_id: string; cantidad: number; tipo: string }[];
    expect(mov.map((m) => [m.producto_id, m.tipo, m.cantidad])).toEqual([['p0', 'entrada', 24], ['p2', 'entrada', 8]]);
  });

  it('un error al registrar el stock se avisa pero no se pierde el artículo', async () => {
    insertar.mockImplementation((tabla: string, rows: unknown[]) =>
      tabla === 'productos' ? { data: rows.map(() => ({ id: 'p' })), error: null } : { data: null, error: { message: 'sin permiso' } });
    const r = await importarFilas('productos', [producto(2, 'Filtro', 5)]);
    expect(r.importadas).toBe(1);
    expect(r.avisos[0].mensaje).toContain('sin permiso');
  });
});

describe('cargarExistentes', () => {
  it('lee por páginas de 1000 hasta agotar los datos', async () => {
    const pagina = (n: number) => Array.from({ length: n }, (_, i) => ({ matricula: `M${i}`, bastidor: null }));
    seleccionar.mockImplementation((_t, _c, desde: number) => ({ data: desde === 0 ? pagina(1000) : pagina(200), error: null }));
    const ex = await cargarExistentes('vehiculos');
    expect(ex.vehiculos).toHaveLength(1200);
    expect(seleccionar.mock.calls.map((c) => c[2])).toEqual([0, 1000]);
    expect(ex.vehiculos![0].bastidor).toBe('');
  });

  it('propaga el error si la lectura falla (no se importa a ciegas)', async () => {
    seleccionar.mockReturnValue({ data: null, error: { message: 'sin conexión' } });
    await expect(cargarExistentes('clientes')).rejects.toThrow('sin conexión');
  });
});
