import { ArrowLeft } from 'lucide-react';
import { PRODUCTOR, SISTEMA, declaracionCompleta } from '../legal/sistemaInformatico';

interface LegalPageProps {
  page: 'privacidad' | 'terminos' | 'declaracion-responsable' | 'encargo-de-tratamiento';
}

const TITULOS: Record<LegalPageProps['page'], string> = {
  privacidad: 'Política de Privacidad',
  terminos: 'Términos y Condiciones de Uso',
  'declaracion-responsable': 'Declaración Responsable del Sistema Informático de Facturación',
  'encargo-de-tratamiento': 'Contrato de Encargo de Tratamiento de Datos',
};

const CONTACTO = 'comercial@somosingenio.net';
const ULTIMA_ACTUALIZACION = '9 de octubre de 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-base font-extrabold text-slate-900 mb-2.5">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}


const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : iso;
}

function Dato({ clave, children }: { clave: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{clave}</p>
      <p className="text-slate-800">{children}</p>
    </div>
  );
}

// Estructura y orden del artículo 15 de la Orden HAC/1177/2024: es la información
// que debe contener la declaración responsable del productor del sistema.
function DeclaracionResponsable() {
  return (
    <>
      {!declaracionCompleta() && (
        <div className="mb-7 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <b>Borrador sin firmar.</b> La declaración se considera emitida cuando el productor la firma y se anota aquí
          su fecha. Hasta entonces este documento no tiene valor como declaración responsable.
        </div>
      )}

      <p className="text-sm text-slate-600 leading-relaxed mb-7">
        Este documento recoge la información del sistema informático de facturación {SISTEMA.nombre} conforme al artículo 15 de la
        Orden HAC/1177/2024, de 17 de octubre, que desarrolla las especificaciones técnicas, funcionales y de contenido del Reglamento
        que establece los requisitos de los sistemas informáticos de facturación (Real Decreto 1007/2023, de 5 de diciembre).
      </p>

      <Section title="1. Datos del sistema informático y de su productor">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <Dato clave="a) Nombre del sistema">{SISTEMA.nombre}</Dato>
          <Dato clave="b) Código identificador del sistema">{SISTEMA.id}</Dato>
          <Dato clave="c) Identificador completo de la versión">{`${SISTEMA.nombre} ${SISTEMA.version} (código ${SISTEMA.id})`}</Dato>
        </div>
        <div className="my-5">
          <Dato clave="d) Componentes y funcionalidades">
            {SISTEMA.nombre} es una aplicación web (SaaS) de gestión para talleres mecánicos y flotas que se usa desde el navegador.
            Se compone de la aplicación web, una base de datos en la nube donde se generan y conservan las facturas, sus registros de facturación
            y la huella encadenada, y funciones de servidor que remiten esos registros a la AEAT. No incluye componentes de hardware propios:
            se ejecuta sobre infraestructura en la nube de terceros. Permite capturar los datos de facturación, expedir y consultar facturas
            (con su código QR) y enviar los registros de facturación a la AEAT. Gestiona de forma independiente la facturación de cada empresa,
            como si fueran sistemas de facturación distintos.
          </Dato>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <Dato clave="e) ¿Funciona exclusivamente como VERI*FACTU?">Sí. {SISTEMA.nombre} funciona únicamente en la modalidad VERI*FACTU.</Dato>
          <Dato clave="f) ¿Permite varios obligados tributarios?">
            Sí. Permite llevar de forma independiente la facturación de varios obligados tributarios; cada uno cuenta con un número de instalación propio.
          </Dato>
          <Dato clave="g) Tipos de firma de los registros">
            No aplica. Al funcionar solo como VERI*FACTU los registros no se firman electrónicamente: quedan autenticados al remitirse a la sede electrónica de la AEAT con el certificado electrónico cualificado del obligado.
          </Dato>
          <Dato clave="h) Razón social o nombre del productor">{PRODUCTOR.nombreRazon}</Dato>
          <Dato clave="i) NIF del productor">{PRODUCTOR.nif}</Dato>
          <Dato clave="j) Dirección postal de contacto">{PRODUCTOR.domicilio}</Dato>
        </div>
        <div className="mt-5">
          <Dato clave="k) Declaración">
            El productor hace constar que el sistema informático indicado, en la versión indicada, cumple con lo dispuesto en el artículo
            29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria; en el Reglamento que establece los requisitos que deben
            adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y
            profesionales, y la estandarización de formatos de los registros de facturación, aprobado por el Real Decreto 1007/2023, de 5 de
            diciembre; en la Orden HAC/1177/2024, de 17 de octubre; y en la sede electrónica de la Agencia Estatal de Administración
            Tributaria para todo aquello que complete las especificaciones de dicha orden.
          </Dato>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-5">
          <Dato clave="l) Fecha de firma">
            {declaracionCompleta() ? fechaLarga(PRODUCTOR.fechaFirma) : 'Pendiente de firma'}
          </Dato>
          <Dato clave="l) Lugar de firma">{PRODUCTOR.lugarFirma}</Dato>
          <Dato clave="Firmante">{PRODUCTOR.firmante}</Dato>
        </div>
      </Section>

      <Section title="2. Información adicional">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          <Dato clave="a) Otras formas de contacto">
            Teléfono {PRODUCTOR.telefono} · Correo{' '}
            <a href={`mailto:${PRODUCTOR.correo}`} className="text-blue-600 hover:underline">{PRODUCTOR.correo}</a>
          </Dato>
          <Dato clave="b) Direcciones de internet">
            <a href={PRODUCTOR.web} className="text-blue-600 hover:underline">{PRODUCTOR.web}</a>
            {' · '}
            <a href="/declaracion-responsable" className="text-blue-600 hover:underline">Esta declaración y las de versiones anteriores</a>
          </Dato>
        </div>
        <div className="mt-5">
          <Dato clave="c) Cómo cumple el sistema las especificaciones">
            <span className="block mb-2">
              {SISTEMA.nombre} aborda el cumplimiento de la Orden HAC/1177/2024 en la gestión de las facturas y de sus registros de
              facturación de la siguiente manera:
            </span>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Al emitir una factura se genera su registro de facturación de alta y, si la factura se cancela, un registro de anulación.</li>
              <li>
                Cada registro lleva una huella SHA-256 (en hexadecimal y mayúsculas) calculada sobre los campos y en el orden que fija la
                especificación técnica de la AEAT, y se encadena con la huella del registro anterior de la misma empresa.
              </li>
              <li>La numeración de las facturas es correlativa, sin huecos, y se asigna en el servidor en el momento de emitir.</li>
              <li>
                Una factura emitida no puede modificarse ni eliminarse, y los registros de facturación son inalterables: cualquier corrección se
                hace mediante anulación. Los datos del cliente quedan congelados tal como estaban al emitir.
              </li>
              <li>
                Las facturas incluyen el código QR con la URL de cotejo de la AEAT y las leyendas exigidas, con las dimensiones y el nivel de
                corrección de errores que fija la norma.
              </li>
              <li>
                Los registros se remiten automáticamente a la AEAT justo después de generarse, autenticándose con el certificado electrónico
                cualificado de la empresa. Si el envío falla se reintenta de forma automática, respetando el tiempo de espera que indica la AEAT,
                y el estado de cada envío se muestra en la propia factura.
              </li>
              <li>Al funcionar solo como VERI*FACTU no se firman los registros ni se genera un registro de eventos.</li>
            </ul>
          </Dato>
        </div>
      </Section>
    </>
  );
}

function Privacidad() {
  return (
    <>
      <Section title="1. Responsable del tratamiento">
        <p>
          <b>Oscar Daniel Sánchez Saenz</b> (marca comercial "Somos InGenio", en adelante "InGenio"), con NIF <b>Y5483982Z</b> y
          domicilio en Calle Doctor Sapena 68, Elche (Alicante), es el responsable del tratamiento de
          los datos descritos en esta política. Puedes contactarnos en{' '}
          <a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a>.
        </p>
      </Section>

      <Section title="2. A quién aplica esta política">
        <p>
          Doonty Motor es un software que talleres y gestores de flotas ("<b>tú</b>", si eres cliente
          nuestro) usan para llevar sus propios clientes, vehículos y facturación. Esto da lugar a dos
          roles distintos:
        </p>
        <p>
          <b>a) Datos de tu cuenta y de tu empresa</b> (nombre, email, teléfono de los usuarios que das de
          alta, datos fiscales del taller): aquí InGenio es <b>responsable del tratamiento</b>.
        </p>
        <p>
          <b>b) Datos que tú introduces sobre tus propios clientes</b> (CRM, vehículos, órdenes de
          trabajo, facturas): aquí InGenio actúa como <b>encargado de tratamiento</b> por tu cuenta — tú
          sigues siendo responsable frente a tus clientes y debes contar con base legal para tratar sus
          datos e informarles conforme a la normativa. Las condiciones de ese encargo (art. 28 RGPD) están
          recogidas en nuestro{' '}
          <a href="/encargo-de-tratamiento" className="text-blue-600 hover:underline">Contrato de encargo de tratamiento</a>,
          que forma parte de los Términos de Uso.
        </p>
      </Section>

      <Section title="3. Qué datos recogemos">
        <p>Datos de cuenta: nombre, email, teléfono y contraseña (cifrada) de cada usuario.</p>
        <p>Datos de la empresa: razón social, NIF, dirección fiscal, datos de contacto, marca.</p>
        <p>
          Datos introducidos al usar el servicio (por tu cuenta, como encargado de tratamiento): datos
          de tus clientes (nombre, NIF/NIE, email, teléfono, dirección), vehículos, órdenes de trabajo y
          facturas.
        </p>
        <p>
          Datos de facturación electrónica: los registros de facturación de tus facturas (huella, número,
          importes y estado del envío a la Agencia Tributaria) y, si activas el envío, el certificado
          electrónico de tu empresa (archivo y contraseña), que se guarda cifrado.
        </p>
        <p>Datos técnicos: dirección IP, tipo de navegador, y registros de error técnico.</p>
      </Section>

      <Section title="4. Para qué usamos tus datos">
        <p>Prestar el servicio: gestión de flota, taller, CRM, inventario y facturación.</p>
        <p>Gestionar el alta, autenticación y soporte de tu cuenta.</p>
        <p>
          Enviar, por encargo tuyo, los recordatorios automáticos (ITV, seguro, impuesto, mantenimiento)
          a los clientes que tú registras, cuando actives esa función.
        </p>
        <p>Facturación y cumplimiento de obligaciones fiscales y mercantiles.</p>
        <p>
          Remitir a la Agencia Tributaria (AEAT), por encargo tuyo y con tu certificado, los registros de
          facturación de las facturas que emites (sistema VERI*FACTU), cuando actives el envío.
        </p>
        <p>Seguridad, prevención de fraude y resolución de incidencias técnicas.</p>
      </Section>

      <Section title="5. Base legal">
        <p>Ejecución del contrato de prestación del servicio SaaS (art. 6.1.b RGPD).</p>
        <p>
          Cumplimiento de obligaciones legales, en particular fiscales (art. 6.1.c): entre ellas, la de los
          obligados a expedir facturas de remitir sus registros de facturación a la AEAT.
        </p>
        <p>Interés legítimo en la seguridad y mejora del servicio (art. 6.1.f).</p>
        <p>Consentimiento, cuando se solicite expresamente (por ejemplo, comunicaciones comerciales).</p>
      </Section>

      <Section title="6. Con quién compartimos tus datos">
        <p>
          Para prestar el servicio trabajamos con los siguientes proveedores tecnológicos, como
          encargados de tratamiento bajo contrato:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b>Supabase, Inc.</b> — base de datos, autenticación y almacenamiento. Servidores en la Unión Europea (Frankfurt, Alemania).</li>
          <li><b>Vercel Inc.</b> — alojamiento de la aplicación web.</li>
          <li><b>Resend</b> — envío de correos electrónicos (recuperación de contraseña, recordatorios automáticos).</li>
          <li><b>Sentry</b> — monitorización técnica de errores, configurada para no capturar datos personales identificativos por defecto.</li>
        </ul>
        <p>
          Además, si activas el envío de facturas, los registros de facturación se comunican a la{' '}
          <b>Agencia Estatal de Administración Tributaria (AEAT)</b>. No es un proveedor nuestro: es una
          comunicación que la normativa exige al obligado a emitir facturas (tú), y la hacemos en tu
          nombre y con tu certificado.
        </p>
        <p>
          Cuando alguno de estos proveedores esté ubicado fuera del Espacio Económico Europeo, la
          transferencia se ampara en las Cláusulas Contractuales Tipo de la Comisión Europea u otro
          mecanismo válido conforme al RGPD. No vendemos ni cedemos tus datos a terceros con fines
          comerciales.
        </p>
      </Section>

      <Section title="7. Cuánto tiempo conservamos tus datos">
        <p>
          Los datos de tu cuenta y tu empresa se conservan mientras dure la relación contractual y,
          tras finalizar, el tiempo necesario para cumplir obligaciones legales (por ejemplo, la
          documentación mercantil/fiscal debe conservarse hasta 6 años conforme al Código de Comercio).
        </p>
        <p>
          Los datos que tú introduces sobre tus propios clientes se conservan según lo que tú
          determines, conforme a tu propia base legal y política de conservación.
        </p>
        <p>
          Las facturas emitidas y sus registros de facturación son inalterables y no pueden eliminarse
          mientras dure la obligación legal de conservarlos; si un cliente tuyo ejerce su derecho de
          supresión, sus datos de contacto pueden anonimizarse, pero la factura se conserva.
        </p>
      </Section>

      <Section title="8. Tus derechos">
        <p>
          Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión,
          oposición, limitación del tratamiento y portabilidad escribiendo a{' '}
          <a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a>. También
          tienes derecho a reclamar ante la Agencia Española de Protección de Datos (
          <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.aepd.es</a>
          ) si consideras que el tratamiento no se ajusta a la normativa.
        </p>
        <p>
          Si eres cliente de un taller que usa Doonty Motor (y no cliente directo nuestro), debes
          dirigir tu solicitud a ese taller, que es el responsable de tus datos; nosotros le damos
          soporte técnico para atenderla.
        </p>
      </Section>

      <Section title="9. Seguridad">
        <p>Conexiones cifradas (HTTPS/TLS) en toda la aplicación.</p>
        <p>
          Aislamiento de datos entre empresas clientes mediante políticas de seguridad a nivel de fila
          en la base de datos: cada taller solo puede acceder a sus propios datos.
        </p>
        <p>Contraseñas gestionadas y cifradas por el proveedor de autenticación, nunca en texto plano.</p>
        <p>
          Verificación en dos pasos opcional (aplicación autenticadora, TOTP) para cada usuario. Cuando un
          usuario la activa, también la exigen la base de datos y las funciones del servidor: con solo la
          contraseña no se puede acceder a los datos, ni siquiera llamando a la API directamente.
        </p>
        <p>
          El certificado electrónico que subes para el envío a la AEAT se cifra antes de guardarse
          (AES-256) con una clave que se conserva aparte de la base de datos: no puede leerse desde ella
          ni desde la aplicación, y solo lo usa el proceso que envía tus registros a la AEAT.
        </p>
      </Section>

      <Section title="10. Menores de edad">
        <p>Doonty Motor no está dirigido a menores de edad. No recogemos conscientemente sus datos.</p>
      </Section>

      <Section title="11. Cambios en esta política">
        <p>
          Podemos actualizar este documento para reflejar cambios legales o del servicio. La fecha de
          la última actualización figura al inicio de esta página.
        </p>
      </Section>

      <Section title="12. Contacto">
        <p><a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a></p>
      </Section>
    </>
  );
}

function Terminos() {
  return (
    <>
      <Section title="1. Quiénes somos">
        <p>
          Doonty Motor es un servicio operado por <b>Oscar Daniel Sánchez Saenz</b> (NIF Y5483982Z,
          marca comercial "Somos InGenio", en adelante "InGenio"), con domicilio en Calle Doctor Sapena 68, Elche (Alicante).
          Contacto: <a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a>.
        </p>
      </Section>

      <Section title="2. Objeto del servicio">
        <p>
          Doonty Motor es una plataforma de gestión para talleres mecánicos y de flotas: control de
          vehículos, órdenes de trabajo, CRM de clientes, facturación (con envío de los registros a la
        Agencia Tributaria) e inventario.
        </p>
      </Section>

      <Section title="3. Aceptación">
        <p>
          El acceso y uso del servicio implica la aceptación plena de estos términos. Si actúas en
          representación de una empresa, declaras tener capacidad para vincularla a ellos.
        </p>
      </Section>

      <Section title="4. Registro y cuenta">
        <p>Debes proporcionar información veraz al darte de alta.</p>
        <p>Eres responsable de mantener la confidencialidad de tus credenciales y de la actividad realizada desde tu cuenta.</p>
        <p>Cada empresa (taller) gestiona los accesos y permisos de sus propios usuarios desde su Panel de Administración.</p>
      </Section>

      <Section title="5. Uso permitido">
        <p>El servicio debe usarse para la gestión legítima de la actividad de tu taller o flota.</p>
        <p>
          No está permitido usarlo para fines ilícitos, introducir datos de terceros sin base legal
          para ello, intentar vulnerar la seguridad de la plataforma, ni revender el acceso sin
          autorización.
        </p>
      </Section>

      <Section title="6. Datos que tú introduces">
        <p>
          Como taller, eres responsable de los datos personales de tus propios clientes que introduces
          en la plataforma. Garantizas contar con base legal para tratarlos y haber informado a tus
          clientes conforme a la normativa de protección de datos. InGenio actúa como encargado de
          tratamiento respecto a estos datos, en los términos de nuestro{' '}
          <a href="/encargo-de-tratamiento" className="text-blue-600 hover:underline">Contrato de encargo de tratamiento</a>
          (art. 28 RGPD), que forma parte de estos Términos y se entiende aceptado con ellos, y de nuestra{' '}
          <a href="/privacidad" className="text-blue-600 hover:underline">Política de Privacidad</a>.
        </p>
      </Section>

      <Section title="7. Facturación electrónica y VERI*FACTU">
        <p>
          Doonty Motor es un sistema informático de facturación que funciona únicamente en la modalidad
          VERI*FACTU: al emitir una factura, sus registros de facturación se envían a la Agencia
          Tributaria (AEAT). InGenio, como productor del software, certifica su cumplimiento en la{' '}
          <a href="/declaracion-responsable" className="text-blue-600 hover:underline">Declaración Responsable</a>.
        </p>
        <p>
          <b>Quién responde de qué.</b> InGenio responde de que el software funcione conforme a esa
          declaración (huella, encadenamiento, inalterabilidad de las facturas emitidas, código QR y
          envío). Tú, como obligado a expedir facturas, eres responsable del contenido de tus facturas
          (clientes, conceptos, importes, tipo de IVA y su correcta clasificación), de emitirlas y, en su
          caso, anularlas cuando corresponda, de usar el sistema conforme a la normativa y de revisar el
          estado del envío de cada factura.
        </p>
        <p>
          <b>Certificado electrónico.</b> Para enviar tus registros a la AEAT hace falta un certificado
          electrónico cualificado válido de tu empresa (o de quien la represente ante la AEAT). Al subirlo
          nos autorizas a usarlo exclusivamente para remitir tus registros de facturación. Se guarda
          cifrado y puedes retirarlo en cualquier momento, con lo que el envío se desactiva. Eres
          responsable de que sea válido y esté vigente y de renovarlo: si caduca o lo revocas, no podremos
          enviar tus facturas.
        </p>
        <p>
          <b>Pruebas y producción.</b> Lo que se envía al entorno de Pruebas no tiene efectos fiscales.
          Pasar a Producción es decisión tuya y, desde ese momento, cada factura que emitas queda
          registrada en la AEAT con efectos reales.
        </p>
        <p>
          Una factura emitida no se puede modificar ni borrar: los errores se corrigen mediante
          anulación. Si la AEAT rechaza o no puede recibir un registro, lo reintentamos
          automáticamente, pero no controlamos su disponibilidad ni sus decisiones, y un registro
          rechazado puede impedir el envío de los siguientes hasta que se revise.
        </p>
        <p>
          InGenio no presta asesoramiento fiscal, contable ni jurídico: consulta con tu asesor cómo
          aplicar la normativa de facturación a tu actividad.
        </p>
      </Section>
      
      <Section title="8. Planes, precios y facturación">
        <p>
          Los precios y condiciones del plan contratado se comunican de forma individual. Nos
          reservamos el derecho a modificar los precios, avisando con antelación razonable antes de que
          surtan efecto en tu siguiente periodo de facturación.
        </p>
      </Section>

      <Section title="9. Disponibilidad del servicio">
        <p>
          Hacemos un esfuerzo razonable por mantener el servicio disponible, pero no garantizamos una
          disponibilidad del 100&nbsp;%. Puede haber interrupciones programadas (mantenimiento) o no
          programadas (incidencias de nuestros proveedores de infraestructura).
        </p>
      </Section>

      <Section title="10. Propiedad intelectual">
        <p>
          El software, la marca, el diseño y el código de Doonty Motor son propiedad de InGenio. El uso
          del servicio no transfiere ningún derecho de propiedad intelectual sobre la plataforma. Los
          datos que tú introduces (clientes, vehículos, facturas...) siguen siendo tuyos.
        </p>
      </Section>

      <Section title="11. Limitación de responsabilidad">
        <p>
          En la medida permitida por la ley, InGenio no será responsable de daños indirectos, lucro
          cesante o pérdida de datos derivados del uso del servicio, salvo en casos de dolo o
          negligencia grave. InGenio tampoco responde del contenido de las facturas que emites ni de las
          consecuencias fiscales de datos o clasificaciones incorrectas introducidos por ti. Te recomendamos exportar copias periódicas de tus datos (función CSV
          disponible en varios módulos).
        </p>
      </Section>

      <Section title="12. Duración y cancelación">
        <p>
          Puedes solicitar la baja del servicio en cualquier momento escribiendo a{' '}
          <a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a>. Tras
          la baja, tus datos se conservarán durante el plazo indicado en la Política de Privacidad y
          después se eliminarán, salvo obligación legal de conservarlos.
        </p>
      </Section>

      <Section title="13. Modificación de los términos">
        <p>
          Podemos actualizar estos términos para reflejar cambios legales o del servicio. Te avisaremos
          de cualquier cambio sustancial.
        </p>
      </Section>

      <Section title="14. Ley aplicable y jurisdicción">
        <p>
          Estos términos se rigen por la legislación española. Para cualquier controversia, las partes
          se someten a los juzgados y tribunales que correspondan conforme a la ley, sin perjuicio de
          los fueros que puedan corresponder a los consumidores.
        </p>
      </Section>

      <Section title="15. Contacto">
        <p><a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a></p>
      </Section>
    </>
  );
}

function EncargoTratamiento() {
  return (
    <>
      <Section title="1. Partes y alcance">
        <p>
          Este contrato regula el tratamiento de datos personales que <b>Oscar Daniel Sánchez Saenz</b>
          {' '}(marca comercial "Somos InGenio", NIF <b>Y5483982Z</b>, Calle Doctor Sapena 68, Elche, Alicante;
          en adelante, el "<b>Encargado</b>") realiza por cuenta del taller o empresa que contrata Doonty
          Motor (en adelante, el "<b>Responsable</b>"), conforme al artículo 28 del Reglamento (UE) 2016/679
          (RGPD) y a la Ley Orgánica 3/2018.
        </p>
        <p>
          Forma parte de los <a href="/terminos" className="text-blue-600 hover:underline">Términos de Uso</a> y
          queda aceptado junto con ellos al crear la cuenta; no hace falta firmarlo aparte. Si necesitas una
          copia firmada, escríbenos a{' '}
          <a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a>.
        </p>
        <p>
          Se aplica solo a los datos que el Responsable introduce sobre sus propios clientes y operaciones.
          Los datos de la cuenta y de la empresa del propio Responsable (usuarios, datos fiscales) los trata
          InGenio como responsable, según la{' '}
          <a href="/privacidad" className="text-blue-600 hover:underline">Política de Privacidad</a>.
        </p>
      </Section>

      <Section title="2. Objeto, naturaleza y finalidad">
        <p>
          El Encargado presta el servicio Doonty Motor (software de gestión de talleres y flotas, en modalidad
          SaaS) y, para ello, trata los datos personales que el Responsable introduce en la plataforma. El
          tratamiento consiste en almacenar, consultar, organizar, modificar, conservar, mostrar, exportar y
          eliminar esos datos, y en enviarlos cuando el Responsable así lo ordena mediante las funciones del
          servicio:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Envío de correos electrónicos de recordatorio y avisos a los clientes del Responsable.</li>
          <li>Publicación de los enlaces del Portal del Cliente y del Portal del Mecánico que el Responsable genera.</li>
          <li>Remisión a la Agencia Tributaria (AEAT) de los registros de facturación, con el certificado del Responsable, si activa el envío VERI*FACTU.</li>
        </ul>
        <p>La finalidad es exclusivamente prestar el servicio contratado. El Encargado no usa estos datos para fines propios.</p>
      </Section>

      <Section title="3. Datos y personas afectadas">
        <p>
          <b>Categorías de interesados:</b> clientes del Responsable (personas físicas y representantes de
          empresas), conductores o titulares de vehículos y, en su caso, el personal del Responsable
          (técnicos).
        </p>
        <p>
          <b>Tipos de datos:</b> identificación y contacto (nombre, apellidos, NIF/NIE/pasaporte, correo,
          teléfono, dirección), datos de vehículos (matrícula, bastidor, kilometraje, vencimientos de ITV,
          seguro e impuesto), historial de órdenes de trabajo, notas e interacciones, y datos de facturación.
          No están pensados para datos de categorías especiales (art. 9 RGPD) ni de menores; el Responsable
          se compromete a no introducirlos.
        </p>
      </Section>

      <Section title="4. Duración y destino de los datos">
        <p>
          El contrato dura lo que dure la prestación del servicio. Al terminar, el Responsable dispone de{' '}
          <b>30 días</b> para exportar sus datos (funciones de exportación CSV o solicitándolo por correo).
          Pasado ese plazo, el Encargado los elimina de forma definitiva en un máximo de <b>90 días</b> desde
          la baja, y lo confirma por escrito si se le pide, salvo que una norma obligue a conservarlos.
        </p>
        <p>
          Las facturas emitidas y sus registros de facturación son inalterables y el Responsable debe
          conservarlos por ley: es su responsabilidad exportarlos antes de la baja.
        </p>
      </Section>

      <Section title="5. Obligaciones del Encargado">
        <p>El Encargado se obliga a:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Tratar los datos <b>solo siguiendo las instrucciones documentadas</b> del Responsable (este contrato y el uso que haga de las funciones del servicio). Si considera que una instrucción infringe la normativa, se lo comunicará.</li>
          <li>No aplicar ni utilizar los datos con fin distinto del indicado, ni comunicarlos a terceros salvo a los subencargados autorizados o por obligación legal (en cuyo caso avisará al Responsable, si la ley lo permite).</li>
          <li>Garantizar que las personas con acceso a los datos están sujetas a un deber de <b>confidencialidad</b>, que subsiste tras terminar la relación.</li>
          <li>Aplicar las <b>medidas de seguridad</b> del apartado 7.</li>
          <li><b>Ayudar al Responsable</b> a atender las solicitudes de derechos de los interesados (acceso, rectificación, supresión, oposición, limitación y portabilidad): si un interesado se dirige al Encargado, este se lo trasladará al Responsable sin responder por su cuenta.</li>
          <li><b>Notificar al Responsable, sin dilación indebida y como máximo en 48 horas</b> desde que tenga constancia, cualquier violación de la seguridad de los datos, con la información de que disponga (naturaleza, datos afectados, consecuencias probables y medidas adoptadas), para que pueda cumplir sus propias obligaciones de notificación ante la autoridad y los interesados.</li>
          <li>Ayudar al Responsable en las evaluaciones de impacto y consultas previas que procedan (arts. 35 y 36 RGPD), en lo que le corresponda como proveedor.</li>
          <li>Poner a disposición del Responsable la <b>información necesaria para demostrar el cumplimiento</b> de este contrato y permitir auditorías razonables, con preaviso de al menos 30 días, en horario laboral, sin comprometer la seguridad ni los datos de otros clientes, y a cargo del Responsable.</li>
          <li>Llevar un registro de las actividades de tratamiento realizadas por cuenta del Responsable, cuando la ley lo exija.</li>
        </ul>
      </Section>

      <Section title="6. Subencargados">
        <p>
          El Responsable autoriza con carácter general la intervención de los siguientes subencargados, con
          los que el Encargado mantiene un contrato que les impone obligaciones equivalentes a las de este
          documento:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b>Supabase, Inc.</b> — base de datos, autenticación y almacenamiento (servidores en la Unión Europea, Frankfurt).</li>
          <li><b>Vercel Inc.</b> — alojamiento de la aplicación web.</li>
          <li><b>Resend</b> — envío de correos electrónicos.</li>
          <li><b>Sentry</b> — monitorización técnica de errores, configurada para no capturar datos personales identificativos por defecto.</li>
        </ul>
        <p>
          Si el Encargado quiere incorporar o sustituir un subencargado, avisará al Responsable con al menos{' '}
          <b>15 días</b> de antelación (por correo o dentro de la aplicación). El Responsable puede oponerse
          por motivos razonables de protección de datos en ese plazo; si no hay una alternativa viable, podrá
          darse de baja sin penalización. El Encargado responde ante el Responsable de los incumplimientos de
          sus subencargados.
        </p>
      </Section>

      <Section title="7. Medidas de seguridad">
        <p>Teniendo en cuenta el estado de la técnica y los riesgos, el Encargado aplica, como mínimo:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Comunicaciones cifradas (HTTPS/TLS) en toda la aplicación.</li>
          <li>Aislamiento de los datos de cada empresa mediante políticas de seguridad a nivel de fila en la base de datos, de modo que cada taller solo accede a los suyos.</li>
          <li>Control de acceso por roles dentro de cada empresa: solo el administrador gestiona usuarios, roles y la configuración de la empresa; los usuarios no pueden elevar sus propios permisos.</li>
          <li>Contraseñas gestionadas y almacenadas cifradas por el proveedor de autenticación, nunca en texto plano.</li>
          <li>Verificación en dos pasos opcional (aplicación autenticadora, TOTP) para cada usuario; cuando está activada, se exige también en la base de datos y en las funciones del servidor, no solo en la pantalla.</li>
          <li>Cifrado (AES-256) del certificado electrónico que el Responsable sube para el envío a la AEAT, con una clave guardada aparte de la base de datos.</li>
          <li>Limitación de intentos en las funciones sensibles y monitorización de errores técnicos.</li>
          <li>Acceso del Encargado a los datos del Responsable limitado a lo necesario para prestar soporte y mantener el servicio.</li>
        </ul>
        <p>
          El Responsable, por su parte, debe custodiar sus credenciales, activar la verificación en dos
          pasos de sus usuarios (especialmente los administradores), dar de alta solo a personal
          autorizado con el rol adecuado y darlo de baja cuando deje de serlo.
        </p>
      </Section>

      <Section title="8. Transferencias internacionales">
        <p>
          El Encargado no transferirá datos fuera del Espacio Económico Europeo salvo que sea necesario para
          prestar el servicio a través de un subencargado y siempre amparado en un mecanismo válido del RGPD
          (decisión de adecuación o Cláusulas Contractuales Tipo de la Comisión Europea).
        </p>
      </Section>

      <Section title="9. Obligaciones del Responsable">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Contar con una base legal para tratar los datos de sus clientes e informarles (art. 13 RGPD), incluido el uso del servicio como encargado y de los envíos de recordatorios.</li>
          <li>Introducir solo los datos necesarios, exactos y actualizados, y no introducir datos de categorías especiales.</li>
          <li>Atender los derechos de los interesados y notificar a la autoridad y a los afectados las violaciones de seguridad que lo requieran.</li>
          <li>Enviar comunicaciones comerciales solo a quien lo haya consentido cuando la ley lo exija; los recordatorios automáticos se activan bajo su responsabilidad.</li>
          <li>Responder de las instrucciones que da al Encargado mediante el uso del servicio.</li>
        </ul>
      </Section>

      <Section title="10. Responsabilidad y ley aplicable">
        <p>
          Cada parte responde frente a los interesados y las autoridades conforme al RGPD. Entre las partes,
          la responsabilidad del Encargado se rige por la limitación de los{' '}
          <a href="/terminos" className="text-blue-600 hover:underline">Términos de Uso</a> (sección 11), sin
          perjuicio de lo que la ley no permita limitar. Este contrato se rige por la legislación española.
        </p>
        <p>
          Si hay contradicción entre este documento y los Términos o la Política de Privacidad en materia de
          tratamiento de datos de los clientes del Responsable, prevalece este contrato.
        </p>
      </Section>

      <Section title="11. Contacto">
        <p><a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a></p>
      </Section>
    </>
  );
}

export default function LegalPage({ page }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-slate-950 py-4 px-4 sm:px-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white font-black text-sm tracking-tighter">D</span>
            </div>
            <span className="text-white font-bold text-sm tracking-tight">Doonty Motor</span>
          </a>
          <a href="/" className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex flex-wrap gap-2 mb-6">
          <a
            href="/privacidad"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${page === 'privacidad' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            Política de Privacidad
          </a>
          <a
            href="/terminos"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${page === 'terminos' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            Términos de Uso
          </a>
          <a
            href="/declaracion-responsable"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${page === 'declaracion-responsable' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            Declaración Responsable
          </a>
          <a
            href="/encargo-de-tratamiento"
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${page === 'encargo-de-tratamiento' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            Encargo de Tratamiento
          </a>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-9">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-1.5">
            {TITULOS[page]}
          </h1>
          <p className="text-xs text-slate-400 font-semibold mb-8">
            {page === 'declaracion-responsable'
              ? `${SISTEMA.nombre} · versión ${SISTEMA.version}`
              : `Última actualización: ${ULTIMA_ACTUALIZACION}`}
          </p>

          {page === 'privacidad' ? <Privacidad /> : page === 'terminos' ? <Terminos /> : page === 'encargo-de-tratamiento' ? <EncargoTratamiento /> : <DeclaracionResponsable />}
        </div>

        <p className="text-center text-xs text-slate-400 mt-8">
          © 2026 Doonty — Desarrollado por{' '}
          <a href="https://www.somosingenio.net" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 underline underline-offset-2 transition">
            InGenio
          </a>
        </p>
      </main>
    </div>
  );
}
