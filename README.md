# Travel Planner

Aplicacion de viajes con Next.js App Router, React, TypeScript estricto y Tailwind CSS.
Estado: Fases 4, 5, 6 y 7 completadas. Viajes, destinos, itinerario, reservas,
presupuesto y gastos persistidos en Supabase Cloud, con las cinco migraciones
aplicadas y ciclos completos verificados en navegador.
Fase 8 completada: sexta migracion aplicada y ciclo de archivos privados validado
en Cloud, con los limites de navegador/segunda cuenta registrados en su seccion.
Repositorio: https://github.com/santiagomoreta/TravelApp. Desarrollo local y autenticacion con Supabase;
dashboard y viajes conectados a datos reales del usuario, incluyendo busqueda de
lugares por nombre/direccion, sin pedir coordenadas al cliente.
Fase 9 completada: mapas responsive, busqueda de lugares y coordenadas de actividades
verificados en Cloud. Mejora 1 completada: origen/destino con sugerencias, ciudad
opcional del dispositivo y ruta en el mapa. Las nueve migraciones estan aplicadas;
no repetir ninguna ni ejecutar seed Cloud.

Mejora 2 completada: foto propia privada como portada al crear/editar un viaje,
con subida, recarga, edicion, reemplazo y retirada verificados en Cloud.

Mejora 3 completada: transporte con tres datos principales y secciones opcionales
desplegables. No necesita migracion nueva.

Reservas con busqueda predictiva: origen y destino del transporte ofrecen
sugerencias; el alojamiento usa «Buscar hotel o dirección» y guarda direccion y
coordenadas al seleccionar. Sin selector de destino vinculado ni textarea de
direccion; los vinculos y direcciones anteriores se conservan al editar.
Guardado, recarga y edicion verificados en Cloud con un viaje temporal eliminado
al terminar. Formularios revisados en escritorio y movil; 71 pruebas correctas.
No requiere migracion ni cambios de datos existentes.

Itinerario actualizado: alta directa por nombre de actividad, fecha y horas de
inicio/fin; ubicacion predictiva como en el formulario de viaje. La parada del
itinerario es opcional, sin crear destinos automaticamente. Pais y region dejan
de ser campos visibles; sus valores existentes se conservan al editar destinos.
El usuario confirmo aplicada la migracion
`supabase/migrations/202611170011_trip_activities.sql` en Supabase el 17/11/2026.
No repetirla ni ejecutar migraciones anteriores o seed Cloud.
Guardado sin parada, ubicacion predictiva, coordenadas, notas, fecha y horas
verificados en Cloud, incluida recarga y edicion con una prueba temporal.
70 pruebas, lint, tipos y build correctos en la implementacion; la comprobacion
Cloud posterior no modifica el codigo. Calendario visual aun no incluido.

El itinerario muestra por defecto «Desde» y «Hasta» con el inicio y fin del
viaje. El intervalo es inclusivo y las actividades aparecen agrupadas por fecha,
con filtro de destino compatible. «Nuevo destino» tambien usa busqueda predictiva
de ubicacion, con seleccion de coordenadas y aviso para busquedas no seleccionadas.
Verificados rango completo, un solo dia, extremos, recarga y guardado del destino
en Cloud; viaje temporal eliminado. 72 pruebas correctas. Sin nueva migracion.

Visor de documentos integrado: el icono del ojo abre PDF, JPEG y PNG dentro de
la app, con zoom, ajuste al ancho y cambio de pagina para PDF. Descargar sigue
siendo opcional. React-PDF 11.1 y PDF.js usan un worker local, sin enviar los
archivos a un visor externo. Acceso privado con URLs firmadas de 60 segundos,
validacion del propietario, viaje, estado y ruta del archivo. Sin nueva migracion.
PDF de dos paginas y PNG verificados en Cloud y movil; PDF tambien en escritorio.
Recuperacion tras fallo de red comprobada. Viaje temporal eliminado y datos propios conservados.
74 pruebas, lint, tipos y build correctos. La captura automatica del guardado de
descargas sigue limitada por el navegador de pruebas; no se afirma un nuevo E2E.

## Requisitos

- Node.js 24 LTS (version indicada en `.nvmrc`).
- npm 11.
- Git.

## Desarrollo local

```sh
npm install
npm run dev
```

Abrir http://127.0.0.1:3000. La aplicacion requiere las variables de Supabase
indicadas en `.env.example`, introducidas en `.env.local` (ignorado por Git).
Usar solo la clave publica publishable o anon, nunca service_role ni una clave secreta.
Las claves locales existentes no deben sobrescribirse.

## Configuracion de Auth

En Supabase, Authentication > URL Configuration:

- Site URL: `http://127.0.0.1:3000`.
- Redirect URLs: `http://127.0.0.1:3000/auth/callback` y
	`http://127.0.0.1:3000/auth/callback?next=/actualizar-contrasena`.
- Email habilitado y confirmacion del correo activada.

En desarrollo, SITE_URL usa por defecto `http://127.0.0.1:3000`. En produccion es
obligatorio definir SITE_URL con el origen HTTPS real y actualizar las URLs de
Supabase. No alternar entre localhost y 127.0.0.1: las cookies y el verificador
PKCE pertenecen al navegador y al host que iniciaron el flujo.

El registro envia un enlace al correo. Abrirlo en el mismo navegador donde se
realizo el registro. Si el servicio de correo integrado restringe destinatarios,
usar el correo de un miembro del proyecto o configurar SMTP para otros usuarios.

La recuperacion envia un enlace al callback, que establece la sesion y abre
`/actualizar-contrasena`. Un enlace invalido vuelve a `/acceso` con un aviso.

Hasta activar el esquema, el perfil guarda display_name en los metadatos de Auth.
Con `DATABASE_SCHEMA_READY=true`, lee y edita `profiles.display_name`; los metadatos
solo inicializan el perfil al registrar usuarios. Nunca se usan para autorizar roles.

### Acceso con Google (cuentas Gmail)

El boton `Continuar con Google` esta en acceso y registro. Usa Supabase OAuth
con PKCE y el mismo callback y sesion que el acceso por correo. Solo solicita
identidad, correo y perfil, no acceso a los mensajes de Gmail.

Configuracion necesaria en los servicios externos:

1. En Supabase, Authentication > Sign In / Providers > Google, copiar la URL
	de callback del proveedor: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. En Google Cloud > Google Auth Platform, configurar Branding y Audience.
	Para cuentas personales, elegir audiencia External; si esta en Testing,
	anadir tu cuenta Gmail a los usuarios de prueba. Configurar solo los scopes
	`openid`, `userinfo.email` y `userinfo.profile`.
3. En Clients, crear un cliente OAuth de tipo Web application. En Authorized
	redirect URIs, pegar la URL de Supabase del paso 1, no el callback local.
	Este flujo redirige por servidor; no usa Google One Tap ni necesita un
	Client ID publico en el navegador.
4. Copiar Client ID y Client Secret a los campos del proveedor Google en
	Supabase, habilitarlo y guardar. No desactivar la comprobacion del nonce.
	El secreto se introduce solo en Supabase: no guardarlo en `.env.local`,
	no usar variables `NEXT_PUBLIC_` para el secreto ni incluirlo en Git.
5. En Supabase > URL Configuration, mantener Site URL en
	`http://127.0.0.1:3000` y permitir `http://127.0.0.1:3000/auth/callback**`
	durante desarrollo para conservar tambien el destino `next`.
	En produccion, sustituirlo por los callbacks HTTPS expresamente permitidos.
6. Abrir `http://127.0.0.1:3000/acceso` en tu navegador y pulsar
	`Continuar con Google`. Tras autorizar, debe aparecer el dashboard o el
	destino privado solicitado. Comprobar perfil, recarga y cierre de sesion.

No confundir las dos redirecciones: Google vuelve a Supabase; Supabase vuelve
a `/auth/callback` en la aplicacion. No alternar entre localhost y 127.0.0.1.
Si Google no esta habilitado, el boton muestra un aviso sin salir de la pagina.
El nombre de Google se usa como nombre inicial; uno editado en el perfil tiene
prioridad. El logotipo del boton procede del recurso oficial de Google.

Las pruebas locales cubren destinos seguros, nombres de perfil, proveedor
deshabilitado y cancelacion. El inicio de sesion completo con Google queda
pendiente de configurar el proveedor y autorizar con una cuenta real.

## Base de datos: Fase 3

Modelo aprobado el 16/11/2026. Migraciones versionadas, por orden:

1. `supabase/migrations/202611160001_schema.sql`: diez tablas, dominios de
	validacion, FKs compuestas, indices y RLS inicialmente sin permisos.
2. `supabase/migrations/202611160002_security.sql`: perfiles y backfill de
	usuarios existentes, membresia owner automatica, fechas y zonas, campos
	inmutables, auditoria, permisos por columna y politicas de propietario.

Cada archivo es transaccional. No aplicar solo la primera migracion y activar
la aplicacion: las tablas quedan cerradas hasta completar la segunda. No se
recrean tablas existentes ni se borran datos para resolver conflictos.

### Pruebas locales sin servicios

```sh
npm test
```

El runner ejecuta las migraciones en PGlite (PostgreSQL 18.6) en memoria y cierra
la base al terminar. No usa `.env.local`, no abre puertos ni conecta con la nube.
Solo reproduce las interfaces SQL minimas de Auth y Storage; no arranca esos servicios.
Comprueba aislamiento con roles anon/authenticated, CRUD propio/ajeno, perfiles,
FKs, fechas, dinero decimal, documentos y borrados. Incluye la regresion de NaN.

`supabase/seed.sql` contiene cuentas ficticias `example.invalid` sin contrasena
de acceso. Solo para bases locales desechables: exige el ajuste SQL
`travel_planner.allow_test_seed = 'local-only'`, que configura el test.
No ejecutarlo en Supabase Cloud ni usar sus usuarios para probar el login real.

En la Fase 3 Docker no tenia motor disponible. Al validar la Fase 4,
`docker info` devuelve la version 29.9.2. Se mantiene la suite PGlite existente
para probar PostgreSQL y RLS sin instalar ni arrancar infraestructura adicional.
El servidor remoto usa PostgreSQL 17.12; quedan pendientes concurrencia
multi-conexion y una suite E2E guardada contra Cloud. El usuario
confirmo el acceso, cambio de nombre y persistencia tras recargar y volver a entrar.
Tambien confirmo que una segunda cuenta no puede consultar ni modificar datos
de la primera; esta ultima comprobacion es manual, no un test automatizado.

### Aplicacion a Supabase Cloud

El usuario confirmo PostgreSQL 17.12 y esquema public sin tablas antes de ejecutar
ambas migraciones, que finalizaron con `Success. No rows returned`.
La aplicacion tiene `DATABASE_SCHEMA_READY=true` y el servidor se ha reiniciado.
La API del proyecto devuelve 401 / 42501 sin sesion en las diez tablas.
Esto comprueba la denegacion anonima, no sustituye las pruebas autenticadas A/B.
No volver a ejecutar estas migraciones sobre las tablas ya creadas ni ejecutar
el seed en Cloud. Para futuros entornos nuevos, comprobar antes el proyecto,
disponer de copia de seguridad si contiene datos y consultar en el SQL Editor:

```sql
select current_database(), current_setting('server_version');
select tablename from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'trips', 'trip_members', 'destinations',
	 'itinerary_items', 'transports', 'accommodations', 'expenses',
	 'documents', 'audit_logs');
```

Se requiere PostgreSQL >= 15 por el `SET NULL` dirigido a columnas de las FKs
compuestas. Si ya hay tablas con esos nombres, detenerse y revisar el esquema;
no borrarlas. Tras confirmar destino y compatibilidad, ejecutar ambos archivos
de migracion en orden con una cuenta administradora del proyecto, nunca el seed.
Esta operacion se puede hacer desde el SQL Editor de Supabase sin compartir claves.

Solo despues de completar ambas migraciones, establecer en `.env.local`:

```dotenv
DATABASE_SCHEMA_READY=true
```

Reiniciar el servidor de desarrollo. Comprobar con una cuenta real que el perfil
se conserva al recargar y volver a entrar, y que no puede acceder a filas ajenas.
Mientras la variable este ausente o sea `false`, el perfil anterior sigue operativo.
No hay fallback silencioso a metadatos si la tabla falla con el interruptor activo.
La activacion de Google sigue aplazada y es independiente de estas migraciones.

Los tipos de las diez tablas estan en `src/lib/supabase/database.types.ts`,
mantenidos junto al SQL; no son una introspeccion del proyecto remoto. Los tipos
de lectura siguen la respuesta nativa de PostgREST, donde NUMERIC puede llegar
como `number`: la capa financiera selecciona `amount::text`, `budget::text`,
`exchange_rate::text` y `converted_amount::text`. Opera con cadenas decimales,
sumas/diferencias `BigInt` a seis decimales y conversiones generadas por SQL,
nunca con coma flotante. Los precios de reservas no generan gastos ni forman
parte del total gastado; solo se contabilizan filas de `expenses`.
Los metadatos por si solos no protegen archivos. La sexta migracion de Fase 8
crea el bucket privado y sus politicas; el usuario confirmo su aplicacion en Cloud.

### Resultado de validacion de Fase 3 (16/11/2026)

- `npm test`: codigo 0; 22 pruebas correctas (7 Auth y 15 PostgreSQL), sin omitidas.
- `npm run lint`, `npm run typecheck`, `npm run build`: codigo 0.
- Servidor existente `npm run dev`: `/acceso` devuelve 200; `/perfil` y `/viajes`
	sin sesion devuelven 307 hacia `/acceso`.
- Infraestructura: Node.js 24 disponible; Docker no disponible por motor detenido;
	alternativa PGlite 0.5.16/PostgreSQL 18.6 con esquema Auth minimo de pruebas.
- Migraciones Cloud: ejecutadas por el usuario; acceso anonimo rechazado en
	las diez tablas. Perfil SQL activado sin modificar credenciales existentes.
- Prueba manual con `DATABASE_SCHEMA_READY=true`: el usuario confirma acceso,
  cambio de nombre y persistencia al recargar, cerrar sesion y volver a entrar.
	El usuario tambien confirma el rechazo de consulta y modificacion de datos
	ajenos desde una segunda cuenta. No es una prueba E2E automatizada.
- Veredicto: Fase 3 completada con pruebas SQL locales, despliegue en Cloud,
	rechazo anonimo remoto y confirmacion manual de perfil y aislamiento.

## Probar la interfaz

- `/acceso`, `/registro` y `/recuperar-contrasena`: formularios publicos.
- `/perfil`: nombre editable, correo de consulta y cierre de sesion.
- `/actualizar-contrasena`: cambio de contrasena con sesion validada.
- Dashboard, viajes y perfil requieren una sesion real, comprobada en servidor.
- `/`: dashboard con proximo viaje, cuenta atras, resumen y tarjetas.
- `/viajes`: busqueda por nombre/destino y filtros de proximos, pasados,
	todos los no archivados y archivados.
- `/viajes/<uuid>`: detalle de un viaje propio y acciones de editar, archivar,
	restaurar y eliminar con confirmacion. Los identificadores ajenos no muestran datos.
- `Nuevo viaje`: formulario persistente con nombre, descripcion, fechas, estado,
	moneda y portada opcional. Los cambios se conservan al navegar y recargar.
- Los archivados quedan fuera del dashboard; se pueden restaurar sin perder datos.
	La eliminacion borra tambien el contenido asociado, segun las cascadas SQL.
	Los documentos requieren limpieza previa en Storage; si falla, el viaje se conserva.
- Destinos en Resumen: crear, editar, ordenar y eliminar con confirmacion.
	Itinerario: agenda por dia/destino y actividades con o sin horario, lugar y notas.
	El guardado en Cloud esta validado con la tercera migracion aplicada.
- Reservas: transportes y alojamientos con formularios, vinculos opcionales,
	cronologia y filtros por tipo/destino. Guardado en Cloud validado con la cuarta migracion.
- Presupuesto: importe opcional, gastos reales por categoria/destino, filtros,
	busqueda, totales exactos y conversion manual fechada. Guardado en Cloud validado
	con la quinta migracion. Monedas pendientes separadas y disponible parcial explicito.
- Documentos: PDF/JPEG/PNG de hasta 4 MiB, nombre/categoria, busqueda, descarga
	firmada y borrado confirmado. Sexta migracion aplicada y ciclo Cloud validado.
	No se muestran reservas ni gastos ficticios.
- Tema claro y oscuro: preferencia guardada en el navegador; inicialmente sigue
	el tema del sistema.
- Los estados de carga, error y pagina no encontrada tienen vistas propias.

La navegacion se adapta a escritorio y movil. Las fotografias de Cotopaxi y
Dolomitas son locales, con creditos y licencias accesibles en el pie de pagina.

## Comprobaciones

```sh
npm run lint
npm test
npm run typecheck
npm run build
```

`typecheck` genera primero los tipos de rutas de Next.js y comprueba TypeScript
sin emitir JavaScript. Para ejecutar el build de produccion: `npm start`.
`npm test` comprueba validacion de formularios, redirecciones y el esquema/RLS
con PostgreSQL embebido. Solo crea usuarios ficticios dentro de esa base efimera;
no crea cuentas remotas ni envia correos.

## Estructura y decisiones

- `src/app`: rutas, layout raiz, estados de pagina y estilos globales.
- `src/components/layout`: navegacion y contexto de los viajes cargados en servidor.
- `src/components/ui`: controles y estados reutilizables.
- `src/features/trips`: modelo/validacion, consultas, acciones autenticadas,
  formularios y vistas de viajes. Las utilidades de fechas originales se reutilizan;
  la coleccion ficticia no se usa en la interfaz.
- `src/features/auth`: acciones de servidor, validacion, formularios y perfil.
- `src/lib/supabase`: clientes separados para servidor y navegador.
- `supabase/migrations`: esquema y seguridad SQL versionados.
- `supabase/seed.sql`: fixtures protegidos para pruebas locales exclusivamente.
- `tests/database.test.ts`: validacion PostgreSQL y RLS, integrada en `npm test`.
- `tests/trips.test.ts`: validacion de viajes, campos protegidos y filtros del dashboard.
- `tests/content.test.ts`: validacion de destinos, actividades y horarios locales.
- `src/proxy.ts`: renovacion de cookies y filtro inicial de rutas privadas.
	Las paginas y operaciones privadas vuelven a verificar la identidad en servidor.
- `src/lib/i18n.ts`: idioma, locale y textos compartidos de navegacion y tema.
	La interfaz esta en espanol; las traducciones completas quedan para mas adelante.
- TypeScript sigue la configuracion de Next.js, con modo estricto y alias `@/*`.
- Tailwind CSS 4 utiliza su plugin PostCSS; no necesita un archivo de configuracion adicional.
- ESLint utiliza la configuracion plana y las reglas de Next.js y TypeScript.
- Proyecto directamente en `TravelProject`, con nombre de paquete `travel-planner`.
- Las carpetas de otros dominios se crearan cuando tengan contenido.
- Sin exportacion estatica: se mantienen disponibles las capacidades de servidor.
- Tablas propias definidas, probadas localmente y desplegadas en Cloud.
	Los viajes de la interfaz ya persisten en Supabase desde la Fase 4.
- No se configura remoto ni se crean commits automaticamente.

La Fase 1 se ha comprobado con lint, TypeScript, build y navegacion automatizada
en navegador: filtros, busqueda, detalle, tema persistente y formulario temporal.
Se revisaron capturas y desbordamientos a 320, 390, 768 y 1440 pixeles.
Estas comprobaciones de navegador se ejecutaron de forma puntual; todavia no
constituyen una suite E2E guardada en el repositorio.

En la Fase 2 se comprobaron conexion a Auth, validacion de registro en servidor,
redirecciones sin sesion, rechazo de cookies manipuladas y callback invalido.
Las pantallas publicas se revisaron entre 320 y 1440 pixeles.
El usuario confirmo acceso, edicion y persistencia del perfil al recargar y volver
a entrar tras cerrar sesion. Registro/confirmacion de correo y recuperacion de
contrasena siguen sin confirmacion explicita. El asistente no ha creado cuentas
remotas de prueba.

El alcance, modelo aprobado y limites de validacion estan en `PLAN.md`.
La Fase 3 esta cerrada con el alcance y las evidencias anteriores.
Las Fases 4, 5, 6 y 7 estan implementadas y validadas localmente y en Cloud.
La Fase 8 esta completada con el ciclo Cloud y los limites de validacion registrados.

## Validacion de Fase 4 (16/11/2026)

- `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`: codigo 0.
- Suite reproducible: 26 pruebas correctas, sin omitidas (7 Auth, 16 PostgreSQL,
	3 modelo/filtros de viajes). El ciclo SQL prueba crear, editar, archivar,
	restaurar y borrar; deniega lecturas y mutaciones ajenas y conserva exactamente
	el presupuesto existente. No usa Cloud ni lee credenciales.
- Playwright con sesion real facilitada por el usuario: crear y recargar,
	editar nombre/descripcion/fechas/estado/moneda/portada y recargar, archivar y
	recargar, restaurar, buscar, consultar futuros/pasados y borrar con confirmacion.
	El formulario rechaza fechas invertidas y nombres vacios sin perder campos.
- Capturas revisadas en movil (390 x 844) y escritorio (1440 x 960), sin
	desbordamiento horizontal y con las imagenes cargadas. El unico viaje creado
	para la prueba se elimino al terminar; la auditoria se conserva por diseno.
- Sin nuevas migraciones, cuentas, buckets ni seeds en Cloud. No se han leido
	contrasenas, tokens ni claves. Google sigue aplazado.
- Limites: los recorridos Playwright son ejecuciones puntuales, no una suite
	E2E guardada. No se repitieron con otra sesion Cloud en esta fase (aislamiento
	cubierto por SQL y confirmacion manual de Fase 3). No se probaron fallos de red
	ni concurrencia multi-conexion. Las pruebas SQL usan PGlite/PostgreSQL 18.6,
	con Auth SQL minimo, frente a PostgreSQL 17.12 en Cloud.

La base debe estar activada con `DATABASE_SCHEMA_READY=true` tambien para viajes;
si falta, las paginas privadas muestran un error en lugar de datos ficticios.
Crear/editar solo modifica los campos de viaje del formulario, nunca presupuesto,
gastos, propietario o pertenencias. Fechas y moneda deben ser compatibles con
el contenido existente; los triggers SQL rechazan los cambios incompatibles.

## Fase 5: Destinos E Itinerario

El usuario confirmo la ejecucion de
`supabase/migrations/202611160003_trip_content.sql` en SQL Editor con resultado
`Success. No rows returned`. Las tres primeras migraciones estan aplicadas en Cloud.
No volver a ejecutarlas, no ejecutar el seed y no cambiar las claves ni
`DATABASE_SCHEMA_READY=true`.

La migracion agrega tres funciones SECURITY INVOKER, ejecutables solo por
authenticated. Mantiene RLS, permisos de columna y tablas existentes. Bloquea
el viaje para asignar posiciones e intercambiar destinos en una transaccion.
Convierte horarios locales con PostgreSQL: rechaza horas inexistentes durante
el cambio de horario; las horas repetidas siguen la resolucion de PostgreSQL
(para Europe/Madrid, la hora estandar). No hay selector de la repeticion horaria.

Validacion local (16/11/2026): 30 pruebas correctas (7 Auth, 17 PostgreSQL,
3 viajes, 3 destinos/actividades); lint, tipos y build correctos. Incluye CRUD SQL,
orden atomico y limites, aislamiento propio/ajeno/anonimo, cambio horario y
conservacion exacta de importes al editar actividades. No usa Cloud ni lee claves.

Navegador con sesion real (16/11/2026): crear y recargar dos destinos, editar
nombre/region/descripcion conservando coordenadas, reordenar y recargar.
Crear actividades con y sin horario, editar y recargar, filtrar por destino/dia,
conservar notas y horarios Europe/Madrid. El servidor rechaza la hora inexistente
2027-03-28 02:30 sin perder titulo, categoria ni notas; corregirla permite guardar.
Borrado individual de actividad y borrado de destino con cascada verificados
tras recarga, conservando el otro destino. Viaje temporal eliminado al terminar;
lista a cero y auditoria conservada. No se crearon cuentas ni se leyeron claves.

Capturas con datos revisadas en escritorio y formulario movil, sin desbordamiento
a 390/1440 px; selectores y opciones a 16 px en movil. Las comprobaciones previas
cubrieron agenda vacia, limites diarios y rechazo de fechas fuera del viaje.
Fase 5 completada. Estos recorridos son puntuales, no una suite
E2E guardada. No se repitio el flujo con otra sesion Cloud ni se probo concurrencia
multi-conexion; aislamiento y conservacion monetaria siguen cubiertos por SQL local.

## Fase 6: Transportes Y Alojamientos

El usuario confirmo la ejecucion correcta de
`supabase/migrations/202611160004_bookings.sql` en Supabase. Las cuatro primeras migraciones
estan aplicadas y el ciclo de reservas se verifico con una sesion real.
No volver a ejecutarlas, no ejecutar el seed ni modificar claves o
`DATABASE_SCHEMA_READY=true`.

Agrega una funcion SECURITY INVOKER, `save_trip_booking`, ejecutable solo por
authenticated. Mantiene tablas, permisos de columna, RLS y auditoria existentes.
Comprueba propietario, bloquea el viaje, convierte horarios en PostgreSQL y evita
redondear importes con mas de seis decimales. No suma precios ni crea gastos.

- Transportes: tipo, lugares, vinculo opcional en cada extremo, horarios opcionales
	y sus zonas, compania, localizador, billete, precio/moneda y notas.
- Alojamientos: tipo, destino opcional, entrada/salida con al menos una noche,
	zona, direccion, coordenadas, contacto, web HTTPS, localizador, precio y notas.
- Cronologia por fecha local de salida/entrada, sin fecha al final. Filtros de
	tipo/destino; transporte coincide por cualquiera de sus extremos vinculados.
- Los transportes deben estar dentro del viaje en sus respectivas zonas; los
	alojamientos tambien dentro del destino vinculado. Horas inexistentes por DST
	rechazadas; horas repetidas resueltas por PostgreSQL, sin selector de repeticion.
- Editar y borrar con confirmacion. Borrar un destino conserva sus reservas y
	etiquetas, desvinculando solo las referencias; borrar el viaje elimina su contenido.

Validacion local (16/11/2026): `npm test` con 35 correctas, ninguna omitida
(7 Auth, 18 PostgreSQL, 3 viajes, 3 contenido y 4 reservas). Lint, tipos y build:
codigo 0. SQL prueba crear/leer/editar/borrar ambos tipos, importe maximo exacto,
multizona, DST, fechas incompatibles, referencias cruzadas, propietario/ajeno/anonimo,
desvinculacion y ausencia de gastos automaticos. Node 24.16.0 y Docker 29.9.2
disponibles; se conserva la suite PGlite 18.6 existente, no un Supabase local completo.

Navegador con sesion real (16/11/2026): alta y recarga de transporte multizona,
alojamiento y traslado sin fecha/precio. Edicion y lectura posterior de horarios,
lugares, compania, billete, localizadores, fechas, contacto, web, notas y precios.
Conserva exactamente `99999999999999.999999 EUR` tras guardar/recargar/editar;
el precio de alojamiento cambiado a `0.123456 GBP` tambien persiste sin redondeo.

Rechazo en servidor de llegada anterior al instante de salida, hora inexistente
por DST y alojamiento fuera de las fechas del destino; campos conservados y
correccion guardada. Filtros por tipo/destino y combinados, incluyendo origen del
transporte; orden local y sin fecha al final. Notas y coordenadas persistentes.
Borrar destino conserva reservas, etiquetas y precios desvinculados. Borrados
individuales de transporte y alojamiento confirmados tras recarga, sin afectar
otras reservas. Viaje temporal eliminado; Andorra intacto y auditoria conservada.

Capturas con datos a 390/1440 px sin desbordamiento, selector movil a 16 px.
Las comprobaciones previas cubrieron ambos formularios moviles y sus opciones
a 16 px. Fase 6 completada. La Fase 7 fue aprobada posteriormente.
Navegador puntual, sin suite E2E guardada, concurrencia multi-conexion ni nueva
prueba con segunda sesion Cloud. Aislamiento y ausencia de gastos automaticos
cubiertos por SQL local. No se han leido claves ni creado cuentas remotas.

## Fase 7: Presupuesto Y Gastos

El usuario confirmo la ejecucion correcta de
[supabase/migrations/202611160005_finance.sql](supabase/migrations/202611160005_finance.sql)
en Supabase. Las cinco migraciones estan aplicadas y el ciclo financiero se
verifico con una sesion real. No volver a ejecutarlas, no ejecutar el seed ni
modificar claves o `DATABASE_SCHEMA_READY=true`.

La migracion no crea tablas ni cambia RLS. Añade `save_trip_finance` como
SECURITY INVOKER, con permiso solo para authenticated y bloqueo del viaje propio.
Los importes y tasas se validan como texto antes de convertirlos a NUMERIC,
sin redondeo silencioso de entrada. La moneda base procede del viaje, no del
formulario; `converted_amount` sigue generado por PostgreSQL con seis decimales.
Un cambio concurrente de moneda invalida el formulario. Un trigger evita cambiar
la moneda de un presupuesto existente: primero hay que quitarlo y guardar;
las conversiones existentes tambien deben revisarse antes del cambio.

Presupuesto opcional en moneda del viaje, alta/edicion/borrado confirmado de
gastos, concepto, fecha (tambien compras previas al viaje), categoria, destino
opcional y notas. La conversion manual opcional conserva tasa y fecha; sin APIs
de divisas ni conversion automatica. Cambiar la moneda original limpia la tasa.
Totales y disponible usan solo gastos en moneda base o con conversion vigente;
las otras monedas quedan separadas y el saldo se etiqueta como parcial.
Distribucion contabilizada por categoria/destino y filtros por categoria,
destino (incluido sin vincular), moneda y busqueda por concepto.

### Validacion Local Y Navegador (16/11/2026)

- `npm test`: codigo 0; 40 pruebas correctas, 0 fallos/omitidas (7 Auth,
	19 PostgreSQL, 3 viajes, 3 contenido, 4 reservas y 4 gastos).
- `npm run lint`, `npm run typecheck`, `npm run build`: codigo 0.
- Node 24.16.0 y Docker 29.9.2 disponibles. Suite PGlite 18.6 existente con Auth
	minimo; no es Supabase completo ni una prueba de concurrencia multi-conexion.
- SQL aislado: presupuesto maximo exacto/edicion/borrado, ambos tipos de moneda,
	gasto crear/leer/editar/borrar, conversion `0.1 * 1.234565 = 0.123457`, exceso
	de precision/overflow rechazados, campos protegidos ignorados, destino ajeno
	rechazado, propiedad/anonimo, desvinculacion y cambios de moneda controlados.
- Modelo: sumas superiores al limite de una fila, `0.1 + 0.2` exacto, saldo
	negativo fraccionario, monedas separadas, instantaneas obsoletas excluidas y
	distribucion por categoria/destino. Monedas admitidas validadas contra Intl/ISO.
- Navegador Cloud real: presupuesto maximo y gasto maximo
	`99999999999999.999999` conservados exactamente tras guardar/recargar/reabrir.
	Edicion, retirada del presupuesto y presupuesto cero confirmados tras recarga.
- Cuatro gastos reales de prueba: alta/recarga y edicion de concepto, importe,
	moneda, fecha, categoria, notas, tasa y fecha del cambio. Conversion SQL
	`0.1 * 1.234565 = 0.123457`; tasa editada `0.900000000001` leida sin alteracion.
	`0.1 + 0.2` suma exactamente `0.3 EUR`; pendientes JPY separados, saldo parcial
	negativo y distribucion contabilizada por categoria/destino correctos.
- Servidor rechaza conversion que desborda el importe y formulario con moneda
	esperada alterada/obsoleta, conservando campos. Cambio de moneda bloqueado por
	presupuesto existente y, tras retirarlo, por conversion existente. Tras quitar
	ambos, el cambio EUR a GBP persiste y reagrupa correctamente las monedas pendientes.
- Diez combinaciones de filtros/busqueda, incluidos sin vincular y sin resultados,
	sin alterar los totales del viaje. Notas, orden por fecha editada y resumen
	financiero en ambas pestañas comprobados. Borrar destino conserva los cuatro
	gastos y la tasa/importe convertido exactos; distribucion pasa a sin vincular.
- Borrados individuales de gasto contabilizado y pendiente confirmados tras
	recarga, con totales y pendientes actualizados y otros gastos intactos.
	Capturas con datos de escritorio/movil revisadas; sin desbordamiento 390/1440,
	filas sin exceso de ancho y filtros moviles a 16 px. Formularios/opciones,
	precision excesiva y tasa cero ya comprobados antes de activar la migracion.
	Viaje temporal eliminado, Andorra intacto y auditoria conservada.
	No se han leido claves ni creado cuentas. No fueron necesarios cambios de codigo.

Fase 7 completada; Fase 8 aprobada posteriormente. Navegador
puntual, sin suite E2E guardada, nueva segunda sesion Cloud ni concurrencia
multi-conexion en esta fase. El aislamiento sigue cubierto por SQL local y la
confirmacion manual de segunda cuenta de Fase 3.

## Fase 8: Documentos Privados

El usuario confirmo la ejecucion exitosa de
[supabase/migrations/202611160006_documents.sql](supabase/migrations/202611160006_documents.sql)
en Supabase. Las seis migraciones estan aplicadas y el ciclo de archivos se ha
validado en Cloud. No repetir ninguna ni ejecutar el seed. No cambiar credenciales
ni `DATABASE_SCHEMA_READY=true`. Fase 8 completada con los limites siguientes;
Fase 9 fue completada posteriormente, incluida la activacion y validacion Cloud.

- Bucket `trip-documents` privado, PDF/JPEG/PNG, limite 4 MiB. Validacion del
	formato por contenido con `file-type`, no solo extension o MIME declarado.
	No es un antivirus ni un validador completo de PDF/imagen.
- Ruta generada `<user_id>/<trip_id>/<document_id>/document.ext`, sin usar el
	nombre original. Subida sin sobrescritura, reserva de metadatos y finalizacion
	verificada en SQL. Cada accion autentica y comprueba el viaje propio.
- Nombre/categoria editables, busqueda/filtro, tamano/tipo/fecha y estados de
	limpieza visibles. URL firmada de 60 segundos solo para descargar un documento
	listo, como adjunto; no se persiste ni se usa service_role o URL publica.
- Borrado ordenado y reintentable: marcar, retirar archivo y solo entonces borrar
	metadatos. Fallos mantienen un registro recuperable. Antes de borrar viajes,
	limpieza de hasta 20 documentos por intento; repetir si quedan pendientes.
	Las guardas SQL bloquean cascadas que dejarian archivos, incluso sin metadatos.
- Políticas restrictivas sobre este bucket limitan otras permisivas existentes;
	acceso propio por ruta/metadatos y estados, sin permiso de sobrescritura.
	La RPC con privilegios elevados comprueba explicitamente propietario e identidad;
	el cliente no puede insertar/borrar metadatos o alterar rutas/estados directamente.
- Falta de migracion: aviso de activacion pendiente y error explicito al guardar,
	sin romper las otras pestañas ni perder campos o archivo seleccionado.

Validacion local: 46 tests correctos, 0 fallos/omitidos; lint, tipos y build correctos.
Auditoria de produccion: 0 vulnerabilidades. Los 7 avisos moderados de desarrollo
preexistentes siguen fuera del alcance. Node 24.16.0 y Docker 29.9.2 disponibles.
SQL prueba estados, aislamiento propio/ajeno/anonimo con otra politica permisiva,
objetos ausentes/tamano incorrecto, reintentos y proteccion de borrados/subidas tardias.
Tests de contenido y orquestacion cubren archivo falso, limites y fallo de limpieza
antes/despues de retirar el objeto, conservando metadatos para reintentar.

Navegador con sesion real: PDF falso rechazado por servidor; envio de 4 MiB alcanza
el aviso de sexta migracion sin perder nombre/categoria/archivo. Tamano excesivo y
SVG rechazados; cinco pestañas operativas tras recarga. Capturas escritorio/movil
sin desbordamiento a 1440/390 px; entradas/selectores moviles a 16 px. Viaje temporal
eliminado; solo Andorra permanece intacto y auditoria conservada.

### Confirmacion Cloud (16/11/2026)

Subida y recarga de PDF valido generado, PNG/JPEG generados con canvas: tres
documentos listos. Edicion de nombre/categoria persistente tras recargar/reabrir;
siete combinaciones de busqueda/categoria, incluidas vacias, dan el resultado esperado.
Respuestas firmadas HTTP 200 con firmas de contenido correctas para los tres tipos;
PDF de 588 bytes y JPEG de 1926 bytes, cabeceras de adjunto y nombres correctos.
Sondas sin firma, URL publica y ruta privada sin credenciales: HTTP 400.
No equivale a comprobar acceso con otra cuenta autenticada.

Borrado individual del PNG persiste tras recarga, manteniendo PDF/JPEG. Borrado del
viaje con ambos documentos restantes completa las guardas de limpieza. Solo Andorra
permanece intacto; auditoria conservada. Los enlaces PDF/JPEG emitidos antes del
borrado devuelven HTTP 400 InvalidJWT por expiracion tras 66 segundos desde el
inicio del flujo. Un enlace PNG ya emitido siguio sirviendo contenido inmediatamente
tras borrarlo; no se garantiza revocacion inmediata, purga de cache o eliminacion
fisica inmediata de copias del proveedor. Una URL firmada es una credencial temporal.

Capturas con datos 1440/390 px sin desbordamiento. Buscador movil ajustado a 16 px,
verificado junto al selector. Tras ese unico ajuste CSS se repitieron 46 tests,
lint, tipos y build: codigo 0. Node/Docker disponibles como en la validacion local.

Limites: el navegador integrado no entrega el evento de descarga nativa y su
cliente HTTP falla con Storage.getCookies; respuestas/bytes se verificaron con
fetch en la pagina y cabeceras de red. El usuario confirmo el 16/11/2026 que guardar
el adjunto funciona correctamente en su navegador habitual. Es una confirmacion
manual, no una prueba E2E automatizada. Sin nueva segunda sesion Cloud, concurrencia
multi-conexion o suite E2E guardada. RLS de usuarios ajenos cubierto por SQL local,
no por una nueva prueba de dos cuentas en Storage real. No se han leido claves,
creado cuentas ni repetido migraciones/seed remotos.
La aplicacion sigue en http://127.0.0.1:3000.

## Fase 9: Mapas Y Movil

Pestaña Mapa en cada viaje: destinos, actividades y alojamientos con coordenadas
propias, filtros por tipo/destino/dia, listado de lugares no ubicados, seleccion
por marcador/listado/teclado, zoom y ajuste de vista. La linea discontinua representa
el orden de destinos, no una ruta por carretera. No hay geocodificacion automatica
ni coordenadas heredadas del destino. «Como llegar» abre Google Maps por clic
explicito y envia solo coordenadas, no notas o referencias de reservas.

MapLibre GL 6.18.0 se carga en cliente bajo demanda; el worker ESM se empaqueta
localmente mediante URL explicita para Turbopack. Base raster OpenStreetMap con
atribucion visible: el proveedor recibe IP y zona visualizada, no los datos de
los lugares. Sin precarga masiva ni mapas offline. Servicio comunitario sin SLA;
revisar proveedor/capacidad antes de publicar con trafico significativo y cumplir
https://operations.osmfoundation.org/policies/tiles/ . Fallos de teselas o WebGL
mantienen listado y enlaces disponibles; hay reintento de carga.

### Coordenadas De Actividades Activadas

El usuario confirmo la ejecucion de
[supabase/migrations/202611160007_activity_locations.sql](supabase/migrations/202611160007_activity_locations.sql).
Las siete migraciones estan aplicadas. No repetir ninguna ni ejecutar seed,
cambiar claves o modificar `DATABASE_SCHEMA_READY=true`.

Las columnas ya existian; esta migracion añade guardado atomico y autenticado
de actividad y coordenadas, conservando el resto de campos y las politicas RLS.
Crear, recargar, editar y quitar la ubicacion de actividades ya esta verificado
en Cloud, incluido su marcador y el enlace de indicaciones.

### Validacion Y Movil

55 tests correctos, 0 fallos/omitidos; lint, tipos y build correctos, auditoria
de produccion sin vulnerabilidades. SQL desechable verifica atomicidad, acceso
propio/ajeno/anonimo y preservacion financiera. No es Supabase completo ni una
prueba multi-conexion. Los 7 avisos moderados de desarrollo previos se mantienen.

Navegador autenticado: destinos/alojamiento guardados y recargados, diez filtros
combinados, seleccion, teclado con foco conservado, zoom/desplazamiento, ajuste y
enlaces. Bloqueo de teselas y ausencia simulada de WebGL conservan alternativas;
reintento recupera el mapa. Capturas y pixeles del canvas WebGL verificados a
1440/390 px, incluidos build de produccion y controles separados de marcadores.
Sin desbordamiento, campos moviles de 16 px. Viajes temporales eliminados; Andorra
y el nuevo Budapest permanecen intactos. Servidor de produccion detenido; desarrollo en puerto 3000.
Pruebas de navegador ad hoc, sin suite E2E guardada ni nueva segunda sesion Cloud.
Coordenadas de actividades verificadas en Cloud; Fase 9 completada con estos limites.

Capacitor evaluado y aplazado: SSR, cookies, Proxy y Server Actions impiden exportar
esta app directamente como archivos estaticos empaquetables. La configuracion
oficial reserva `server.url` para live-reload, no produccion:
https://capacitorjs.com/docs/config . Una app nativa necesita cliente empaquetable,
backend HTTPS, Auth/deep links, archivos/descargas y pruebas iOS/Android. No se han
instalado SDKs ni implementado app nativa, offline o despliegue. Detalle en [PLAN.md](PLAN.md).

### Buscar Ubicaciones Sin Coordenadas

Ampliacion autorizada por el usuario: en Añadir/Editar destino, actividad o
alojamiento aparece «Buscar ubicacion». Escribir nombre o direccion, pulsar
Buscar y elegir un resultado. Si el nombre del registro estaba vacio se completa;
uno escrito por el cliente nunca se sobrescribe. Las coordenadas quedan internas.
El mapa permite elegir un punto, arrastrar el marcador o «Usar centro del mapa»
con teclado. «Quitar ubicacion» limpia el punto al guardar; editar conserva la
ubicacion previa sin volver a buscar. No se envian consultas mientras se escribe.

Proveedor inicial: Photon sobre OpenStreetMap, con atribucion visible y sin claves
nuevas. Solo la consulta escrita se envia desde el servidor, nunca notas,
reservas, documentos o datos de la cuenta. El proveedor ve la consulta y la IP
del servidor; las teselas del mapa siguen solicitandose desde el navegador.
Consultas/resultados se guardan en memoria hasta 15 minutos, maximo 100 entradas,
sin persistir consultas en BD ni escribirlas en logs propios.

La accion verifica sesion. Solo admite 3-160 caracteres, devuelve hasta 5 resultados
validados y redondea a 6 decimales; timeout 6 s, sin seguir redirecciones. Cache y
limite de una peticion cada 1,2 s por proceso, sin peticiones simultaneas. No es un
limite distribuido entre replicas. El endpoint opcional `GEOCODING_URL`, documentado
en [.env.example](.env.example), debe ser HTTPS y compatible con Photon; no lo elige el cliente.

El servidor demo permite uso moderado, puede limitarlo o retirarlo sin aviso y
no ofrece SLA: https://github.com/komoot/photon#demo-server . Antes de desplegar
para trafico significativo, contratar proveedor compatible o usar instancia
propia y cuota distribuida. No se utiliza la API publica de Nominatim.

Validacion: 55 tests, lint/tipos/build y auditoria de produccion correctos.
Busqueda real «Barcelona» en desarrollo y produccion; escritura sin peticiones,
seleccion, ajuste por clic/arrastre/centro, nombre respetado, guardado/recarga,
retirada persistente y recuperacion de fallo HTTP sin perder ubicacion. Selectores
y canvas no vacio revisados a 1440/390 px. Viaje de prueba eliminado; datos personales
intactos. Antes de activar la migracion 7 se verifico el aviso con nombre/punto
conservados y guardado sin coordenadas. Tras activarla se completo el ciclo Cloud
de actividad ubicada descrito a continuacion. No hay migraciones nuevas para el buscador.

### Confirmacion Cloud De Actividades (16/11/2026)

Con la sesion real: actividad con ubicacion buscada de Sagrada Familia guardada
y recargada; punto y notas persistidos. Marcador seleccionado desde mapa/listado
y enlace «Como llegar» con las coordenadas exactas. Cambio a Casa Batllo y nuevo
titulo persistidos, notas conservadas y marcador/enlace actualizados. Filtros
tipo/dia y capturas movil/escritorio correctos; canvas con imagen real.

Quitar ubicacion, guardar y recargar limpia ambas coordenadas sin borrar la
actividad o las notas; sin marcador ni enlace residual, lugar listado como no ubicado.
Viaje temporal eliminado mediante confirmacion y guardas de ruta/nombre; Andorra y
Budapest conservados. Sin cambios de codigo: siguen vigentes las 55 pruebas,
lint/tipos/build y auditoria de produccion superados. No se repitieron migraciones
o seed, ni se tocaron claves, cuentas, commits o remotos. Pruebas de navegador ad hoc,
sin nueva segunda cuenta Cloud o concurrencia multi-conexion. Fase 9 completada.

## Origen Y Destino Del Viaje

Mejora 1 completada el 17/11/2026. Al crear un viaje se seleccionan origen y destino
entre sugerencias por nombre/direccion. Busqueda desde 3 caracteres tras 1,5 s de
pausa, con region/pais para distinguir lugares homonimos y seleccion con teclado
o tactil. Cambiar el texto exige elegir otra sugerencia; no se guardan puntos antiguos.
Los viajes existentes sin ruta siguen funcionando y pueden completarla al editar.

La ubicacion del dispositivo se solicita solo al abrir un viaje nuevo o pulsar
«Usar mi ubicacion». Si se acepta, se consulta la ciudad y se propone como origen;
puede cambiarse manualmente. Denegacion o error dejan ambos campos disponibles.
El formulario se desmonta al cerrar y una respuesta tardia no pisa el origen escrito.

**GPS requiere contexto seguro.** En el movil, `http://192.168.0.20:3000` permite
probar la app y el origen manual, pero no la ubicacion automatica. Para GPS se
necesita HTTPS con certificado confiable. No se han instalado certificados ni tuneles.
En el ordenador, los navegadores consideran el loopback un contexto confiable.

Con permiso, solo se envia a Photon una posicion aproximada, redondeada a 3 decimales
en el navegador y servidor. Consulta autenticada a `/reverse`, capa ciudad; se guarda
el punto de ciudad devuelto, no el GPS del dispositivo. No se cachean posiciones.
Busqueda y consulta inversa comparten la cuota por proceso; siguen los limites del
proveedor demo. No se envian cuenta, notas, documentos ni reservas ni se añaden claves.

Mapa con origen O y llegada D, nombres y filtros; linea **esquematica**, no ruta por
carretera ni estimacion de tiempo/distancia. «Ver ruta en Google Maps» abre ambos
puntos en una pestaña externa. El mapa se reencuadra al cambiar el tamaño de pantalla.
La ruta es independiente de las paradas del itinerario; no crea reservas o paradas
ficticias. La llegada tambien aparece en cabecera/tarjeta y se puede buscar por ambos lugares.

El usuario confirmo aplicada
[supabase/migrations/202611170008_trip_routes.sql](supabase/migrations/202611170008_trip_routes.sql).
Las **ocho migraciones estan aplicadas**: no repetir ninguna ni ejecutar seed Cloud.
Guardado atomico de ambos puntos en `trips.route`, validacion SQL, RLS y auditoria
existentes; no cambiar claves ni `DATABASE_SCHEMA_READY=true`.

Validacion final: **59 tests correctos**, 0 fallos/omitidos; lint, tipos y build
correctos. SQL desechable cubre validacion, atomicidad, preservacion financiera y
propietario/ajeno/anonimo; no es Supabase completo ni una prueba multi-conexion.
Cloud real: crear Barcelona-Madrid, recargar, editar a València y recargar conserva
ruta, pais/region y descripcion. Marcadores/filtros/enlaces y pixeles del trazado
verificados; capturas movil/escritorio y cambio de tamaño sin puntos ocultos.
Tambien comprobado el build de produccion; servidor temporal 3001 detenido.

Permisos/posicion/contexto simulados en navegador, con consulta Photon real sobre
una posicion publica de prueba: aceptacion, denegacion, HTTP inseguro, respuesta
tardia y una unica solicitud al abrir en produccion. No GPS fisico iOS/Android,
nueva segunda cuenta Cloud ni suite E2E guardada. Solo se borro el viaje temporal;
Andorra existente conservado. Desarrollo Wi-Fi sigue en puerto 3000. Sin secretos,
cuentas, migraciones repetidas, seeds Cloud, commits, remotos o despliegue.

## Foto Propia Como Portada

Mejora 2 completada el 17/11/2026. Crear/editar viaje incluye «Foto propia» junto
a las portadas existentes, seleccion de JPEG/PNG de hasta 4 MiB y vista previa
local. Se puede reemplazar o quitar; al guardar otros campos sin seleccionar
otra foto se conserva la imagen actual. La portada aparece en tarjetas, resumen
y cabecera del viaje mediante el componente compartido.

Archivos en bucket **privado** `trip-covers`, con nombres aleatorios bajo
propietario/viaje; no se usa el nombre original ni se admiten URLs libres desde
el formulario. Verificacion de tipo por contenido en servidor, no solo extension
o MIME declarado; no es analisis antimalware ni decodificacion completa de imagen.
Lectura mediante ruta autenticada del propietario y foto actualmente asignada,
con `private, no-store`; no se publica el bucket, no hay enlaces firmados ni cache
compartida del optimizador de imagenes. No se eliminan metadatos EXIF del archivo.

Se sube antes de guardar el viaje. Si falla la subida no se mutan los campos;
si falla el guardado se intenta retirar la foto nueva solo tras comprobar que
no esta referenciada. Reemplazar/quitar retira la anterior despues del guardado,
con limpieza de mejor esfuerzo. Eliminar un viaje limpia su carpeta de portadas,
incluidos restos de intentos anteriores; un fallo de Storage conserva el viaje
para reintentar. Storage y SQL no forman una transaccion distribuida.

### Activacion Confirmada

El usuario confirmo la ejecucion satisfactoria de
[supabase/migrations/202611170009_trip_covers.sql](supabase/migrations/202611170009_trip_covers.sql)
en Supabase. Las **nueve migraciones estan aplicadas**: no repetir ninguna ni ejecutar
seed Cloud; no cambiar claves ni `DATABASE_SCHEMA_READY=true`.

Validacion final: **64 tests correctos**, 0 fallos/omitidos; lint, tipos y build
correctos. PostgreSQL desechable prueba rutas, propietario/ajeno/anonimo y politicas
restrictivas aun con una politica permisiva simulada. Pruebas de archivos cubren
formatos, limites, rutas y limpieza reintentable. No Supabase completo ni concurrencia
multi-conexion. Sin dependencias nuevas.

Navegador en desarrollo con Cloud real: viaje temporal con JPEG subido y recargado;
bytes descargados identicos al original y respuesta anonima 404, `private, no-store`.
Editar descripcion sin seleccionar archivo conserva la misma foto tras recarga.
Se corrigio el input multipart vacio: se omite en cliente y se descarta en servidor
por tamaño cero, independientemente del nombre; prueba de regresion incluida.
Reemplazar por otro JPEG conserva descripcion y cambia foto; URL anterior 404.
Quitar y recargar muestra el estado sin portada; nueva subida PNG 640x400 servida
como `image/png`, dimensiones correctas despues de recargar. Tarjeta/cabecera y
capturas escritorio/movil sin desbordamiento. Se mantienen las comprobaciones
previas de SVG, MIME falsificado, nombre largo y ausencia de migracion sin perder datos.

Solo se elimino el viaje temporal mediante guardas de ruta/nombre y confirmacion,
con foto activa y limpieza sin error; URL de foto 404 despues. Andorra y Budapest
existentes conservados. No inspeccion administrativa independiente de objetos Storage,
prueba fisica del selector iOS/Android, nueva segunda cuenta Cloud, suite E2E guardada,
cuentas, secretos, commits, remotos o despliegue. Desarrollo Wi-Fi en puerto 3000
conservado; sin servidor de produccion adicional.

## Transporte Sencillo

Al añadir un transporte solo se muestran **Medio de transporte, Origen y Destino**.
Se puede guardar sin fechas, precio o datos de reserva. Los demas campos estan en
«Fechas y horarios», «Reserva y precio» y «Mas opciones», cerrados al crear.
Al editar un transporte con horarios, su seccion de fechas aparece abierta.

Las antiguas vinculaciones no son obligatorias: ahora se llaman «Parada de salida
en el itinerario» y «Parada de llegada en el itinerario», dentro de Mas opciones.
Solo se muestran si el viaje tiene paradas. No se crean ni vinculan paradas
automaticamente por escribir un lugar. Las zonas horarias guardadas se conservan;
en transportes nuevos se usa la del dispositivo salvo ajuste manual o seleccion
de una parada con zona. No se infiere la zona desde el texto libre del lugar.

Cerrar una seccion no borra sus datos ni los excluye del guardado. Un error de
validacion abre la seccion correspondiente y enfoca el campo al terminar el envio.
Desplegables nativos accesibles con teclado, sin modificar el formulario de alojamiento.

Validado el 17/11/2026: 64 tests, lint, tipos y build correctos. Navegador con Cloud:
crear transporte minimo y recargar; editar y guardar todos los datos opcionales
con secciones cerradas; recargar conserva horarios/zonas, notas, reserva y precio
exacto 123.456789 EUR. Error de precio abre y enfoca el campo. Capturas 390/1440 px,
formulario inicial movil completo sin scroll, teclado y comprobacion de alojamiento.
Solo se elimino el viaje temporal de prueba y su transporte; Andorra existente
conservado. Sin nueva migracion, dependencias, cuentas, secretos, commits o despliegue.
Prueba de navegador ad hoc, sin selector nativo fisico iOS/Android ni suite E2E guardada.