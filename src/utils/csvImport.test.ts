import { describe, expect, it } from 'vitest';
import {
  autoMapear, decodificarArchivo, detectarSeparador, faltanObligatorios, informeOmitidos, MAX_FILAS_IMPORTACION,
  normalizarCabecera, parsearCsv, parsearCombustible, parsearFecha, parsearNumero, plantillaCsv, validarFilas,
  type DatosCliente, type DatosProducto, type DatosVehiculo,
} from './csvImport';

describe('lectura del CSV', () => {
  it('detecta el separador (; , tabulador) ignorando los que van entre comillas', () => {
    expect(detectarSeparador('a;b;c\n1;2;3')).toBe(';');
    expect(detectarSeparador('a,b,c\n1,2,3')).toBe(',');
    expect(detectarSeparador('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectarSeparador('"a,b";c;d\n1;2;3')).toBe(';');
    expect(detectarSeparador('solo una columna')).toBe(',');
  });

  it('parsea comillas, comillas escapadas, saltos dentro de comillas y CRLF', () => {
    const csv = 'nombre;nota\r\n"Pérez; Ana";"dice ""hola"""\r\nLuis;"línea1\nlínea2"\r\n';
    expect(parsearCsv(csv)).toEqual([
      ['nombre', 'nota'],
      ['Pérez; Ana', 'dice "hola"'],
      ['Luis', 'línea1\nlínea2'],
    ]);
  });

  it('descarta filas vacías (típicas al final de un export de Excel) pero conserva celdas vacías', () => {
    expect(parsearCsv('a;b;c\n1;;3\n;;;\n\n')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });

  it('no pierde la última fila si no acaba en salto de línea', () => {
    expect(parsearCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('decodifica UTF-8 con BOM y cae a Windows-1252 si no es UTF-8 válido', () => {
    const utf8 = new TextEncoder().encode('﻿nombre;país\nÑandú;España');
    expect(decodificarArchivo(utf8.buffer as ArrayBuffer)).toBe('nombre;país\nÑandú;España');
    // "Pérez" en Windows-1252: é = 0xE9 (UTF-8 inválido).
    const win = new Uint8Array([0x50, 0xe9, 0x72, 0x65, 0x7a]);
    expect(decodificarArchivo(win.buffer as ArrayBuffer)).toBe('Pérez');
  });
});

describe('valores', () => {
  it('parsea números en formato español y anglosajón', () => {
    expect(parsearNumero('1.234,56')).toBe(1234.56);
    expect(parsearNumero('1,234.56')).toBe(1234.56);
    expect(parsearNumero('12,5 €')).toBe(12.5);
    expect(parsearNumero('1 234,50')).toBe(1234.5);
    expect(parsearNumero('1.234')).toBe(1234);
    expect(parsearNumero('3.5')).toBe(3.5);
    expect(parsearNumero('85000')).toBe(85000);
    expect(parsearNumero('')).toBeNull();
    expect(parsearNumero('abc')).toBeNull();
    expect(parsearNumero('12,5,3')).toBeNull();
  });

  it('parsea fechas dd/mm/aaaa, ISO, años de 2 cifras y serie de Excel; rechaza las imposibles', () => {
    expect(parsearFecha('15/03/2027')).toBe('2027-03-15');
    expect(parsearFecha('5-3-27')).toBe('2027-03-05');
    expect(parsearFecha('2027-03-15')).toBe('2027-03-15');
    expect(parsearFecha('45000')).toBe('2023-03-15');
    expect(parsearFecha('31/02/2027')).toBeNull();
    expect(parsearFecha('2027-13-01')).toBeNull();
    expect(parsearFecha('mañana')).toBeNull();
    expect(parsearFecha('')).toBeNull();
  });

  it('reconoce combustibles habituales', () => {
    expect(parsearCombustible('Diésel')).toBe('diesel');
    expect(parsearCombustible('GASOLINA')).toBe('gasolina');
    expect(parsearCombustible('Eléctrico')).toBe('electrico');
    expect(parsearCombustible('Híbrido')).toBe('hibrido');
    expect(parsearCombustible('GLP')).toBe('otro');
    expect(parsearCombustible('vapor')).toBeNull();
  });

  it('normaliza cabeceras', () => {
    expect(normalizarCabecera('Nº Bastidor')).toBe('nbastidor');
    expect(normalizarCabecera(' Teléfono móvil ')).toBe('telefonomovil');
  });
});

describe('detección automática de columnas', () => {
  it('mapea cabeceras habituales de clientes', () => {
    expect(autoMapear(['Nombre', 'Apellidos', 'DNI', 'E-mail', 'Teléfono', 'Domicilio', 'Población', 'Notas internas'], 'clientes'))
      .toEqual(['nombre', 'apellidos', 'nif', 'correo', 'telefono', 'direccion', 'ciudad', '']);
  });

  it('mapea vehículos, incluida la columna de propietario, sin usar un campo dos veces', () => {
    expect(autoMapear(['Matrícula', 'Marca', 'Modelo', 'Nº Bastidor', 'Año', 'Combustible', 'Km', 'ITV', 'DNI cliente'], 'vehiculos'))
      .toEqual(['matricula', 'marca', 'modelo', 'bastidor', 'anio', 'combustible', 'kilometraje', 'itv', 'clienteNif']);
    // dos columnas "Matrícula": solo la primera se usa
    const m = autoMapear(['Matrícula', 'Matricula'], 'vehiculos');
    expect(m.filter((x) => x === 'matricula')).toHaveLength(1);
  });

  it('mapea inventario', () => {
    expect(autoMapear(['Referencia', 'Artículo', 'PVP', 'Coste', 'Existencias', 'Stock mínimo'], 'productos'))
      .toEqual(['sku', 'nombre', 'precioVenta', 'costo', 'stock', 'stockMinimo']);
  });

  it('si el inventario solo trae "Descripción", esa columna es el nombre', () => {
    expect(autoMapear(['Código', 'Descripción', 'PVP'], 'productos')).toEqual(['sku', 'nombre', 'precioVenta']);
    expect(autoMapear(['Nombre', 'Descripción'], 'productos')).toEqual(['nombre', 'descripcion']);
  });

  it('avisa de los campos obligatorios sin columna', () => {
    expect(faltanObligatorios(['nombre', 'correo'], 'clientes')).toEqual([]);
    expect(faltanObligatorios(['marca'], 'vehiculos').map((c) => c.clave)).toEqual(['matricula', 'modelo']);
  });

  it('la plantilla descargable se puede leer y mapear sola, sin errores', () => {
    for (const entidad of ['clientes', 'vehiculos', 'productos'] as const) {
      const filas = parsearCsv(plantillaCsv(entidad).replace(/^﻿/, ''));
      const mapeo = autoMapear(filas[0], entidad);
      expect(mapeo.every((m) => m !== '')).toBe(true);
      expect(faltanObligatorios(mapeo, entidad)).toEqual([]);
      const r = validarFilas(entidad, filas.slice(1), mapeo);
      expect(r.conErrores).toEqual([]);
      expect(r.validas).toHaveLength(1);
    }
  });
});

describe('validación de clientes', () => {
  const mapeo = ['nombre', 'apellidos', 'nif', 'correo', 'telefono'];

  it('importa filas válidas y normaliza NIF y correo', () => {
    const r = validarFilas('clientes', [['Ana', 'Pérez', '12345678 z', 'ANA@Correo.com', '600 123 456']], mapeo);
    const d = r.validas[0].datos as DatosCliente;
    expect(d).toMatchObject({ nombre: 'Ana', apellidos: 'Pérez', nif: '12345678Z', correo: 'ana@correo.com', telefono: '600 123 456' });
  });

  it('rechaza filas sin nombre y numera las líneas contando la cabecera', () => {
    const r = validarFilas('clientes', [['Ana', '', '', '', ''], ['', 'Solo apellido', '', '', '']], mapeo);
    expect(r.conErrores.map((f) => f.linea)).toEqual([3]);
    expect(r.conErrores[0].errores).toEqual(['Falta el nombre.']);
  });

  it('separa el nombre completo cuando solo hay una columna', () => {
    const r = validarFilas('clientes', [['Ana María Pérez García']], ['nombre']);
    expect(r.validas[0].datos).toMatchObject({ nombre: 'Ana', apellidos: 'María Pérez García' });
    expect(r.validas[0].avisos.some((a) => a.includes('separado'))).toBe(true);
  });

  it('avisa (sin bloquear) de correo dudoso y de falta de NIF', () => {
    const r = validarFilas('clientes', [['Ana', 'P', '', 'no-es-correo', '']], mapeo);
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0].avisos).toHaveLength(2);
  });

  it('detecta duplicados por NIF, correo o nombre+teléfono, en el taller y dentro del archivo', () => {
    const existentes = { clientes: [{ nif: '11111111H', correo: '', nombre: 'Luis', apellidos: 'Gil', telefono: '' }] };
    const r = validarFilas('clientes', [
      ['Luis', 'Gil', '11111111-H', '', ''],       // mismo NIF que el del taller (con guion)
      ['Eva', 'Ruiz', '22222222J', 'eva@x.com', ''],
      ['Eva R.', 'Ruiz', '', 'EVA@x.com', ''],      // mismo correo que la anterior (archivo)
      ['Pau', 'Mas', '', '', '600-111-222'],
      ['pau', 'MAS', '', '', '600 111 222'],        // mismo nombre y teléfono (archivo)
    ], mapeo, existentes);
    expect(r.duplicadas.map((f) => [f.linea, f.duplicado])).toEqual([[2, 'existente'], [4, 'archivo'], [6, 'archivo']]);
    expect(r.validas.map((f) => f.linea)).toEqual([3, 5]);
  });

  it('dos clientes sin NIF ni correo ni teléfono no se consideran duplicados', () => {
    const r = validarFilas('clientes', [['Ana', 'P', '', '', ''], ['Ana', 'P', '', '', '']], mapeo);
    expect(r.duplicadas).toHaveLength(0);
  });
});

describe('validación de vehículos', () => {
  const mapeo = ['matricula', 'marca', 'modelo', 'bastidor', 'anio', 'combustible', 'kilometraje', 'itv'];

  it('importa un vehículo completo con conversiones', () => {
    const r = validarFilas('vehiculos', [['1234 abc', 'Seat', 'Ibiza', 'vssz zz6jz9r123456', '2018', 'Diésel', '85.000', '15/03/2027']], mapeo);
    const d = r.validas[0].datos as DatosVehiculo;
    expect(d).toMatchObject({
      matricula: '1234 ABC', bastidor: 'VSSZZZ6JZ9R123456', anio: 2018, combustible: 'diesel', kilometraje: 85000, itv: '2027-03-15',
    });
  });

  it('exige matrícula, marca y modelo', () => {
    const r = validarFilas('vehiculos', [['', '', '', '', '', '', '', '']], mapeo);
    expect(r.conErrores[0].errores).toEqual(['Falta la matrícula.', 'Falta la marca.', 'Falta el modelo.']);
  });

  it('los datos opcionales mal escritos no bloquean: se dejan vacíos y se avisa', () => {
    const r = validarFilas('vehiculos', [['1234ABC', 'Seat', 'Ibiza', '', '1850', 'vapor', 'muchos', '31/02/2027']], mapeo);
    const d = r.validas[0].datos as DatosVehiculo;
    expect(d).toMatchObject({ anio: null, combustible: null, kilometraje: 0, itv: null });
    expect(r.validas[0].avisos).toHaveLength(4);
  });

  it('detecta matrículas repetidas ignorando espacios, guiones y mayúsculas, y bastidores repetidos', () => {
    const existentes = { vehiculos: [{ matricula: '1234-ABC', bastidor: '' }] };
    const r = validarFilas('vehiculos', [
      ['1234 abc', 'A', 'B', '', '', '', '', ''],                 // existente
      ['5555XYZ', 'A', 'B', 'VIN1', '', '', '', ''],
      ['6666XYZ', 'A', 'B', 'vin1', '', '', '', ''],              // mismo bastidor (archivo)
      ['5555-xyz', 'A', 'B', '', '', '', '', ''],                 // misma matrícula (archivo)
      ['7777XYZ', 'A', 'B', '', '', '', '', ''],
      ['8888XYZ', 'A', 'B', '', '', '', '', ''],                  // dos sin bastidor NO chocan
    ], mapeo, existentes);
    expect(r.duplicadas.map((f) => [f.linea, f.duplicado])).toEqual([[2, 'existente'], [4, 'archivo'], [5, 'archivo']]);
    expect(r.validas.map((f) => f.linea)).toEqual([3, 6, 7]);
  });
});

describe('validación de inventario', () => {
  const mapeo = ['sku', 'nombre', 'precioVenta', 'costo', 'stock', 'stockMinimo', 'unidad'];

  it('convierte precios y stock en formato español y usa "ud" por defecto', () => {
    const r = validarFilas('productos', [['FA-1', 'Filtro de aceite', '12,50', '7,80 €', '24', '5', '']], mapeo);
    expect(r.validas[0].datos as DatosProducto).toMatchObject({ sku: 'FA-1', precioVenta: 12.5, costo: 7.8, stock: 24, stockMinimo: 5, unidad: 'ud' });
  });

  it('exige nombre; los números inválidos o negativos se dejan en 0 con aviso', () => {
    const r = validarFilas('productos', [['', '', '', '', '', '', ''], ['X', 'Pastillas', 'caro', '-3', '', '', '']], mapeo);
    expect(r.conErrores.map((f) => f.linea)).toEqual([2]);
    expect(r.validas[0].datos as DatosProducto).toMatchObject({ precioVenta: 0, costo: 0 });
    expect(r.validas[0].avisos).toHaveLength(2);
  });

  it('identifica duplicados por referencia o, si no hay, por nombre', () => {
    const existentes = { productos: [{ sku: 'FA-1', nombre: 'Filtro' }, { sku: '', nombre: 'Aceite 5W30' }] };
    const r = validarFilas('productos', [
      ['fa-1', 'Otro nombre', '', '', '', '', ''],     // existente por SKU
      ['', 'aceite 5w30', '', '', '', '', ''],         // existente por nombre
      ['ZZ', 'Bujía', '', '', '', '', ''],
      ['ZZ', 'Bujía grande', '', '', '', '', ''],      // repetido en archivo
    ], mapeo, existentes);
    expect(r.duplicadas.map((f) => [f.linea, f.duplicado])).toEqual([[2, 'existente'], [3, 'existente'], [5, 'archivo']]);
  });
});

describe('límites e informe', () => {
  it('procesa como máximo MAX_FILAS_IMPORTACION filas y lo indica', () => {
    const filas = Array.from({ length: MAX_FILAS_IMPORTACION + 3 }, (_, i) => [`Cliente ${i}`]);
    const r = validarFilas('clientes', filas, ['nombre']);
    expect(r.filas).toHaveLength(MAX_FILAS_IMPORTACION);
    expect(r.excedeLimite).toBe(true);
  });

  it('el informe de omitidos lista errores y duplicados con su línea', () => {
    const r = validarFilas('clientes', [['', '', '', '', ''], ['Ana', '', '1', '', ''], ['Ana', '', '1', '', '']], ['nombre', 'apellidos', 'nif', 'correo', 'telefono']);
    const informe = informeOmitidos(r, [{ linea: 9, mensaje: 'Fallo "al guardar"' }]);
    expect(informe).toContain('Línea;Motivo');
    expect(informe).toContain('2;"Falta el nombre."');
    expect(informe).toContain('4;"Repetido dentro del archivo."');
    expect(informe).toContain('9;"Fallo ""al guardar"""');
  });
});
