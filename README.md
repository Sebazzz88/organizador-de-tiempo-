# Jardín de Tareas

Hecho con cariño por Sebas :)

Calendario de recordatorios con estilo tropical oscuro. Cada tarea va en una de tres categorías y cada una avisa a su ritmo:

- **Urgente · Hibisco**: varios avisos antes de la hora y, si quieres, insiste cada hora hasta que la marques.
- **Importante · Mango**: avisa con días de anticipación.
- **Leve · Laguna**: un solo aviso suave.

También tiene fechas clave (cumpleaños, aniversarios, pagos), un saludo cada mañana, horas de descanso sin avisos, ideas para organizarse, consejos para no agotarse y una plantita que crece con cada tarea hecha.

Hay dos versiones:

- **App para Android (APK)**, en la carpeta `apk/`. Es la recomendada: los avisos llegan aunque la app esté cerrada.
- **Página web**, el archivo `jardin-de-tareas.html`. Se abre en cualquier navegador.

## App para Android (APK)

### Qué trae

- **Avisos del teléfono**, aunque la app esté cerrada o el teléfono se haya reiniciado.
- **Anticipación a tu gusto**: por defecto te avisa 2 días antes y a la hora. Puedes elegir otros momentos para cada tipo de tarea, o una anticipación propia en cada tarea (horas, días o semanas).
- **Recordatorio después del evento**: si no marcas una tarea como hecha, te la recuerda las horas que elijas después (de 1 a 24). Puede repetirse hasta que la marques, durante un máximo de 24 horas. Este ajuste vale para todos los eventos, y puedes excluir las tareas fijas para que no sea molesto.
- **Tareas fijas**: lo que haces sí o sí cada día. Aparecen en todo el calendario. Al empezar, la app te pregunta si quieres fijar alguna y si quieres un aviso diario de cada una. Puedes agregarlas, apagar su aviso o eliminarlas desde la pestaña **Fijas**.
- **Notas en los días**: escribe una nota en cualquier día del calendario. Si es larga y no cabe en el cuadro del día, toca el papelito amarillo para leerla completa.
- **Fondo tropical** de hojas de palma y luciérnagas en toda la app.
- **Diseño oscuro** basado en el sistema de diseño del proyecto (paleta Forest Depths y Electric Sprout): barras en píldora flotante, botones en píldora verde, etiquetas Sprout, títulos grandes con una palabra en verde y tarjetas inclinadas con tus próximos avisos.
- **Resumen de la mañana** y **horas de descanso**, en las que solo suenan las urgentes y las tareas fijas.

### Cómo instalarla en el teléfono

1. En el teléfono, abre https://github.com/Sebazzz88/organizador-de-tiempo-/raw/main/apk/JardinDeTareas.apk y descarga el archivo. También puedes pasar el archivo `apk/JardinDeTareas.apk` por WhatsApp, por cable o por Drive.
2. Abre el archivo descargado. Android te pedirá permiso para **instalar apps de origen desconocido** desde tu navegador o tu app de archivos. Actívalo solo para esa app y vuelve atrás.
3. Toca **Instalar**. Si aparece un aviso de Play Protect, elige **Instalar de todas formas**. Sale porque la app no viene de la Play Store.
4. Abre **Jardín de Tareas**. La app te hace unas preguntas: tu nombre, si quieres avisos, si quieres fijar tareas y con cuánta anticipación te aviso.
5. Cuando pida permiso para **enviar notificaciones**, toca **Permitir**.

Funciona en Android 7 o superior, en cualquier marca de teléfono. No funciona en iPhone.

### Si no llegan los avisos

- En la app, ve a **Avisos** y revisa que diga que los avisos están activados. Toca **Enviar aviso de prueba**.
- Algunos teléfonos (Xiaomi, Samsung, Huawei, Oppo) cierran las apps para ahorrar batería. Ve a **Ajustes › Aplicaciones › Jardín de Tareas › Batería** y elige **Sin restricciones**.
- Abre la app al menos una vez cada dos semanas. Así deja programados los avisos de las semanas siguientes.

### Actualizar la app

Instala la nueva APK encima de la anterior. Tus tareas se conservan. Antes de actualizar, por si acaso, copia tu respaldo desde **Más › Tus datos**.

### Compilar la APK (para Sebas)

La APK se arma con [Capacitor](https://capacitorjs.com). El código de la app está en `app/www/` y el proyecto de Android en `app/android/`.

Necesitas Node.js, Java 21 y el Android SDK (plataforma 36). En esta computadora están en `C:\Users\sebas_k6g3i41\android-dev`.

```bash
cd app
npm install
npx cap sync android
cd android
# En Git Bash:
export JAVA_HOME="C:/Users/sebas_k6g3i41/android-dev/jdk/jdk-21.0.12.1+1"
export ANDROID_HOME="C:/Users/sebas_k6g3i41/android-dev/android-sdk"
./gradlew assembleRelease
```

La APK queda en `app/android/app/build/outputs/apk/release/app-release.apk`. Cópiala a `apk/JardinDeTareas.apk`.

**Muy importante:** la APK se firma con la llave de `app/firma/` (`jardin-release.jks` y `firma.properties`). Esa carpeta no se sube a GitHub. Guarda una copia en un lugar seguro. Sin esa llave no se puede instalar una actualización encima de la app; habría que desinstalarla y se perderían las tareas guardadas.

Antes de cada versión nueva, sube `versionCode` y `versionName` en `app/android/app/build.gradle`.

## Página web

No hace falta instalar programas ni crear una cuenta. Es un solo archivo que se abre en el navegador.

### En la computadora

1. Entra a https://github.com/Sebazzz88/organizador-de-tiempo-
2. Toca el botón verde **Code** y luego **Download ZIP**.
3. Busca el ZIP en tu carpeta de Descargas, haz clic derecho y elige **Extraer todo**.
4. Abre la carpeta y haz doble clic en `jardin-de-tareas.html`. Se abre en tu navegador.
5. Guárdalo en favoritos (Ctrl + D) para abrirlo rápido la próxima vez.

Si usas git, también puedes descargarlo con:

```
git clone https://github.com/Sebazzz88/organizador-de-tiempo-.git
```

**Importante:** ábrelo siempre con el mismo navegador y desde la misma carpeta. Tus tareas se guardan en ese navegador, así que si lo abres con otro navegador o lo mueves de carpeta, aparecerá vacío.

### En el celular, sin instalar la APK

Para usarlo en el celular, primero hay que publicarlo con GitHub Pages (solo se hace una vez):

1. En el repositorio, entra a **Settings** y luego a **Pages**.
2. En **Source**, elige **Deploy from a branch**. En **Branch**, elige `main` y la carpeta `/ (root)`. Toca **Save**.
3. Espera uno o dos minutos. La página queda en:
   https://sebazzz88.github.io/organizador-de-tiempo-/jardin-de-tareas.html

En cuentas gratuitas de GitHub, Pages solo funciona si el repositorio es público.

Después, en el celular:

- **Android (Chrome):** abre el enlace, toca el menú ⋮ y elige **Agregar a la pantalla principal**.
- **iPhone (Safari):** abre el enlace, toca el botón **Compartir** y elige **Agregar a inicio**.

Queda como un ícono más en tu pantalla. En el celular los avisos aparecen dentro de la página mientras está abierta. Los avisos del sistema funcionan mejor en la computadora.

Las tareas del celular y las de la computadora no se sincronizan solas. Para pasarlas de uno a otro, usa **Copiar mi respaldo** en un dispositivo y **Restaurar desde el texto** en el otro.

### Actualizar a una versión nueva

1. Antes de actualizar, abre la página y toca **Copiar mi respaldo** (sección **Tus datos**, al final). Guarda ese texto en tus notas.
2. Descarga el ZIP nuevo y reemplaza `jardin-de-tareas.html` en la misma carpeta.
3. Si tus tareas no aparecen, pega el respaldo y toca **Restaurar desde el texto**.

### Cómo se usa la página web

La primera vez que lo abras, te pide tu nombre y te ofrece un recorrido guiado de un minuto. Puedes repetirlo cuando quieras con el botón **¿Cómo se usa?**, abajo a la izquierda.

1. **Activa los avisos.** Toca **Activar avisos** y acepta el permiso del navegador.
2. **Anota una tarea.** Toca un día del calendario, escribe la tarea y toca su categoría. Para elegir la hora, repetirla o marcarla como fecha clave, usa **Nueva tarea**.
3. **Márcala al terminar.** Toca el circulito junto a la tarea. Tu plantita de la semana crece con cada una.
4. **Ajústalo a tu gusto.** En **Avisos**, elige cuándo te avisa cada categoría. En **Tus datos**, cambia tu nombre, la hora del saludo de la mañana y tus horas de descanso.

Para cambiar una tarea, toca su nombre. Para borrarla, toca **Borrar**. Si te equivocas, toca **Deshacer**.

Los avisos llegan mientras la página esté abierta, aunque esté minimizada. Una vez al mes, copia tu respaldo para no perder tus tareas.
