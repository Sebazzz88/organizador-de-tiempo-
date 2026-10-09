# Seguridad de Agendita

Este documento describe cómo protege Agendita (APK para Android, versión 1.3 o más reciente) los datos de quien la usa, qué riesgos cubre y cuáles no. Sirve como guía para auditarla.

## Qué datos maneja

- Nombre de la persona (solo para saludar).
- Tareas, tareas fijas, notas de los días, fechas clave y ajustes.
- Avisos programados (título y hora de cada recordatorio).

No pide ubicación, cámara, micrófono, contactos, cuentas ni almacenamiento compartido. No hay servidor, cuentas de usuario, analítica ni publicidad. Los datos no salen del teléfono.

## Modelo de amenazas

| Amenaza | Cubierta | Cómo |
|---|---|---|
| Otra app del teléfono lee los archivos de Agendita | Sí | Sandbox de Android y cifrado en reposo |
| Copia de los archivos de la app (respaldo de Google, `adb backup`, transferencia entre teléfonos) | Sí | Copias desactivadas y datos cifrados con una llave que no sale del Keystore |
| Otra app envía órdenes falsas a la app (marcar tareas, disparar avisos) | Sí | Receptores no exportados y `PendingIntent` explícitos |
| Alguien mira la pantalla bloqueada | Sí | Avisos privados con versión pública genérica |
| Ataque en la red al buscar actualizaciones | Sí | Solo HTTPS, solo CAs del sistema, sin tráfico en claro |
| Inyección de código en la interfaz | Mitigada | CSP estricta, textos insertados escapados, entradas validadas y recortadas |
| Respaldo copiado y filtrado (chat, nube, notas) | Sí | Respaldo cifrado con contraseña (PBKDF2 + AES-256-GCM) |
| Teléfono con root o malware con privilegios de sistema | No | Fuera del alcance de una app (ver límites) |
| Alguien con el teléfono desbloqueado en la mano | No | Puede abrir la app y ver las tareas |

## Medidas

### 1. Cifrado en reposo

- Todo el estado de la app (tareas, notas, ajustes y avisos programados) se guarda cifrado con **AES-256-GCM** (`SecureStore.java`).
- La llave se genera en el **Android Keystore** (`AndroidKeyStore`), no es exportable y, si el teléfono tiene chip de seguridad (TEE o StrongBox), vive en él.
- Cada escritura usa un IV aleatorio de 12 bytes generado por el Keystore (`setRandomizedEncryptionRequired`) y una etiqueta de 128 bits.
- Cada valor lleva como dato asociado (AAD) su nombre (`agendita:state`, `agendita:schedule`), así que no se puede cambiar un valor cifrado por otro.
- Formato: `[versión=1][IV][texto cifrado + etiqueta]` en Base64, en `shared_prefs/agendita_boveda.xml`.
- Si un valor no se puede descifrar, la app no lo reemplaza en silencio con datos vacíos: avisa (`unreadable`).
- Los avisos programados con `AlarmManager` solo llevan un número. El título y el texto se leen del almacén cifrado en el momento de avisar.

### 2. Migración desde versiones anteriores

Hasta la 1.2, los datos se guardaban sin cifrar en `CapacitorStorage`, `localStorage` del WebView y la base de avisos del plugin de notificaciones. Al abrir la 1.3 por primera vez:

1. Lee los datos antiguos, los valida y los guarda cifrados.
2. Borra la clave antigua de `CapacitorStorage`, el `localStorage` y todo el almacenamiento web (`WebStorage.deleteAllData()`).
3. Cancela las alarmas del plugin anterior y borra sus archivos (`NOTIFICATION_STORE`, `ACTION_TYPE_STORE` y otros) y sus canales.

Verificado en un emulador Android 15: después de actualizar de 1.2 a 1.3, buscar el texto de una tarea en `/data/data/com.sebas.jardindetareas/` no encuentra nada.

### 3. Sin copias fuera del teléfono

- `android:allowBackup="false"`, `android:fullBackupContent="false"`.
- `data_extraction_rules.xml` excluye todo, tanto de la nube como de la transferencia entre dispositivos.
- La app no es depurable (`debuggable=false`): `run-as` y la depuración del WebView (`webContentsDebuggingEnabled: false`) están desactivados.

### 4. Componentes de Android

| Componente | Exportado | Notas |
|---|---|---|
| `MainActivity` | Sí (lanzador) | Solo acepta un día `AAAA-MM-DD` validado como extra |
| `AgenditaWidget` | Sí | Obligatorio para un widget; solo responde a `APPWIDGET_UPDATE` del sistema |
| `WidgetService` | No | Protegido con `BIND_REMOTEVIEWS` |
| `WidgetActionReceiver` | No | Además comprueba que el widget pertenezca a la app |
| `ReminderReceiver` | No | Solo lo alcanzan las alarmas de la propia app |
| `BootReceiver` | Sí | Solo actúa con acciones protegidas del sistema (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, `TIME_SET`, `TIMEZONE_CHANGED`) y solo reprograma avisos |

- Todos los `PendingIntent` son **explícitos** (nombran la clase de destino).
- Son `FLAG_IMMUTABLE`, salvo la plantilla de las filas del widget. Esa plantilla tiene que ser mutable para que el sistema agregue qué tarea se tocó, pero al ser explícita solo puede llegar a `WidgetActionReceiver`.
- Prueba hecha: un `am broadcast` desde `adb shell` sin root hacia `ReminderReceiver` y `WidgetActionReceiver` no tiene efecto. Con root, sí, como era de esperar.

### 5. Notificaciones

- Todos los canales usan `VISIBILITY_PRIVATE` y una versión pública genérica («Agendita · Tienes un recordatorio»).
- Con el teléfono bloqueado no se ve el nombre de la tarea, salvo que la persona lo permita en los ajustes de Android.

### 6. Red

- `network_security_config.xml` prohíbe el tráfico en claro y confía solo en las CAs del sistema (no en las instaladas por el usuario).
- La única conexión es a `https://raw.githubusercontent.com` para leer `version.json`, y solo cuando la persona toca **Buscar actualizaciones**.
- El enlace de descarga solo se acepta si empieza por la ruta del repositorio oficial. Los textos que vienen de `version.json` se recortan y se insertan como texto, nunca como HTML.

### 7. Interfaz web (WebView)

- Content Security Policy:

  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; font-src 'self'; connect-src 'self' https://raw.githubusercontent.com;
  object-src 'none'; base-uri 'none'; form-action 'none'
  ```

  Sin `unsafe-eval` ni scripts en línea.
- `Referrer-Policy: no-referrer`, `allowMixedContent: false`, registros de Capacitor desactivados (`loggingBehavior: "none"`).
- Todo texto de la persona se escapa antes de insertarse.
- `normalize()` valida y recorta los datos al cargar o restaurar:
  - IDs de 64 caracteres como máximo.
  - Hasta 3000 tareas, 300 fijas y 3000 notas.
  - Fechas y horas con formato estricto.
- El código nativo vuelve a validar:
  - JSON de 2 MB como máximo.
  - Hasta 450 avisos programados.
  - Fechas y horas con formato estricto.

### 8. Respaldos

- **Copiar mi respaldo** exige una contraseña de al menos 8 caracteres.
- El respaldo se cifra con **AES-256-GCM** y una llave derivada con **PBKDF2-HMAC-SHA256** (310 000 iteraciones, sal aleatoria de 16 bytes, IV aleatorio de 12 bytes).
- Formato: `AGENDITA-CIFRADO-1.` + Base64(`sal | IV | texto cifrado`). El prefijo también va como dato asociado.
- La contraseña no se guarda en ningún lado y el campo se vacía al terminar. Si se pierde, el respaldo no se puede abrir.
- Los respaldos antiguos sin cifrar (JSON) se pueden seguir restaurando para no perder datos de versiones anteriores.

### 9. Permisos

| Permiso | Para qué |
|---|---|
| `POST_NOTIFICATIONS` | Mostrar los avisos |
| `USE_EXACT_ALARM` / `SCHEDULE_EXACT_ALARM` (hasta Android 12L) | Avisar a la hora exacta |
| `RECEIVE_BOOT_COMPLETED` | Volver a programar los avisos al reiniciar |
| `VIBRATE` | Vibrar con los avisos urgentes |
| `INTERNET` | Buscar actualizaciones, solo cuando se toca el botón |

Se quitaron `WAKE_LOCK`, el `FileProvider` y los plugins `@capacitor/preferences` y `@capacitor/local-notifications`, que guardaban datos sin cifrar.

## Límites conocidos

- **Root o sistema comprometido:** con root, un atacante puede usar la llave del Keystore desde el proceso de la app o leer la memoria. Ninguna app puede evitarlo del todo.
- **El widget muestra tareas en la pantalla de inicio:** cualquiera que vea el teléfono desbloqueado puede leerlas. Si no lo quieres, no agregues el widget.
- **Teléfono desbloqueado:** la app no pide PIN ni huella para abrirse.
- **WebView muy antiguo (anterior a la versión 83):** Capacitor necesita inyectar un script en línea que la CSP bloquea, y la app podría no funcionar bien. Android System WebView se actualiza solo desde la Play Store.
- **Página web `agendita.html`:** es la versión web anterior y guarda los datos **sin cifrar** en el `localStorage` del navegador. No tiene estas medidas y queda fuera del alcance de este documento. Tampoco puede abrir los respaldos cifrados de la app.
- **APK fuera de la Play Store:** la autenticidad depende de descargarla del repositorio oficial. Android verifica que cada actualización esté firmada con la misma llave.
  - Huella SHA-256 del certificado: `5e:ec:44:84:f2:63:36:2b:82:82:d4:c0:cf:3b:ca:80:8d:9f:6b:c6:72:ee:fa:e4:22:15:09:cd:cd:ca:a6:4b`.
  - Se puede comprobar con `apksigner verify --print-certs Agendita.apk`.

## Cómo reportar un problema

Abre un *issue* en el repositorio o escríbele directamente a Sebastian. Si el problema expone datos, no publiques los detalles hasta que esté corregido.
