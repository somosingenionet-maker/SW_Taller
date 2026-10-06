// Lectura de un certificado electrónico en formato PKCS#12 (.p12 / .pfx).
// Se usa para (1) validarlo al subirlo (contraseña correcta, vigente, con clave
// privada) y (2) extraer el par certificado/clave en PEM que necesita el
// cliente TLS para autenticarse ante la AEAT.
// @deno-types="npm:@types/node-forge@1.3.11"
import forge from 'npm:node-forge@1.3.1';

export interface CertificadoLeido {
  /** Certificado del titular seguido de los intermedios que traiga el archivo. */
  certPem: string;
  keyPem: string;
  titularNif: string | null;
  titularNombre: string | null;
  validoDesde: Date;
  validoHasta: Date;
}

export class ErrorCertificado extends Error {}

// node-forge solo localiza los campos del sujeto por nombre corto o por OID, y
// algunos (serialNumber, organizationIdentifier) no tienen nombre corto: se
// busca siempre por OID.
const OID_CN = '2.5.4.3';
const OID_SERIAL_NUMBER = '2.5.4.5';
const OID_ORGANIZATION_IDENTIFIER = '2.5.4.97';

function campo(cert: forge.pki.Certificate, oid: string): string | null {
  const f = cert.subject.getField({ type: oid }) as { value?: string } | null;
  return f?.value ? String(f.value) : null;
}

/** NIF del titular según los formatos habituales de los certificados cualificados españoles (FNMT y otros). */
export function nifDelSujeto(candidatos: Array<string | null>): string | null {
  for (const c of candidatos) {
    if (!c) continue;
    const m = /(?:IDCES|VATES)-?([A-Z0-9]{9})/i.exec(c) ?? /\b(?:NIF|CIF)[\s:-]*([A-Z0-9]{9})\b/i.exec(c);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

export function leerP12(p12: Uint8Array, password: string, ahora: Date = new Date()): CertificadoLeido {
  let p12Obj: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.createBuffer(forge.util.binary.raw.encode(p12));
    p12Obj = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, password);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/mac|password|decrypt/i.test(msg)) throw new ErrorCertificado('La contraseña del certificado no es correcta.');
    throw new ErrorCertificado('El archivo no es un certificado PKCS#12 (.p12 / .pfx) válido.');
  }

  const certBags = p12Obj.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBagsCifradas = p12Obj.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const keyBagsPlanas = p12Obj.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const claves = [...keyBagsCifradas, ...keyBagsPlanas].map((b) => b.key).filter(Boolean) as forge.pki.PrivateKey[];
  const certs = certBags.map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[];

  if (claves.length === 0) throw new ErrorCertificado('El archivo no contiene la clave privada del certificado.');
  if (certs.length === 0) throw new ErrorCertificado('El archivo no contiene ningún certificado.');

  // El certificado del titular es el cuya clave pública corresponde a la clave privada.
  const clave = claves[0] as forge.pki.rsa.PrivateKey;
  const hoja = certs.find((c) => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey;
    return pub?.n && clave?.n && pub.n.compareTo(clave.n) === 0 && pub.e.compareTo(clave.e) === 0;
  });
  if (!hoja) throw new ErrorCertificado('Ningún certificado del archivo corresponde a su clave privada.');

  if (ahora < hoja.validity.notBefore) throw new ErrorCertificado('El certificado todavía no es válido.');
  if (ahora > hoja.validity.notAfter) throw new ErrorCertificado('El certificado ha caducado.');

  const cn = campo(hoja, OID_CN);
  const serial = campo(hoja, OID_SERIAL_NUMBER);
  const orgId = campo(hoja, OID_ORGANIZATION_IDENTIFIER);
  const nombre = cn ? cn.replace(/\s+-\s+(?:NIF|CIF)\b.*$/i, '').trim() : null;

  const intermedios = certs.filter((c) => c !== hoja);
  return {
    certPem: [hoja, ...intermedios].map((c) => forge.pki.certificateToPem(c)).join(''),
    keyPem: forge.pki.privateKeyToPem(clave),
    titularNif: nifDelSujeto([serial, orgId, cn]),
    titularNombre: nombre,
    validoDesde: hoja.validity.notBefore,
    validoHasta: hoja.validity.notAfter,
  };
}
