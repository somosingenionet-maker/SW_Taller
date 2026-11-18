import { describe, expect, it } from 'vitest';
import { cabenArchivos, esImagen, esTipoAdjunto, extensionDeTipo, formatoTamano, MAX_BYTES_ADJUNTO, tipoDeArchivo, validarArchivoFactura } from './adjuntos';

const F = (type: string, size = 1000, name = 'factura') => ({ name, type, size });

describe('validarArchivoFactura', () => {
  it('acepta PDF y fotos normales', () => {
    expect(validarArchivoFactura(F('application/pdf'))).toBeNull();
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) expect(validarArchivoFactura(F(t, 5_000_000))).toBeNull();
  });
  it('un PDF de más de 10 MB se rechaza, pero una foto grande se acepta porque se reduce antes de subirla', () => {
    expect(validarArchivoFactura(F('application/pdf', MAX_BYTES_ADJUNTO + 1, 'a.pdf'))).toContain('más de 10 MB');
    expect(validarArchivoFactura(F('application/pdf', MAX_BYTES_ADJUNTO))).toBeNull();
    expect(validarArchivoFactura(F('image/jpeg', 25 * 1024 * 1024))).toBeNull();
    expect(validarArchivoFactura(F('image/jpeg', 41 * 1024 * 1024, 'f.jpg'))).toContain('demasiado grande');
  });
  it('rechaza archivos vacíos y formatos que no son factura, diciendo cuál', () => {
    expect(validarArchivoFactura(F('application/pdf', 0, 'v.pdf'))).toBe('«v.pdf» está vacío.');
    expect(validarArchivoFactura(F('text/html', 10, 'x.html'))).toContain('«x.html» no se puede adjuntar');
    expect(validarArchivoFactura(F('application/zip', 10))).toContain('PDF o una foto');
    expect(validarArchivoFactura(F('', 10, 'sin-tipo'))).toContain('no se puede adjuntar');
    expect(tipoDeArchivo({ name: 'Factura.PDF', type: '' })).toBe('application/pdf');   // algunos sistemas no informan el tipo
    expect(validarArchivoFactura(F('', 10, 'Factura.PDF'))).toBeNull();
    expect(tipoDeArchivo({ name: 'x.jpg', type: '' })).toBe('');
  });
});

describe('ayudas', () => {
  it('tamaños legibles', () => {
    expect(formatoTamano(512)).toBe('512 B');
    expect(formatoTamano(340 * 1024)).toBe('340 KB');
    expect(formatoTamano(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });
  it('extensión por tipo y clasificación', () => {
    expect(extensionDeTipo('application/pdf')).toBe('pdf');
    expect(extensionDeTipo('image/jpeg')).toBe('jpg');
    expect(extensionDeTipo('algo/raro')).toBe('bin');
    expect(esTipoAdjunto('image/png')).toBe(true);
    expect(esTipoAdjunto('image/heic')).toBe(false);          // HEIC se convierte antes: no se guarda tal cual
    expect(esImagen('image/webp')).toBe(true);
    expect(esImagen('application/pdf')).toBe(false);
  });
  it('máximo 10 por compra: cuántos caben y cuántos sobran', () => {
    expect(cabenArchivos(0, 3)).toEqual({ caben: 3, sobran: 0 });
    expect(cabenArchivos(8, 5)).toEqual({ caben: 2, sobran: 3 });
    expect(cabenArchivos(10, 1)).toEqual({ caben: 0, sobran: 1 });
    expect(cabenArchivos(12, 1)).toEqual({ caben: 0, sobran: 1 });
  });
});
