// Cifrado simétrico AES-256-GCM para guardar el certificado de cada taller.
// La clave (32 bytes en base64) vive solo como secreto de las Edge Functions
// (VERIFACTU_CERT_KEY), nunca en la base de datos: quien lea la tabla sin esa
// clave solo ve datos cifrados. Formato guardado: base64(iv[12] || cifrado+tag).

const IV_BYTES = 12;

// WebCrypto exige buffers respaldados por un ArrayBuffer (no SharedArrayBuffer).
export type Bytes = Uint8Array<ArrayBuffer>;

export function base64ABytes(b64: string): Bytes {
  const bin = atob(b64);
  const out: Bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesABase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function importarClave(claveB64: string): Promise<CryptoKey> {
  const raw = base64ABytes(claveB64.trim());
  if (raw.length !== 32) {
    throw new Error('VERIFACTU_CERT_KEY debe ser una clave de 32 bytes codificada en base64.');
  }
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function cifrar(datos: Bytes, claveB64: string): Promise<string> {
  const clave = await importarClave(claveB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, datos));
  const out: Bytes = new Uint8Array(IV_BYTES + cifrado.length);
  out.set(iv, 0);
  out.set(cifrado, IV_BYTES);
  return bytesABase64(out);
}

export async function descifrar(payloadB64: string, claveB64: string): Promise<Bytes> {
  const clave = await importarClave(claveB64);
  const todo = base64ABytes(payloadB64);
  if (todo.length <= IV_BYTES) throw new Error('Dato cifrado inválido.');
  const iv = todo.subarray(0, IV_BYTES);
  const cifrado = todo.subarray(IV_BYTES);
  // GCM autentica: si el dato o la clave no son los originales, esto lanza.
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, cifrado));
}

export async function cifrarTexto(texto: string, claveB64: string): Promise<string> {
  return cifrar(new TextEncoder().encode(texto), claveB64);
}

export async function descifrarTexto(payloadB64: string, claveB64: string): Promise<string> {
  return new TextDecoder().decode(await descifrar(payloadB64, claveB64));
}
