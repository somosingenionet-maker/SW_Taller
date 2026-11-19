import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { irA, login } from './helpers';

const URL_SB = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

const tokenDe = (page: Page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x))!;
  return JSON.parse(localStorage.getItem(k)!).access_token as string;
});
const cab = (token: string) => ({ apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' });

async function insertar(r: APIRequestContext, token: string, tabla: string, fila: object) {
  const res = await r.post(`${URL_SB}/rest/v1/${tabla}`, { headers: cab(token), data: fila });
  expect(res.status(), `insertar en ${tabla}: ${await res.text()}`).toBe(201);
  return (await res.json())[0] as { id: string };
}
const borrar = (r: APIRequestContext, token: string, ruta: string) => r.delete(`${URL_SB}/rest/v1/${ruta}`, { headers: cab(token) });
const ayer = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

// Pantalla «Avisos» contra el taller de pruebas. Crean un cliente temporal («ZZ Prueba avisos …», sin correo para que el aviso espere a una
// persona) y lo borran al terminar con todo lo que cuelga de él (avisos y mensajes del historial).
test.describe('Avisos', () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 1440, height: 1000 } });

  async function conClienteTemporal(page: Page, request: APIRequestContext, datos: { correo?: string; telefono?: string; conCoche?: boolean }, prueba: (c: { id: string; nombre: string; token: string }) => Promise<void>) {
    await login(page);
    const token = await tokenDe(page);
    const sufijo = randomBytes(3).toString('hex');
    const nombre = `ZZ Prueba avisos ${sufijo}`;
    const { conCoche, ...datosCliente } = datos;
    const cliente = await insertar(request, token, 'clientes', { nombre, apellidos: 'Temporal', nif_nie_pasaporte: `ZZ${sufijo}`, ...datosCliente });
    // Un coche temporal (cada coche solo puede tener un dueño, así que no se reutiliza ninguno del taller de pruebas).
    const coche = conCoche ? await insertar(request, token, 'vehiculos', { marca: 'Seat', modelo: 'Prueba', matricula: `ZZ${sufijo.toUpperCase()}`, bastidor: `ZZ${sufijo}`, kilometraje: 1000 }) : null;
    try {
      if (coche) await insertar(request, token, 'cliente_vehiculo', { cliente_id: cliente.id, vehiculo_id: coche.id });
      await page.reload();
      await prueba({ id: cliente.id, nombre, token });
    } finally {
      // Al borrar el cliente se van sus avisos y su historial (on delete cascade); el coche temporal se borra aparte.
      await borrar(request, token, `clientes?id=eq.${cliente.id}`);
      if (coche) await borrar(request, token, `vehiculos?id=eq.${coche.id}`);
    }
  }

  test('un aviso para hoy de un cliente sin contacto se ve en «Para hoy» y se puede descartar', async ({ page, request }) => {
    await conClienteTemporal(page, request, {}, async ({ id, nombre, token }) => {
      await insertar(request, token, 'avisos_cliente', { cliente_id: id, motivo: 'Neumáticos', mensaje: 'Hola', avisar_en: ayer() });
      await page.reload();
      await irA(page, 'Avisos');
      await expect(page.getByTestId('avisos-tab')).toBeVisible();
      const fila = page.getByTestId('aviso-fila').filter({ hasText: nombre });
      await expect(fila).toBeVisible({ timeout: 10_000 });
      await expect(fila).toContainText('Neumáticos');
      await expect(fila).toContainText('Tocaba el');
      await expect(fila).toContainText('Sin correo ni teléfono');
      await fila.getByRole('button', { name: 'Descartar' }).click();
      await page.getByRole('button', { name: 'Sí, quitarlo' }).click();
      await expect(fila).toHaveCount(0);
      // Queda guardado como descartado, no borrado.
      const res = await request.get(`${URL_SB}/rest/v1/avisos_cliente?cliente_id=eq.${id}&select=estado`, { headers: cab(token) });
      expect(await res.json()).toEqual([{ estado: 'descartado' }]);
    });
  });

  test('por WhatsApp: abre el chat con el mensaje, pregunta si se envió y lo anota en el historial', async ({ page, request }) => {
    // WhatsApp no se abre de verdad: se anota la dirección a la que iba la ventana nueva.
    const visitadas: string[] = [];
    await page.context().route('https://wa.me/**', (r) => { visitadas.push(r.request().url()); return r.abort(); });
    await conClienteTemporal(page, request, { telefono: '600 11 22 33' }, async ({ id, nombre, token }) => {
      await insertar(request, token, 'avisos_cliente', { cliente_id: id, motivo: 'Frenos', mensaje: 'Hola {{cliente}}, toca revisar los frenos.', avisar_en: ayer() });
      await page.reload();
      await irA(page, 'Avisos');
      const fila = page.getByTestId('aviso-fila').filter({ hasText: nombre });
      await expect(fila).toContainText('Por WhatsApp');
      const [ventana] = await Promise.all([page.waitForEvent('popup'), fila.getByTestId('aviso-whatsapp').click()]);
      await expect.poll(() => visitadas.length).toBe(1);
      expect(visitadas[0]).toContain('https://wa.me/34600112233?text=');
      expect(decodeURIComponent(visitadas[0])).toContain(`Hola ${nombre}, toca revisar los frenos.`);
      await ventana.close();
      await expect(fila).toContainText('¿Se lo has mandado?');
      await fila.getByTestId('aviso-confirmar-envio').click();
      await expect(fila).toHaveCount(0, { timeout: 10_000 });

      const aviso = await (await request.get(`${URL_SB}/rest/v1/avisos_cliente?cliente_id=eq.${id}&select=estado,canal`, { headers: cab(token) })).json();
      expect(aviso).toEqual([{ estado: 'enviado', canal: 'whatsapp' }]);
      const historial = await (await request.get(`${URL_SB}/rest/v1/notificaciones_cliente?cliente_id=eq.${id}&select=tipo_envio,tipo_evento,origen`, { headers: cab(token) })).json();
      expect(historial).toEqual([{ tipo_envio: 'whatsapp', tipo_evento: 'aviso_personalizado', origen: 'manual' }]);

      await page.getByTestId('avisos-vista-avisados').click();
      await expect(page.getByTestId('aviso-historial').filter({ hasText: nombre })).toContainText('enviado por el taller');
    });
  });

  test('«Nuevo aviso»: se programa «en 6 meses», sale en Programados y se puede quitar', async ({ page, request }) => {
    await conClienteTemporal(page, request, { correo: 'zz-avisos@tallerejemplo.test', conCoche: true }, async ({ id, nombre, token }) => {
      await irA(page, 'Avisos');
      await page.getByTestId('nuevo-aviso-abrir').click();
      const dialogo = page.getByTestId('nuevo-aviso');
      await dialogo.getByRole('button', { name: /Buscar cliente por nombre/ }).click();
      await dialogo.getByPlaceholder('Buscar...').fill(nombre);
      await dialogo.getByRole('listitem').filter({ hasText: `${nombre} Temporal` }).click();
      await dialogo.getByRole('button', { name: 'Otro motivo' }).click();
      await dialogo.getByLabel('Motivo del aviso').fill('ZZ prueba e2e');
      await dialogo.getByRole('button', { name: 'En 6 meses' }).click();
      await expect(dialogo.getByTestId('aviso-vista-previa')).toContainText(`Hola ${nombre}`);
      await dialogo.getByTestId('nuevo-aviso-guardar').click();

      await expect(page.getByTestId('avisos-vista-programados')).toHaveAttribute('aria-selected', 'true');
      const fila = page.getByTestId('aviso-programado').filter({ hasText: nombre });
      await expect(fila).toContainText('ZZ prueba e2e');
      await expect(fila).toContainText('Avisar el');
      const filas = await (await request.get(`${URL_SB}/rest/v1/avisos_cliente?cliente_id=eq.${id}&select=motivo,estado,avisar_en`, { headers: cab(token) })).json() as { motivo: string; estado: string; avisar_en: string }[];
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ motivo: 'ZZ prueba e2e', estado: 'programado' });
      await fila.getByRole('button', { name: 'Quitar' }).click();
      await page.getByRole('button', { name: 'Sí, quitarlo' }).click();
      await expect(fila).toHaveCount(0);
    });
  });

  test('la ficha del cliente enseña lo que está por avisarle y todo lo que ya se le mandó', async ({ page, request }) => {
    await conClienteTemporal(page, request, { telefono: '600 11 22 33', conCoche: true }, async ({ id, nombre, token }) => {
      await insertar(request, token, 'avisos_cliente', { cliente_id: id, motivo: 'Frenos', mensaje: 'Hola', avisar_en: '2099-01-10' });
      await insertar(request, token, 'notificaciones_cliente', {
        cliente_id: id, tipo_envio: 'whatsapp', asunto: 'Neumáticos — Seat Prueba', mensaje: 'Hola, toca revisar los neumáticos.', tipo_evento: 'aviso_personalizado', origen: 'manual',
      });
      await page.reload();
      await irA(page, 'Clientes');
      await page.getByPlaceholder('Buscar por nombre, documento (NIF/NIE) o email...').fill(nombre);
      await page.locator('main tbody tr[id^="cli-row-"]').first().click();
      const ficha = page.getByTestId('avisos-cliente');
      await expect(ficha).toBeVisible();
      await expect(ficha.getByTestId('avisos-cliente-proximo')).toContainText('Frenos');
      await expect(ficha.getByTestId('avisos-cliente-proximo')).toContainText('Avisar el');
      await expect(ficha.getByText('Enviados · 1')).toBeVisible();
      const enviado = ficha.getByTestId('avisos-cliente-enviado');
      await expect(enviado).toContainText('Aviso personalizado');
      await expect(enviado).toContainText('enviado por el taller');
      await enviado.getByRole('button').click();
      await expect(enviado).toContainText('Hola, toca revisar los neumáticos.');

      // Se puede programar un aviso desde la propia ficha, con el cliente ya elegido.
      await ficha.getByTestId('cliente-programar-aviso').click();
      const dialogo = page.getByTestId('nuevo-aviso');
      await expect(dialogo).toContainText(nombre);
      await dialogo.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialogo).toHaveCount(0);
    });
  });

  test('una orden de aceite lista sin el próximo cambio anotado sale en «Para hoy» y se resuelve desde ahí', async ({ page, request }) => {
    await conClienteTemporal(page, request, { correo: 'zz-aceite@tallerejemplo.test', conCoche: true }, async ({ id, token }) => {
      const coche = (await (await request.get(`${URL_SB}/rest/v1/cliente_vehiculo?cliente_id=eq.${id}&select=vehiculo_id`, { headers: cab(token) })).json() as { vehiculo_id: string }[])[0].vehiculo_id;
      const numero = `ZZ-${randomBytes(3).toString('hex')}`;
      await insertar(request, token, 'ordenes_trabajo', { numero, cliente_id: id, vehiculo_id: coche, estado: 'listo', es_cambio_aceite: true });
      await page.reload();
      await irA(page, 'Avisos');
      const fila = page.getByTestId('aviso-fila').filter({ hasText: numero });
      await expect(fila).toBeVisible({ timeout: 10_000 });
      await expect(fila).toContainText('Cambio de aceite');
      await expect(fila).toContainText('Sin esto no se le avisará');

      await fila.getByTestId('aviso-anotar-aceite').click();
      const dialogo = page.getByTestId('anotar-aceite');
      await dialogo.getByRole('button', { name: 'En 6 meses' }).click();
      await dialogo.getByRole('button', { name: 'Guardar próximo cambio' }).click();
      await expect(fila).toHaveCount(0, { timeout: 10_000 });

      // Quedó anotado en la ficha del coche y se creó el aviso de aceite, que ahora está programado.
      const alertas = await (await request.get(`${URL_SB}/rest/v1/alertas?vehiculo_id=eq.${coche}&tipo=eq.aceite&select=estado,fecha_limite`, { headers: cab(token) })).json() as { estado: string; fecha_limite: string }[];
      expect(alertas).toHaveLength(1);
      expect(alertas[0].estado).toBe('activa');
      await page.getByTestId('avisos-vista-programados').click();
      await expect(page.getByTestId('aviso-programado').filter({ hasText: 'Cambio de aceite' }).filter({ hasText: 'Seat Prueba' })).toBeVisible();
      await borrar(request, token, `ordenes_trabajo?numero=eq.${numero}`);
    });
  });

  test('el aviso de que los envíos automáticos están apagados lleva a activarlos o a los ajustes', async ({ page }) => {
    await login(page);
    await irA(page, 'Avisos');
    await expect(page.getByTestId('avisos-tab')).toBeVisible();
    await page.getByRole('button', { name: 'Ajustes de avisos' }).click();
    await expect(page.getByTestId('cfg-antelacion-14')).toBeVisible();
    await expect(page.getByTestId('cfg-avisosItv')).toBeVisible();
  });
});
