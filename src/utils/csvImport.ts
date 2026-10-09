// Importación masiva desde CSV (clientes, vehículos, inventario): lectura del archivo,
// detección automática de columnas, validación y detección de duplicados. Todo puro
// (sin red ni base de datos) para poder probarlo a fondo; la escritura en la base de datos
// vive en src/lib/data/importacion.ts y la pantalla en ImportarCsvModal.tsx.

export type EntidadImport = 'clientes' | 'vehiculos' | 'productos';

export const MAX_FILAS_IMPORTACION = 5000;

// ---------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------

/** Excel en español guarda a menudo en Windows-1252: si no es UTF-8 válido se prueba con ese. */
export function decodificarArchivo(buffer: ArrayBuffer): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    texto = new TextDecoder('windows-1252').decode(buffer);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** Elige el separador (; , o tabulador) contando en la primera línea no vacía, fuera de comillas. */
export function detectarSeparador(texto: string): string {
  const primera = texto.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const cuenta: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let dentro = false;
  for (const c of primera) {
    if (c === '"') dentro = !dentro;
    else if (!dentro && c in cuenta) cuenta[c]++;
  }
  const mejor = (Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]);
  return mejor[1] > 0 ? mejor[0] : ',';
}

/** CSV estilo RFC 4180: comillas, comillas escapadas (""), saltos de línea dentro de comillas, CRLF. */
export function parsearCsv(texto: string, separador = detectarSeparador(texto)): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let dentro = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentro) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else dentro = false;
      } else campo += c;
    } else if (c === '"') {
      dentro = true;
    } else if (c === separador) {
      fila.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      filas.push(fila); fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }

  // Se descartan las filas totalmente vacías (típicas al final de un export de Excel).
  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Normalización de valores
// ---------------------------------------------------------------------------

export function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Cabecera comparable: minúsculas, sin acentos ni signos ("Nº Bastidor" → "nbastidor"). */
export function normalizarCabecera(s: string): string {
  return sinAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const normalizarMatricula = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
export const normalizarNif = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "1.234,56", "1234.56", "12,5 €", "1 234,50" → número; null si no es un número. */
export function parsearNumero(s: string): number | null {
  let t = s.trim().replace(/[€$\s ]/g, '');
  if (t === '') return null;
  if (t.includes(',') && t.includes('.')) {
    // El separador decimal es el que aparece último.
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ''); // "1.234" es mil doscientos treinta y cuatro en España
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd o número de serie de Excel → AAAA-MM-DD; null si no es una fecha. */
export function parsearFecha(s: string): string | null {
  const t = s.trim();
  if (t === '') return null;
  const valida = (a: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && a >= 1900 && a <= 2100
      ? `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : null;
  };
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valida(anio, +m[2], +m[1]);
  }
  if (/^\d{5}$/.test(t)) {
    // Número de serie de Excel (días desde 1899-12-30).
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86_400_000);
    return valida(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}

const COMBUSTIBLES: Record<string, 'gasolina' | 'diesel' | 'hibrido' | 'electrico' | 'otro'> = {
  gasolina: 'gasolina', g: 'gasolina', gasolinas: 'gasolina', nafta: 'gasolina',
  diesel: 'diesel', gasoil: 'diesel', gasoleo: 'diesel', d: 'diesel',
  hibrido: 'hibrido', hibridoenchufable: 'hibrido', hev: 'hibrido', phev: 'hibrido',
  electrico: 'electrico', electrica: 'electrico', ev: 'electrico', bev: 'electrico',
  otro: 'otro', glp: 'otro', gnc: 'otro', gas: 'otro', autogas: 'otro',
};
export function parsearCombustible(s: string): 'gasolina' | 'diesel' | 'hibrido' | 'electrico' | 'otro' | null {
  return COMBUSTIBLES[normalizarCabecera(s)] ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Campos por entidad y detección de columnas
// ---------------------------------------------------------------------------

export interface CampoImport {
  clave: string;
  etiqueta: string;
  obligatorio?: boolean;
  /** Nombres de columna habituales (ya normalizados con normalizarCabecera). */
  sinonimos: string[];
  ejemplo: string;
}

export const CAMPOS: Record<EntidadImport, CampoImport[]> = {
  clientes: [
    { clave: 'nombre', etiqueta: 'Nombre', obligatorio: true, sinonimos: ['nombre', 'name', 'cliente', 'nombrecliente', 'nombrecompleto', 'razonsocial'], ejemplo: 'Ana' },
    { clave: 'apellidos', etiqueta: 'Apellidos', sinonimos: ['apellidos', 'apellido', 'surname', 'lastname'], ejemplo: 'Pérez García' },
    { clave: 'nif', etiqueta: 'NIF / DNI / NIE', sinonimos: ['nif', 'dni', 'nie', 'cif', 'nifcif', 'documento', 'identificacion', 'nifdni', 'dninie'], ejemplo: '12345678Z' },
    { clave: 'correo', etiqueta: 'Correo electrónico', sinonimos: ['correo', 'email', 'mail', 'correoelectronico', 'emailcliente'], ejemplo: 'ana@correo.com' },
    { clave: 'telefono', etiqueta: 'Teléfono', sinonimos: ['telefono', 'tel', 'movil', 'phone', 'celular', 'telefonomovil', 'tlf', 'telf'], ejemplo: '600123456' },
    { clave: 'direccion', etiqueta: 'Dirección', sinonimos: ['direccion', 'domicilio', 'calle', 'address'], ejemplo: 'Calle Mayor 4' },
    { clave: 'ciudad', etiqueta: 'Ciudad', sinonimos: ['ciudad', 'poblacion', 'localidad', 'municipio', 'city'], ejemplo: 'Elche' },
    { clave: 'pais', etiqueta: 'País', sinonimos: ['pais', 'country'], ejemplo: 'España' },
  ],
  vehiculos: [
    { clave: 'matricula', etiqueta: 'Matrícula', obligatorio: true, sinonimos: ['matricula', 'placa', 'plate', 'registro', 'nmatricula'], ejemplo: '1234ABC' },
    { clave: 'marca', etiqueta: 'Marca', obligatorio: true, sinonimos: ['marca', 'make', 'fabricante'], ejemplo: 'Seat' },
    { clave: 'modelo', etiqueta: 'Modelo', obligatorio: true, sinonimos: ['modelo', 'model'], ejemplo: 'Ibiza' },
    { clave: 'bastidor', etiqueta: 'Bastidor (VIN)', sinonimos: ['bastidor', 'vin', 'chasis', 'nbastidor', 'numerobastidor', 'numerodebastidor'], ejemplo: 'VSSZZZ6JZ9R123456' },
    { clave: 'anio', etiqueta: 'Año', sinonimos: ['anio', 'ano', 'year', 'anomatriculacion', 'aniomatriculacion'], ejemplo: '2018' },
    { clave: 'color', etiqueta: 'Color', sinonimos: ['color', 'colour'], ejemplo: 'Rojo' },
    { clave: 'combustible', etiqueta: 'Combustible', sinonimos: ['combustible', 'fuel', 'carburante', 'motor'], ejemplo: 'Gasolina' },
    { clave: 'kilometraje', etiqueta: 'Kilómetros', sinonimos: ['kilometraje', 'km', 'kms', 'kilometros', 'odometro'], ejemplo: '85000' },
    { clave: 'itv', etiqueta: 'Vencimiento ITV', sinonimos: ['itv', 'vencimientoitv', 'proximaitv', 'itvvencimiento', 'fechaitv'], ejemplo: '15/03/2027' },
    { clave: 'seguro', etiqueta: 'Vencimiento seguro', sinonimos: ['seguro', 'vencimientoseguro', 'segurovencimiento', 'fechaseguro'], ejemplo: '01/09/2027' },
    { clave: 'impuesto', etiqueta: 'Vencimiento impuesto', sinonimos: ['impuesto', 'ivtm', 'vencimientoimpuesto', 'impuestovencimiento', 'impuestocirculacion'], ejemplo: '30/06/2027' },
    { clave: 'clienteNif', etiqueta: 'NIF del propietario', sinonimos: ['clientenif', 'nifcliente', 'dnicliente', 'propietarionif', 'nifpropietario', 'dnipropietario', 'niftitular', 'nifdelpropietario'], ejemplo: '12345678Z' },
    { clave: 'clienteCorreo', etiqueta: 'Correo del propietario', sinonimos: ['clientecorreo', 'correocliente', 'emailcliente', 'propietarioemail', 'emailpropietario', 'correopropietario', 'correodelpropietario'], ejemplo: 'ana@correo.com' },
  ],
  productos: [
    { clave: 'nombre', etiqueta: 'Nombre', obligatorio: true, sinonimos: ['nombre', 'producto', 'articulo', 'denominacion', 'concepto'], ejemplo: 'Filtro de aceite' },
    { clave: 'sku', etiqueta: 'Referencia / SKU', sinonimos: ['sku', 'referencia', 'ref', 'codigo', 'cod', 'ean', 'codigoarticulo'], ejemplo: 'FA-1234' },
    { clave: 'descripcion', etiqueta: 'Descripción', sinonimos: ['descripcion', 'detalle', 'descripcionlarga', 'observaciones', 'notas'], ejemplo: 'Compatible con motores 1.6 HDI' },
    { clave: 'precioVenta', etiqueta: 'Precio de venta', sinonimos: ['precioventa', 'pvp', 'precio', 'venta', 'pvpsiniva', 'preciodeventa', 'tarifa'], ejemplo: '12,50' },
    { clave: 'costo', etiqueta: 'Coste', sinonimos: ['coste', 'costo', 'preciocompra', 'preciodecompra', 'compra', 'costeunitario'], ejemplo: '7,80' },
    { clave: 'stock', etiqueta: 'Stock actual', sinonimos: ['stock', 'existencias', 'cantidad', 'unidades', 'stockactual', 'uds'], ejemplo: '24' },
    { clave: 'stockMinimo', etiqueta: 'Stock mínimo', sinonimos: ['stockminimo', 'minimo', 'minimoexistencias', 'stockmin'], ejemplo: '5' },
    { clave: 'unidad', etiqueta: 'Unidad', sinonimos: ['unidad', 'ud', 'medida', 'um', 'unidadmedida'], ejemplo: 'ud' },
  ],
};

/** Mapeo columna del archivo → campo de Doonty ('' = no importar). Cada campo se usa una sola vez. */
export function autoMapear(cabeceras: string[], entidad: EntidadImport): string[] {
  const campos = CAMPOS[entidad];
  const norm = cabeceras.map(normalizarCabecera);
  const mapeo: string[] = cabeceras.map(() => '');
  const usados = new Set<string>();

  // Primero coincidencias exactas (la más fiable), luego las que solo contienen el sinónimo.
  for (const pasada of ['exacta', 'contiene'] as const) {
    norm.forEach((h, i) => {
      if (mapeo[i] || h === '') return;
      for (const campo of campos) {
        if (usados.has(campo.clave)) continue;
        const coincide = pasada === 'exacta'
          ? campo.sinonimos.includes(h)
          : campo.sinonimos.some((s) => s.length >= 4 && h.includes(s));
        if (coincide) { mapeo[i] = campo.clave; usados.add(campo.clave); break; }
      }
    });
  }
  // Inventarios que solo traen "Descripción": esa columna es el nombre del artículo.
  if (entidad === 'productos' && !mapeo.includes('nombre')) {
    const i = mapeo.indexOf('descripcion');
    if (i >= 0) mapeo[i] = 'nombre';
  }
  return mapeo;
}

export function faltanObligatorios(mapeo: string[], entidad: EntidadImport): CampoImport[] {
  return CAMPOS[entidad].filter((c) => c.obligatorio && !mapeo.includes(c.clave));
}

/** CSV de plantilla (con separador ; y UTF-8 con BOM, que es lo que abre bien Excel en español). */
export function plantillaCsv(entidad: EntidadImport): string {
  const campos = CAMPOS[entidad];
  return '﻿' + campos.map((c) => c.etiqueta).join(';') + '\r\n' + campos.map((c) => c.ejemplo).join(';') + '\r\n';
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export interface DatosCliente { nombre: string; apellidos: string; nif: string; correo: string; telefono: string; direccion: string; ciudad: string; pais: string }
export interface DatosVehiculo {
  matricula: string; marca: string; modelo: string; bastidor: string; anio: number | null; color: string;
  combustible: 'gasolina' | 'diesel' | 'hibrido' | 'electrico' | 'otro' | null; kilometraje: number;
  itv: string | null; seguro: string | null; impuesto: string | null; clienteNif: string; clienteCorreo: string;
}
export interface DatosProducto { nombre: string; sku: string; descripcion: string; precioVenta: number; costo: number; stock: number; stockMinimo: number; unidad: string }
export type DatosImport = DatosCliente | DatosVehiculo | DatosProducto;

export interface FilaValidada {
  /** Número de línea en el archivo original (la cabecera es la 1). */
  linea: number;
  datos: DatosImport | null;
  errores: string[];
  avisos: string[];
  duplicado: 'archivo' | 'existente' | null;
}

/** Claves con las que identificar lo que ya existe en el taller, para no duplicarlo. */
export interface ExistentesImport {
  clientes?: { nif: string; correo: string; nombre: string; apellidos: string; telefono: string }[];
  vehiculos?: { matricula: string; bastidor: string }[];
  productos?: { sku: string; nombre: string }[];
}

export interface ResultadoValidacion {
  filas: FilaValidada[];
  /** Filas que se importarán. */
  validas: FilaValidada[];
  conErrores: FilaValidada[];
  duplicadas: FilaValidada[];
  /** Hay más filas de las permitidas en una sola importación. */
  excedeLimite: boolean;
}

type Obtener = (clave: string) => string;

function validarCliente(g: Obtener, avisos: string[], errores: string[]): DatosCliente | null {
  let nombre = g('nombre');
  let apellidos = g('apellidos');
  if (nombre === '') errores.push('Falta el nombre.');
  // Si el archivo trae el nombre completo en una sola columna, se separa en nombre y apellidos.
  if (apellidos === '' && /\s/.test(nombre)) {
    const [primero, ...resto] = nombre.split(/\s+/);
    nombre = primero; apellidos = resto.join(' ');
    avisos.push('Nombre completo separado en nombre y apellidos.');
  }
  const correo = g('correo').toLowerCase();
  if (correo !== '' && !EMAIL_RE.test(correo)) avisos.push('El correo no parece válido: se importa igualmente.');
  const nif = g('nif').toUpperCase().replace(/\s/g, '');
  if (nif === '') avisos.push('Sin NIF: no podrás emitirle facturas hasta completarlo.');
  return errores.length ? null : { nombre, apellidos, nif, correo, telefono: g('telefono').replace(/\s+/g, ' '), direccion: g('direccion'), ciudad: g('ciudad'), pais: g('pais') };
}

function validarVehiculo(g: Obtener, avisos: string[], errores: string[]): DatosVehiculo | null {
  const matricula = g('matricula').toUpperCase();
  if (matricula === '') errores.push('Falta la matrícula.');
  if (g('marca') === '') errores.push('Falta la marca.');
  if (g('modelo') === '') errores.push('Falta el modelo.');

  let anio: number | null = null;
  if (g('anio') !== '') {
    const n = parsearNumero(g('anio'));
    if (n !== null && n >= 1900 && n <= new Date().getFullYear() + 1) anio = Math.round(n);
    else avisos.push(`Año "${g('anio')}" no válido: se deja vacío.`);
  }
  let combustible: DatosVehiculo['combustible'] = null;
  if (g('combustible') !== '') {
    combustible = parsearCombustible(g('combustible'));
    if (combustible === null) avisos.push(`Combustible "${g('combustible')}" no reconocido: se deja vacío.`);
  }
  let kilometraje = 0;
  if (g('kilometraje') !== '') {
    const n = parsearNumero(g('kilometraje'));
    if (n !== null && n >= 0) kilometraje = Math.round(n);
    else avisos.push(`Kilómetros "${g('kilometraje')}" no válidos: se deja en 0.`);
  }
  const fecha = (clave: string, etiqueta: string): string | null => {
    if (g(clave) === '') return null;
    const f = parsearFecha(g(clave));
    if (f === null) avisos.push(`${etiqueta} "${g(clave)}" no es una fecha válida: se deja vacía.`);
    return f;
  };
  const itv = fecha('itv', 'Fecha de ITV');
  const seguro = fecha('seguro', 'Fecha de seguro');
  const impuesto = fecha('impuesto', 'Fecha de impuesto');

  return errores.length ? null : {
    matricula, marca: g('marca'), modelo: g('modelo'), bastidor: g('bastidor').toUpperCase().replace(/\s/g, ''),
    anio, color: g('color'), combustible, kilometraje, itv, seguro, impuesto,
    clienteNif: g('clienteNif').toUpperCase().replace(/\s/g, ''), clienteCorreo: g('clienteCorreo').toLowerCase(),
  };
}

function validarProducto(g: Obtener, avisos: string[], errores: string[]): DatosProducto | null {
  if (g('nombre') === '') errores.push('Falta el nombre.');
  const num = (clave: string, etiqueta: string, defecto = 0): number => {
    if (g(clave) === '') return defecto;
    const n = parsearNumero(g(clave));
    if (n === null || n < 0) { avisos.push(`${etiqueta} "${g(clave)}" no válido: se deja en ${defecto}.`); return defecto; }
    return n;
  };
  const precioVenta = num('precioVenta', 'Precio de venta');
  const costo = num('costo', 'Coste');
  const stock = num('stock', 'Stock');
  const stockMinimo = num('stockMinimo', 'Stock mínimo');
  return errores.length ? null : { nombre: g('nombre'), sku: g('sku'), descripcion: g('descripcion'), precioVenta, costo, stock, stockMinimo, unidad: g('unidad') || 'ud' };
}

/** Claves con las que se reconoce un registro ya existente (cualquier coincidencia = duplicado). */
function clavesDuplicado(entidad: EntidadImport, d: DatosImport): string[] {
  if (entidad === 'clientes') {
    const c = d as DatosCliente;
    const tel = c.telefono.replace(/\D/g, '');
    return [
      c.nif !== '' ? `nif:${normalizarNif(c.nif)}` : '',
      c.correo !== '' ? `correo:${c.correo}` : '',
      tel !== '' ? `nt:${sinAcentos(`${c.nombre} ${c.apellidos}`).toLowerCase().replace(/\s+/g, ' ').trim()}|${tel}` : '',
    ].filter(Boolean);
  }
  if (entidad === 'vehiculos') {
    const v = d as DatosVehiculo;
    return [`mat:${normalizarMatricula(v.matricula)}`, v.bastidor !== '' ? `vin:${v.bastidor.toUpperCase()}` : ''].filter(Boolean);
  }
  const p = d as DatosProducto;
  return [`ref:${(p.sku || p.nombre).toLowerCase()}`];
}

function clavesExistentes(entidad: EntidadImport, ex: ExistentesImport): string[] {
  if (entidad === 'clientes') {
    return (ex.clientes ?? []).flatMap((c) => clavesDuplicado('clientes', { ...c, direccion: '', ciudad: '', pais: '' }));
  }
  if (entidad === 'vehiculos') {
    return (ex.vehiculos ?? []).flatMap((v) => [`mat:${normalizarMatricula(v.matricula)}`, v.bastidor ? `vin:${v.bastidor.toUpperCase()}` : ''].filter(Boolean));
  }
  return (ex.productos ?? []).map((p) => `ref:${(p.sku || p.nombre).toLowerCase()}`);
}

/** Convierte las filas del archivo (sin la cabecera) en filas validadas, marcando errores y duplicados. */
export function validarFilas(
  entidad: EntidadImport,
  filas: string[][],
  mapeo: string[],
  existentes: ExistentesImport = {},
): ResultadoValidacion {
  const enTaller = new Set(clavesExistentes(entidad, existentes));
  const enArchivo = new Set<string>();

  const resultado: FilaValidada[] = filas.slice(0, MAX_FILAS_IMPORTACION).map((fila, i) => {
    const linea = i + 2; // +1 por empezar en 1, +1 por la cabecera
    const valores: Record<string, string> = {};
    mapeo.forEach((clave, col) => { if (clave) valores[clave] = (fila[col] ?? '').trim(); });
    const g: Obtener = (clave) => valores[clave] ?? '';
    const errores: string[] = [], avisos: string[] = [];

    let datos: DatosImport | null;
    if (entidad === 'clientes') datos = validarCliente(g, avisos, errores);
    else if (entidad === 'vehiculos') datos = validarVehiculo(g, avisos, errores);
    else datos = validarProducto(g, avisos, errores);

    let duplicado: FilaValidada['duplicado'] = null;
    if (datos) {
      const claves = clavesDuplicado(entidad, datos);
      if (claves.some((k) => enTaller.has(k))) duplicado = 'existente';
      else if (claves.some((k) => enArchivo.has(k))) duplicado = 'archivo';
      // Las claves de una fila duplicada también cuentan, para marcar a su vez a las siguientes.
      claves.forEach((k) => enArchivo.add(k));
    }
    return { linea, datos, errores, avisos, duplicado };
  });

  return {
    filas: resultado,
    validas: resultado.filter((f) => f.datos && !f.duplicado),
    conErrores: resultado.filter((f) => !f.datos),
    duplicadas: resultado.filter((f) => f.datos && f.duplicado),
    excedeLimite: filas.length > MAX_FILAS_IMPORTACION,
  };
}

/** Informe CSV de lo que no se ha importado (errores y duplicados), para que el usuario lo corrija. */
export function informeOmitidos(resultado: ResultadoValidacion, extra: { linea: number; mensaje: string }[] = []): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lineas = ['Línea;Motivo'];
  for (const f of resultado.conErrores) lineas.push(`${f.linea};${esc(f.errores.join(' '))}`);
  for (const f of resultado.duplicadas) lineas.push(`${f.linea};${esc(f.duplicado === 'existente' ? 'Ya existe en tu taller.' : 'Repetido dentro del archivo.')}`);
  for (const e of extra) lineas.push(`${e.linea};${esc(e.mensaje)}`);
  return '﻿' + lineas.join('\r\n') + '\r\n';
}
