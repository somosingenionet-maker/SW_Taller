import { test, expect, type Page } from '@playwright/test';

// Inspección digital en el Portal del Mecánico (móvil). La Edge Function y la subida al almacenamiento se
// sustituyen por un servidor de mentira con el mismo contrato que supabase/functions/portal-mecanico: así se
// prueba toda la pantalla (abrir, marcar, nota, foto, terminar con puntos sin marcar, reabrir) sin escribir en
// la base de datos real. El contrato del servidor se prueba aparte (deno test y la prueba real contra Supabase).

test.use({ viewport: { width: 375, height: 812 } });

type Punto = { id: string; categoria: string; nombre: string; estado: string | null; nota: string | null; reparacion: string | null; fotos: { ruta: string; url: string | null }[] };
type Insp = { id: string; estado: string; notaGeneral: string | null; puntos: Punto[] };

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function servidor() {
  const orden = {
    id: 'ot-1', numero: 'OT-2026-101', estado: 'recibido', descripcionProblema: 'Ruido al frenar', diagnostico: null,
    kilometrajeEntrada: 85400, fechaEstimadaEntrega: '2026-11-20', ingreso: '2026-11-10T09:00:00Z',
    vehiculo: { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    tareas: [{ id: 't1', descripcion: 'Cambiar pastillas', completado: false, duracionMin: null }], notas: [],
    esCambioAceite: false, filtros: { aire: null, aceite: null, combustible: null, habitaculo: null }, aceiteProximo: null,
  };
  let insp: Insp | null = null;
  const peticiones: Record<string, unknown>[] = [];
  const punto = (id: unknown) => insp!.puntos.find((p) => p.id === id)!;

  const responder = (b: Record<string, unknown>): { status: number; json: unknown } => {
    peticiones.push(b);
    switch (b.action) {
      case undefined:
        return { status: 200, json: { empresa: { nombre: 'Taller Ejemplo', brandColor: '#2563eb', logoUrl: null }, tecnico: { nombre: 'Ana' }, ordenes: [orden], inspecciones: insp ? { 'ot-1': insp } : {} } };
      case 'inspeccion_crear':
        insp = { id: 'i1', estado: 'borrador', notaGeneral: null, puntos: [
          { id: 'p1', categoria: 'Frenos', nombre: 'Pastillas delanteras', estado: null, nota: null, reparacion: null, fotos: [] },
          { id: 'p2', categoria: 'Frenos', nombre: 'Discos delanteros', estado: null, nota: null, reparacion: null, fotos: [] },
          { id: 'p3', categoria: 'Neumáticos', nombre: 'Delantero izquierdo', estado: null, nota: null, reparacion: null, fotos: [] },
        ] };
        return { status: 200, json: { ok: true, inspeccionId: 'i1' } };
      case 'inspeccion_punto': {
        const p = punto(b.puntoId); p.estado = b.estado as string | null;
        const detalle = p.estado === 'atencion' || p.estado === 'urgente';
        p.nota = detalle ? (b.nota as string | null) : null; p.reparacion = detalle ? (b.reparacion as string | null) : null;
        if (!detalle) p.fotos = [];
        return { status: 200, json: { ok: true } };
      }
      case 'inspeccion_foto_url': return { status: 200, json: { ok: true, ruta: `emp/i1/${crypto.randomUUID()}.jpg`, token: 'tok' } };
      case 'inspeccion_foto_registrar': punto(b.puntoId).fotos.push({ ruta: String(b.ruta), url: null }); return { status: 200, json: { ok: true } };
      case 'inspeccion_foto_borrar': { const p = punto(b.puntoId); p.fotos = p.fotos.filter((f) => f.ruta !== b.ruta); return { status: 200, json: { ok: true } }; }
      case 'inspeccion_terminar':
        if (!insp!.puntos.some((p) => p.estado)) return { status: 400, json: { error: 'Marca al menos un punto antes de terminar.' } };
        insp!.estado = 'terminada'; insp!.notaGeneral = (b.notaGeneral as string | null) ?? null; return { status: 200, json: { ok: true } };
      case 'inspeccion_reabrir': insp!.estado = 'borrador'; return { status: 200, json: { ok: true } };
      default: return { status: 400, json: { error: 'Acción no reconocida.' } };
    }
  };
  return { peticiones, responder, get insp() { return insp; } };
}

async function abrir(page: Page, s: ReturnType<typeof servidor>) {
  await page.route('**/functions/v1/portal-mecanico', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const r = s.responder(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.json) });
  });
  // La subida directa al almacenamiento con la URL firmada.
  await page.route('**/storage/v1/object/upload/sign/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Key: 'inspecciones/x' }) });
  });
  await page.goto('/mecanico/token-de-prueba');
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible({ timeout: 10_000 });
}

test('mecánico: abre la inspección, marca puntos, anota un problema con foto y la termina avisando de lo que falta', async ({ page }) => {
  const s = servidor();
  await abrir(page, s);

  await page.getByTestId('abrir-inspeccion').click();
  // Tras abrirla, la inspección queda desplegada
  await expect(page.getByTestId('inspeccion-mecanico')).toBeVisible();

  // Categoría Frenos: marcar «Pastillas» urgente y «Discos» bien
  await page.getByRole('button', { name: /Frenos/ }).click();
  await page.getByRole('group', { name: 'Pastillas delanteras' }).getByRole('button', { name: 'Urgente' }).click();
  await page.getByRole('group', { name: 'Discos delanteros' }).getByRole('button', { name: 'Bien' }).click();

  // Un punto urgente pide nota y foto; uno «bien» no
  await expect(page.getByTestId('detalle-punto')).toHaveCount(1);
  await page.getByLabel('Nota de Pastillas delanteras').fill('Pastillas al 10 %, sin margen');
  await page.getByLabel('Reparación propuesta de Pastillas delanteras').fill('Cambio de pastillas delanteras');
  await page.getByLabel('Reparación propuesta de Pastillas delanteras').blur();
  await expect.poll(() => s.insp?.puntos[0].nota).toBe('Pastillas al 10 %, sin margen');
  await expect.poll(() => s.insp?.puntos[0].reparacion).toBe('Cambio de pastillas delanteras');

  await page.getByLabel('Añadir foto a Pastillas delanteras').setInputFiles({ name: 'f.png', mimeType: 'image/png', buffer: PIXEL });
  await expect.poll(() => s.insp?.puntos[0].fotos.length).toBe(1);
  expect(s.peticiones.map((p) => p.action)).toContain('inspeccion_foto_url');
  expect(s.peticiones.map((p) => p.action)).toContain('inspeccion_foto_registrar');

  // Cambiar a «bien» quita nota, reparación y fotos
  await page.getByRole('group', { name: 'Pastillas delanteras' }).getByRole('button', { name: 'Bien' }).click();
  await expect.poll(() => s.insp?.puntos[0].estado).toBe('bien');
  expect(s.insp?.puntos[0].nota).toBeNull();
  expect(s.insp?.puntos[0].fotos).toHaveLength(0);
  await page.getByRole('group', { name: 'Pastillas delanteras' }).getByRole('button', { name: 'Atención' }).click();
  await expect.poll(() => s.insp?.puntos[0].estado).toBe('atencion');

  // Terminar con puntos sin marcar: primero avisa
  await page.getByTestId('terminar-inspeccion').click();
  await expect(page.getByRole('alert').filter({ hasText: 'sin marcar' })).toBeVisible();
  expect(s.insp?.estado).toBe('borrador');
  await page.getByTestId('terminar-inspeccion').click();
  await expect.poll(() => s.insp?.estado).toBe('terminada');
  await expect(page.getByText('El taller la revisará')).toBeVisible();

  // Terminada: no se puede tocar hasta reabrir
  await expect(page.getByRole('group', { name: 'Discos delanteros' }).getByRole('button', { name: 'Urgente' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reabrir para corregir' }).click();
  await expect.poll(() => s.insp?.estado).toBe('borrador');
  await expect(page.getByRole('group', { name: 'Discos delanteros' }).getByRole('button', { name: 'Urgente' })).toBeEnabled();
});

test('mecánico: no se puede terminar una inspección sin marcar ningún punto', async ({ page }) => {
  const s = servidor();
  await abrir(page, s);
  await page.getByTestId('abrir-inspeccion').click();
  // «Terminar» sin marcar nada: el botón ni se puede pulsar
  await expect(page.getByTestId('terminar-inspeccion')).toBeDisabled();
});
