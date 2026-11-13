import { test, expect, type Page } from '@playwright/test';

// Portal del Mecánico en un móvil. La Edge Function se sustituye por un servidor de mentira que
// vive en el propio test (mismo contrato que supabase/functions/portal-mecanico): así se prueba toda
// la pantalla — tocar tareas, elegir el tiempo, empezar, listo, reabrir, notas, coche nuevo — sin
// escribir nada en la base de datos real. El contrato del servidor se prueba aparte (deno test).

test.use({ viewport: { width: 375, height: 812 } });

type Tarea = { id: string; descripcion: string; completado: boolean; duracionMin: number | null };
type Orden = {
  id: string; numero: string; estado: string; descripcionProblema: string; diagnostico: string | null;
  kilometrajeEntrada: number | null; fechaEstimadaEntrega: string | null; ingreso: string;
  vehiculo: { marca: string; modelo: string; matricula: string }; tareas: Tarea[]; notas: { fecha: string; texto: string }[];
  esCambioAceite: boolean; filtros: Record<string, string | null>; aceiteProximo: { fecha: string; km: number | null } | null;
};
const SIN_ACEITE = { esCambioAceite: false, filtros: { aire: null, aceite: null, combustible: null, habitaculo: null }, aceiteProximo: null };

function servidorDeMentira() {
  const ordenes: Orden[] = [
    {
      id: 'ot-1', numero: 'OT-2026-101', estado: 'recibido', descripcionProblema: 'Ruido al frenar', diagnostico: 'Pastillas gastadas',
      kilometrajeEntrada: 85400, fechaEstimadaEntrega: '2026-11-20', ingreso: '2026-11-10T09:00:00Z',
      vehiculo: { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
      tareas: [
        { id: 't1', descripcion: 'Cambiar pastillas delanteras', completado: false, duracionMin: null },
        { id: 't2', descripcion: 'Purgar circuito', completado: false, duracionMin: null },
      ],
      notas: [],
      ...structuredClone(SIN_ACEITE),
    },
  ];
  const peticiones: Record<string, unknown>[] = [];
  const orden = (id: unknown) => ordenes.find((o) => o.id === id)!;
  const tarea = (id: unknown) => ordenes.flatMap((o) => o.tareas.map((t) => ({ o, t }))).find((x) => x.t.id === id)!;

  const responder = (body: Record<string, unknown>): { status: number; json: unknown } => {
    peticiones.push(body);
    switch (body.action) {
      case undefined:
        return { status: 200, json: { empresa: { nombre: 'Taller Ejemplo', brandColor: '#2563eb', logoUrl: null }, tecnico: { nombre: 'Ana' }, ordenes } };
      case 'marcar_tarea': {
        const { o, t } = tarea(body.lineaId);
        t.completado = Boolean(body.completado);
        t.duracionMin = t.completado ? (body.duracionMin as number | null) : null;
        if (t.completado && o.estado === 'recibido') o.estado = 'en_reparacion';
        return { status: 200, json: { ok: true } };
      }
      case 'duracion':
        tarea(body.lineaId).t.duracionMin = body.duracionMin as number;
        return { status: 200, json: { ok: true } };
      case 'empezar': orden(body.otId).estado = 'en_reparacion'; return { status: 200, json: { ok: true } };
      case 'listo': orden(body.otId).estado = 'listo'; return { status: 200, json: { ok: true } };
      case 'reabrir': orden(body.otId).estado = 'en_reparacion'; return { status: 200, json: { ok: true } };
      case 'nota':
        orden(body.otId).notas.push({ fecha: new Date().toISOString(), texto: String(body.texto) });
        return { status: 200, json: { ok: true } };
      case 'aceite': orden(body.otId).esCambioAceite = body.activo === true; return { status: 200, json: { ok: true } };
      case 'filtro': orden(body.otId).filtros[String(body.filtro)] = body.estado as string | null; return { status: 200, json: { ok: true } };
      case 'aceite_proximo':
        orden(body.otId).aceiteProximo = { fecha: String(body.fecha), km: body.km as number | null };
        return { status: 200, json: { ok: true } };
      default:
        return { status: 400, json: { error: 'Acción no reconocida.' } };
    }
  };
  return { ordenes, peticiones, responder };
}

async function abrir(page: Page, servidor: ReturnType<typeof servidorDeMentira>) {
  await page.route('**/functions/v1/portal-mecanico', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const r = servidor.responder(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.json) });
  });
  await page.goto('/mecanico/token-de-prueba');
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible({ timeout: 10_000 });
}

test('mecánico: marcar una tarea pide el tiempo y empieza la reparación', async ({ page }) => {
  const servidor = servidorDeMentira();
  await abrir(page, servidor);

  await expect(page.getByRole('region', { name: 'Por empezar' })).toContainText('Seat Ibiza');
  await expect(page.getByText('Pastillas gastadas')).toBeVisible();
  await expect(page.getByText('85.400 km')).toBeVisible();

  // Tocar la tarea NO la marca todavía: abre el selector de tiempo. Cancelar no guarda nada.
  await page.getByRole('button', { name: /Cambiar pastillas delanteras/ }).click();
  await expect(page.getByRole('dialog', { name: 'Tiempo de la tarea' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect(servidor.peticiones.some((p) => p.action === 'marcar_tarea')).toBe(false);

  await page.getByRole('button', { name: /Cambiar pastillas delanteras/ }).click();
  await page.getByRole('button', { name: '45 min', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  expect(servidor.peticiones.find((p) => p.action === 'marcar_tarea')).toMatchObject({ lineaId: 't1', completado: true, duracionMin: 45 });
  // La primera tarea hecha pasa el coche a «En reparación».
  await expect(page.getByRole('region', { name: 'En reparación' })).toContainText('Seat Ibiza');
  await expect(page.getByText('1 de 2 hechas')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cambiar pastillas delanteras/ })).toContainText('45 min');
});

test('mecánico: corregir el tiempo, desmarcar y dejar una nota', async ({ page }) => {
  const servidor = servidorDeMentira();
  servidor.ordenes[0].estado = 'en_reparacion';
  servidor.ordenes[0].tareas[0] = { id: 't1', descripcion: 'Cambiar pastillas delanteras', completado: true, duracionMin: 45 };
  await abrir(page, servidor);

  await page.getByRole('button', { name: /Cambiar pastillas delanteras/ }).click();
  await page.getByRole('button', { name: '1 h', exact: true }).click();
  await expect(page.getByRole('button', { name: /Cambiar pastillas delanteras/ })).toContainText('1 h');
  expect(servidor.peticiones.find((p) => p.action === 'duracion')).toMatchObject({ lineaId: 't1', duracionMin: 60 });

  await page.getByRole('button', { name: /Cambiar pastillas delanteras/ }).click();
  await page.getByRole('button', { name: 'Desmarcar: no está hecha' }).click();
  await expect(page.getByText('0 de 2 hechas')).toBeVisible();

  await page.getByRole('button', { name: 'Nota' }).click();
  await page.getByLabel('Nota para el taller').fill('Falta la junta, hay que pedirla');
  await page.getByRole('button', { name: 'Enviar nota al taller' }).click();
  await expect(page.getByText('Falta la junta, hay que pedirla')).toBeVisible();
  expect(servidor.peticiones.find((p) => p.action === 'nota')).toMatchObject({ otId: 'ot-1', texto: 'Falta la junta, hay que pedirla' });
});

test('mecánico: marcar listo pide confirmar si faltan tareas, y se puede reabrir', async ({ page }) => {
  const servidor = servidorDeMentira();
  servidor.ordenes[0].estado = 'en_reparacion';
  await abrir(page, servidor);

  await page.getByRole('button', { name: 'Marcar como listo' }).click();
  await expect(page.getByText('Quedan 2 tareas sin marcar.')).toBeVisible();
  expect(servidor.peticiones.some((p) => p.action === 'listo')).toBe(false);
  await page.getByRole('button', { name: 'No, sigo' }).click();

  await page.getByRole('button', { name: 'Marcar como listo' }).click();
  await page.getByRole('button', { name: 'Sí, está listo' }).click();
  await expect(page.getByRole('region', { name: 'Listos' })).toContainText('Seat Ibiza');
  // Con el coche listo las tareas ya no se pueden tocar.
  await expect(page.getByRole('button', { name: /Purgar circuito/ })).toBeDisabled();

  await page.getByRole('button', { name: 'Reabrir' }).click();
  await expect(page.getByRole('region', { name: 'En reparación' })).toContainText('Seat Ibiza');
});

test('mecánico: un coche asignado después aparece solo y marcado como nuevo', async ({ page }) => {
  const servidor = servidorDeMentira();
  await page.clock.install();
  await abrir(page, servidor);
  await expect(page.getByText('Nuevo', { exact: true })).toHaveCount(0); // la primera vez nada es «nuevo»

  servidor.ordenes.push({
    id: 'ot-2', numero: 'OT-2026-102', estado: 'recibido', descripcionProblema: 'Cambio de aceite', diagnostico: null,
    kilometrajeEntrada: null, fechaEstimadaEntrega: null, ingreso: '2026-11-11T12:00:00Z',
    vehiculo: { marca: 'Renault', modelo: 'Clio', matricula: '2222BBB' }, tareas: [], notas: [], ...structuredClone(SIN_ACEITE),
  });
  await page.clock.fastForward(21_000); // refresco automático cada 20 s

  await expect(page.getByText('Renault Clio')).toBeVisible();
  await expect(page.getByText('Nuevo', { exact: true })).toHaveCount(1);
  await expect(page).toHaveTitle('(1) Mis vehículos');
  // El que entró antes va primero.
  const titulos = await page.getByRole('region', { name: 'Por empezar' }).getByTestId('nombre-vehiculo').allInnerTexts();
  expect(titulos).toEqual(['Seat Ibiza', 'Renault Clio']);
});

test('mecánico: si el servidor rechaza una acción, se explica y la tarea no queda marcada', async ({ page }) => {
  const servidor = servidorDeMentira();
  const original = servidor.responder;
  servidor.responder = (body) => body.action === 'marcar_tarea'
    ? { status: 409, json: { error: 'Esta orden ya no está en reparación. Si hay que cambiar algo, pulsa «Reabrir» o avisa al taller.' } }
    : original(body);
  await abrir(page, servidor);

  await page.getByRole('button', { name: /Cambiar pastillas delanteras/ }).click();
  await page.getByRole('button', { name: '30 min', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Esta orden ya no está en reparación');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('0 de 2 hechas')).toBeVisible();
});

test('mecánico: cambio de aceite — marcar la orden, el check list de filtros y el próximo cambio', async ({ page }) => {
  const servidor = servidorDeMentira();
  servidor.ordenes[0].estado = 'en_reparacion';
  await abrir(page, servidor);

  await page.getByRole('button', { name: 'Es un cambio de aceite' }).click();
  await expect(page.getByTestId('aceite-mecanico')).toBeVisible();
  expect(servidor.peticiones.find((p) => p.action === 'aceite')).toMatchObject({ otId: 'ot-1', activo: true });

  const aire = page.getByRole('group', { name: 'Filtro de aire' });
  await aire.getByRole('button', { name: 'Cambiado' }).click();
  await expect(aire.getByRole('button', { name: 'Cambiado' })).toHaveAttribute('aria-pressed', 'true');
  const habitaculo = page.getByRole('group', { name: 'Filtro de habitáculo' });
  await habitaculo.getByRole('button', { name: 'No se cambió' }).click();
  await expect(habitaculo.getByRole('button', { name: 'No se cambió' })).toHaveAttribute('aria-pressed', 'true');
  // Volver a pulsar el marcado lo deja sin revisar.
  await aire.getByRole('button', { name: 'Cambiado' }).click();
  await expect(aire.getByRole('button', { name: 'Cambiado' })).toHaveAttribute('aria-pressed', 'false');
  expect(servidor.peticiones.filter((p) => p.action === 'filtro').map((p) => [p.filtro, p.estado]))
    .toEqual([['aire', 'cambiado'], ['habitaculo', 'no_cambiado'], ['aire', null]]);

  // Próximo cambio: sin fecha no se envía; el atajo «1 año» la rellena.
  await page.getByRole('button', { name: 'Anotar próximo cambio' }).click();
  await page.getByRole('button', { name: 'Guardar próximo cambio' }).click();
  await expect(page.getByRole('alert')).toContainText('Indica la fecha del próximo cambio.');
  expect(servidor.peticiones.some((p) => p.action === 'aceite_proximo')).toBe(false);

  await page.getByRole('button', { name: '1 año', exact: true }).click();
  await page.getByLabel('O a los kilómetros (opcional)').fill('100000');
  await page.getByRole('button', { name: 'Guardar próximo cambio' }).click();
  const enviada = servidor.peticiones.find((p) => p.action === 'aceite_proximo')!;
  expect(enviada).toMatchObject({ otId: 'ot-1', km: 100000 });
  expect(String(enviada.fecha)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByTestId('aceite-mecanico')).toContainText('o a los 100.000 km');
  await expect(page.getByRole('button', { name: 'Cambiar el próximo cambio' })).toBeVisible();
});

test('mecánico: instalable en el móvil con su propio enlace, y sin bajar la aplicación del taller', async ({ page }) => {
  const servidor = servidorDeMentira();
  const pedidos: string[] = [];
  page.on('request', (r) => pedidos.push(r.url()));
  await abrir(page, servidor);

  // El manifiesto de la página es el del mecánico: el icono instalado abre ESTA página, no «/».
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toMatch(/^blob:/);
  const manifiesto = await page.evaluate(async (h) => (await fetch(h as string)).json(), href);
  expect(manifiesto.start_url).toBe(page.url());
  expect(manifiesto.scope).toMatch(/\/mecanico\/$/);
  expect(manifiesto.name).toBe('Mis vehículos · Taller Ejemplo');
  expect(manifiesto.display).toBe('standalone');

  // Quien abre el enlace de un mecánico no descarga el código de la aplicación del taller.
  expect(pedidos.filter((u) => /\/src\/App\.tsx|\/assets\/App-/.test(u))).toEqual([]);
});

function ordenExtra(id: string, numero: string, marca: string, modelo: string, matricula: string, hechas: number, total: number): Orden {
  return {
    id, numero, estado: 'en_reparacion', descripcionProblema: `Problema de ${modelo}`, diagnostico: null,
    kilometrajeEntrada: 50000, fechaEstimadaEntrega: null, ingreso: '2026-11-11T12:00:00Z',
    vehiculo: { marca, modelo, matricula },
    tareas: Array.from({ length: total }, (_, i) => ({ id: `${id}-t${i}`, descripcion: `Tarea ${i + 1} de ${modelo}`, completado: i < hechas, duracionMin: i < hechas ? 30 : null })),
    notas: [], ...structuredClone(SIN_ACEITE),
  };
}

test('mecánico: con varios coches cada uno empieza plegado con su resumen y se despliega al tocarlo', async ({ page }) => {
  const servidor = servidorDeMentira();
  servidor.ordenes.push(ordenExtra('ot-2', 'OT-2026-102', 'Renault', 'Clio', '2222BBB', 2, 2), ordenExtra('ot-3', 'OT-2026-103', 'Audi', 'A3', '3333CCC', 1, 4));
  await abrir(page, servidor);

  // Los tres plegados: ven su resumen (tareas hechas y progreso) pero no el detalle.
  const resumenes = page.getByTestId('resumen-vehiculo');
  await expect(resumenes).toHaveCount(3);
  await expect(resumenes.filter({ hasText: '0/2 tareas' })).toHaveCount(1);
  await expect(resumenes.filter({ hasText: '2/2 tareas' })).toHaveCount(1);
  await expect(resumenes.filter({ hasText: '1/4 tareas' })).toHaveCount(1);
  await expect(page.getByText('Ruido al frenar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cambiar pastillas delanteras/ })).toHaveCount(0);

  // Tocar la cabecera del Seat lo despliega; los demás siguen plegados.
  const cabeceraSeat = page.getByRole('button', { name: /Seat Ibiza/ });
  await expect(cabeceraSeat).toHaveAttribute('aria-expanded', 'false');
  await cabeceraSeat.click();
  await expect(cabeceraSeat).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Ruido al frenar')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cambiar pastillas delanteras/ })).toBeVisible();
  await expect(resumenes).toHaveCount(2);
  await expect(page.getByText('Problema de Clio')).toHaveCount(0);

  // Desplegado se puede trabajar; al volver a tocar se pliega y recupera su resumen.
  await page.getByRole('button', { name: /Cambiar pastillas delanteras/ }).click();
  await page.getByRole('button', { name: '45 min', exact: true }).click();
  await expect(page.getByRole('button', { name: /Cambiar pastillas delanteras/ })).toContainText('45 min');
  await cabeceraSeat.click();
  await expect(cabeceraSeat).toHaveAttribute('aria-expanded', 'false');
  await expect(resumenes).toHaveCount(3);
  await expect(resumenes.filter({ hasText: '1/2 tareas' })).toHaveCount(1);
});

test('mecánico: con un solo coche asignado se abre solo', async ({ page }) => {
  await abrir(page, servidorDeMentira());
  await expect(page.getByRole('button', { name: /Seat Ibiza/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('resumen-vehiculo')).toHaveCount(0);
});

test('mecánico: la cabecera queda centrada y alineada con las tarjetas también en pantallas anchas', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await abrir(page, servidorDeMentira());
  const centro = async (loc: ReturnType<Page['locator']>) => { const b = (await loc.boundingBox())!; return b.x + b.width / 2; };
  const pantalla = 1600 / 2;
  expect(Math.abs((await centro(page.getByRole('heading', { name: 'Hola, Ana' }))) - pantalla)).toBeLessThan(3);
  expect(Math.abs((await centro(page.getByTestId('cabecera-mecanico'))) - pantalla)).toBeLessThan(3);
  expect(Math.abs((await centro(page.getByRole('button', { name: /Seat Ibiza/ }))) - pantalla)).toBeLessThan(220); // la tarjeta está en la misma columna central
  // Los botones de la cabecera caen dentro de la columna de las tarjetas, no pegados al borde de la pantalla.
  const boton = (await page.getByRole('button', { name: 'Actualizar' }).boundingBox())!;
  expect(boton.x + boton.width).toBeLessThan(pantalla + 224 + 1);
});
