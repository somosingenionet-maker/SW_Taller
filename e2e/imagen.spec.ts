import { test, expect } from '@playwright/test';

// Compresión de imágenes en un navegador real (usa canvas y createImageBitmap, que no existen en Node).
// No necesita sesión: carga el módulo directamente.
test('las fotos grandes se reducen a 1600 px y pesan una fracción; lo pequeño y lo vectorial no se tocan', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const ruta = '/src/utils/imagen.ts'; // en variable: TypeScript no debe intentar resolverla, es del servidor de Vite
    const { comprimirImagen, OPCIONES_FOTO, OPCIONES_LOGO } = await import(/* @vite-ignore */ ruta);
    const crear = async (w: number, h: number, tipo: string, ruido: boolean, calidad = 0.95) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      if (ruido) { // ruido por bloques: una foto real no comprime tan bien como un color liso
        for (let x = 0; x < w; x += 8) for (let y = 0; y < h; y += 8) { ctx.fillStyle = `rgb(${(x * 7 + y) % 256},${(y * 5 + x) % 256},${(x + y * 3) % 256})`; ctx.fillRect(x, y, 8, 8); }
      }
      const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), tipo, calidad));
      return new File([blob], tipo === 'image/png' ? 'a.png' : 'a.jpg', { type: tipo });
    };
    const medir = async (b: Blob) => { const m = await createImageBitmap(b); const d = { w: m.width, h: m.height }; m.close(); return d; };

    const grande = await crear(4000, 3000, 'image/jpeg', true);
    const rg = await comprimirImagen(grande, OPCIONES_FOTO);

    const pequena = await crear(800, 600, 'image/jpeg', false);
    const rp = await comprimirImagen(pequena, OPCIONES_FOTO);

    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'l.svg', { type: 'image/svg+xml' });
    const rs = await comprimirImagen(svg, OPCIONES_LOGO);

    // PNG transparente grande: sigue siendo PNG y conserva la transparencia
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1000;
    const g = c.getContext('2d')!; g.fillStyle = 'rgb(200,30,30)'; g.fillRect(1000, 0, 1000, 1000);
    const pngBlob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), 'image/png'));
    const png = new File([pngBlob], 'logo.png', { type: 'image/png' });
    const rpng = await comprimirImagen(png, { ladoMax: 800, calidad: 0.85 });
    const m = await createImageBitmap(rpng.blob); const c2 = document.createElement('canvas'); c2.width = m.width; c2.height = m.height;
    const g2 = c2.getContext('2d')!; g2.drawImage(m, 0, 0); const alfaIzq = g2.getImageData(5, 5, 1, 1).data[3];

    const basura = await comprimirImagen(new File(['no es una imagen'], 'x.jpg', { type: 'image/jpeg' }), OPCIONES_FOTO);

    return {
      grande: { antes: grande.size, despues: rg.blob.size, tipo: rg.tipo, comprimida: rg.comprimida, dim: await medir(rg.blob) },
      pequena: { igual: rp.blob === pequena, comprimida: rp.comprimida },
      svg: { igual: rs.blob === svg, comprimida: rs.comprimida },
      png: { tipo: rpng.tipo, dim: await medir(rpng.blob), alfaIzq },
      basura: { igual: basura.blob.size === 16, comprimida: basura.comprimida },
    };
  });
  expect(r.grande.comprimida).toBe(true);
  expect(r.grande.tipo).toBe('image/jpeg');
  expect(r.grande.dim).toEqual({ w: 1600, h: 1200 });
  expect(r.grande.despues).toBeLessThan(r.grande.antes);
  expect(r.pequena).toEqual({ igual: true, comprimida: false });
  expect(r.svg).toEqual({ igual: true, comprimida: false });
  expect(r.png.tipo).toBe('image/png');
  expect(r.png.dim).toEqual({ w: 800, h: 400 });
  expect(r.png.alfaIzq).toBe(0); // la mitad izquierda sigue transparente
  expect(r.basura).toEqual({ igual: true, comprimida: false }); // lo que no se puede decodificar se devuelve intacto
  console.log(`foto 4000x3000: ${Math.round(r.grande.antes / 1024)} KB -> ${Math.round(r.grande.despues / 1024)} KB`);
});
