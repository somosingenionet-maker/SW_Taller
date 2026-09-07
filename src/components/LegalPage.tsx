import { ArrowLeft } from 'lucide-react';

interface LegalPageProps {
  page: 'privacidad' | 'terminos';
}

const CONTACTO = 'comercial@somosingenio.net';
const ULTIMA_ACTUALIZACION = '7 de septiembre de 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-base font-extrabold text-slate-900 mb-2.5">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Privacidad() {
  return (
    <>
      <Section title="1. Responsable del tratamiento">
        <p>
          <b>Oscar Daniel Sánchez Saenz</b> (marca comercial "InGenio"), con NIF <b>Y5483982Z</b> y
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
          datos e informarles conforme a la normativa. Te recomendamos formalizar con nosotros un
          contrato de encargado de tratamiento (art. 28 RGPD).
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
        <p>Seguridad, prevención de fraude y resolución de incidencias técnicas.</p>
      </Section>

      <Section title="5. Base legal">
        <p>Ejecución del contrato de prestación del servicio SaaS (art. 6.1.b RGPD).</p>
        <p>Cumplimiento de obligaciones legales, en particular fiscales (art. 6.1.c).</p>
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
          marca comercial "InGenio"), con domicilio en Calle Doctor Sapena 68, Elche (Alicante).
          Contacto: <a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a>.
        </p>
      </Section>

      <Section title="2. Objeto del servicio">
        <p>
          Doonty Motor es una plataforma de gestión para talleres mecánicos y de flotas: control de
          vehículos, órdenes de trabajo, CRM de clientes, facturación e inventario.
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
          tratamiento respecto a estos datos, tal como se describe en nuestra{' '}
          <a href="/privacidad" className="text-blue-600 hover:underline">Política de Privacidad</a>.
        </p>
      </Section>

      <Section title="7. Planes, precios y facturación">
        <p>
          Los precios y condiciones del plan contratado se comunican de forma individual. Nos
          reservamos el derecho a modificar los precios, avisando con antelación razonable antes de que
          surtan efecto en tu siguiente periodo de facturación.
        </p>
      </Section>

      <Section title="8. Disponibilidad del servicio">
        <p>
          Hacemos un esfuerzo razonable por mantener el servicio disponible, pero no garantizamos una
          disponibilidad del 100&nbsp;%. Puede haber interrupciones programadas (mantenimiento) o no
          programadas (incidencias de nuestros proveedores de infraestructura).
        </p>
      </Section>

      <Section title="9. Propiedad intelectual">
        <p>
          El software, la marca, el diseño y el código de Doonty Motor son propiedad de InGenio. El uso
          del servicio no transfiere ningún derecho de propiedad intelectual sobre la plataforma. Los
          datos que tú introduces (clientes, vehículos, facturas...) siguen siendo tuyos.
        </p>
      </Section>

      <Section title="10. Limitación de responsabilidad">
        <p>
          En la medida permitida por la ley, InGenio no será responsable de daños indirectos, lucro
          cesante o pérdida de datos derivados del uso del servicio, salvo en casos de dolo o
          negligencia grave. Te recomendamos exportar copias periódicas de tus datos (función CSV
          disponible en varios módulos).
        </p>
      </Section>

      <Section title="11. Duración y cancelación">
        <p>
          Puedes solicitar la baja del servicio en cualquier momento escribiendo a{' '}
          <a href={`mailto:${CONTACTO}`} className="text-blue-600 hover:underline">{CONTACTO}</a>. Tras
          la baja, tus datos se conservarán durante el plazo indicado en la Política de Privacidad y
          después se eliminarán, salvo obligación legal de conservarlos.
        </p>
      </Section>

      <Section title="12. Modificación de los términos">
        <p>
          Podemos actualizar estos términos para reflejar cambios legales o del servicio. Te avisaremos
          de cualquier cambio sustancial.
        </p>
      </Section>

      <Section title="13. Ley aplicable y jurisdicción">
        <p>
          Estos términos se rigen por la legislación española. Para cualquier controversia, las partes
          se someten a los juzgados y tribunales que correspondan conforme a la ley, sin perjuicio de
          los fueros que puedan corresponder a los consumidores.
        </p>
      </Section>

      <Section title="14. Contacto">
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
        <div className="flex gap-2 mb-6">
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
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-9">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-1.5">
            {page === 'privacidad' ? 'Política de Privacidad' : 'Términos y Condiciones de Uso'}
          </h1>
          <p className="text-xs text-slate-400 font-semibold mb-8">Última actualización: {ULTIMA_ACTUALIZACION}</p>

          {page === 'privacidad' ? <Privacidad /> : <Terminos />}
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
