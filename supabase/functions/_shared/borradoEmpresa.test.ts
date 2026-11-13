import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { borrarArchivosDeEmpresa, idEmpresaSeguro, listarArchivos, type AlmacenArchivos } from './borradoEmpresa.ts';

type Entrada = { name: string; id: string | null };

/** Almacenamiento de mentira con carpetas: «emp1/fotos/a.png» → carpeta `fotos` dentro de `emp1`. */
function falso(archivos: string[], fallos: { listar?: string; borrar?: boolean } = {}): AlmacenArchivos & { borrados: string[] } {
  const borrados: string[] = [];
  return {
    borrados,
    async list(path, { limit, offset }) {
      if (fallos.listar === path) return { data: null, error: { message: 'sin conexión' } };
      const hijos = new Map<string, Entrada>();
      for (const a of archivos) {
        if (borrados.includes(a) || !a.startsWith(`${path}/`)) continue;
        const resto = a.slice(path.length + 1).split('/');
        hijos.set(resto[0], { name: resto[0], id: resto.length > 1 ? null : `id-${a}` });
      }
      return { data: [...hijos.values()].slice(offset, offset + limit), error: null };
    },
    async remove(paths) {
      if (fallos.borrar) return { error: { message: 'denegado' } };
      borrados.push(...paths);
      return { error: null };
    },
  };
}

Deno.test('idEmpresaSeguro: solo ids normales (un prefijo vacío o con barras borraría de más)', () => {
  for (const ok of ['emp-demo', 'emp_1', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890']) assertEquals(idEmpresaSeguro(ok), true);
  for (const mal of ['', '.', '..', 'a/b', '/', 'emp/../otra', 'con espacio', ' ', 'x'.repeat(81), null, undefined, 42]) assertEquals(idEmpresaSeguro(mal), false, String(mal));
});

Deno.test('listarArchivos entra en las subcarpetas y no se sale del prefijo', async () => {
  const almacen = falso(['emp1/logo.png', 'emp1/fotos/a.png', 'emp1/fotos/mas/b.png', 'emp10/logo.png', 'otra/x.png']);
  assertEquals((await listarArchivos(almacen, 'emp1')).sort(), ['emp1/fotos/a.png', 'emp1/fotos/mas/b.png', 'emp1/logo.png']);
});

Deno.test('borrarArchivosDeEmpresa borra los de la empresa en todos los buckets y solo esos', async () => {
  const buckets: Record<string, ReturnType<typeof falso>> = {
    'logos-empresas': falso(['emp1/logo.png', 'emp2/logo.png']),
    'fotos-recepcion': falso(['emp1/a.jpg', 'emp1/b.jpg', 'emp2/c.jpg']),
  };
  const n = await borrarArchivosDeEmpresa((b) => buckets[b], 'emp1');
  assertEquals(n, 3);
  assertEquals(buckets['logos-empresas'].borrados, ['emp1/logo.png']);
  assertEquals(buckets['fotos-recepcion'].borrados.sort(), ['emp1/a.jpg', 'emp1/b.jpg']);
});

Deno.test('borrarArchivosDeEmpresa con muchos archivos los borra por lotes', async () => {
  const muchos = Array.from({ length: 250 }, (_, i) => `emp1/f${i}.jpg`);
  const almacen = falso(muchos);
  const buckets: Record<string, ReturnType<typeof falso>> = { 'logos-empresas': falso([]), 'fotos-recepcion': almacen };
  assertEquals(await borrarArchivosDeEmpresa((b) => buckets[b], 'emp1'), 250);
  assertEquals(almacen.borrados.length, 250);
});

Deno.test('un id peligroso se rechaza SIN tocar el almacenamiento', async () => {
  const almacen = falso(['a/x.png', 'b/y.png']);
  for (const id of ['', '.', 'a/b', '../b']) {
    await assertRejects(() => borrarArchivosDeEmpresa(() => almacen, id), Error, 'no válido');
  }
  assertEquals(almacen.borrados, []);
});

Deno.test('si falla el listado o el borrado, lanza (y no se sigue borrando la empresa)', async () => {
  await assertRejects(() => borrarArchivosDeEmpresa(() => falso(['emp1/a.png'], { listar: 'emp1' }), 'emp1'), Error, 'No se pudo listar');
  await assertRejects(() => borrarArchivosDeEmpresa(() => falso(['emp1/a.png'], { borrar: true }), 'emp1'), Error, 'No se pudieron borrar');
});
