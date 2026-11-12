import { describe, expect, it } from 'vitest';
import { textoDeHtml } from './textoHtml';

describe('textoDeHtml', () => {
  it('deja el texto plano tal cual', () => {
    expect(textoDeHtml('Hola Ana,\nte escribimos')).toBe('Hola Ana,\nte escribimos');
  });
  it('quita etiquetas y estilos y conserva los saltos de bloque', () => {
    const html = '<div style="color:red"><style>p{}</style><p>Hola Ana,</p><p>Tu ITV vence el 1/10/2026.</p><td>Seat Ibiza &amp; cía</td></div>';
    expect(textoDeHtml(html)).toBe('Hola Ana,\nTu ITV vence el 1/10/2026.\nSeat Ibiza & cía');
  });
  it('las entidades escapadas se muestran como texto, no se ejecutan', () => {
    expect(textoDeHtml('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe('<script>alert(1)</script>');
  });
  it('recorta los correos largos', () => {
    const largo = textoDeHtml(`<p>${'palabra '.repeat(200)}</p>`, 50);
    expect(largo.length).toBeLessThanOrEqual(51);
    expect(largo.endsWith('…')).toBe(true);
  });
});
