// Cliente HTTPS con certificado de cliente (mTLS) hacia el servicio web de la
// AEAT. La autenticación ante la AEAT ES el certificado: sin él, la conexión
// ni siquiera llega a la capa SOAP.

export interface OpcionesEnvio {
  url: string;
  xml: string;
  certPem: string;
  keyPem: string;
  /** Solo para pruebas locales contra un servidor con CA propia. */
  caCerts?: string[];
  timeoutMs?: number;
}

export interface ResultadoHttp {
  status: number;
  texto: string;
}

export async function enviarSoap(o: OpcionesEnvio): Promise<ResultadoHttp> {
  const client = Deno.createHttpClient({
    cert: o.certPem,
    key: o.keyPem,
    ...(o.caCerts ? { caCerts: o.caCerts } : {}),
  });
  try {
    const resp = await fetch(o.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body: o.xml,
      client,
      signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
    });
    return { status: resp.status, texto: await resp.text() };
  } finally {
    client.close();
  }
}
