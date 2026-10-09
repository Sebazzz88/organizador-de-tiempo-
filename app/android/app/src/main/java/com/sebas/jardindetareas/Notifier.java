package com.sebas.jardindetareas;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Canales y publicación de notificaciones. El contenido queda oculto en la pantalla bloqueada. */
final class Notifier {
    static final String EXTRA_DS = "agendita_dia";
    static final String CH_URGENTE = "ag_urgente", CH_IMPORTANTE = "ag_importante", CH_LEVE = "ag_leve",
            CH_FIJAS = "ag_fijas", CH_INSISTIR = "ag_insistir", CH_RESUMEN = "ag_resumen",
            CH_PENDIENTES = "ag_pendientes", CH_LOGROS = "ag_logros", CH_PRUEBA = "ag_prueba";
    private static final String[] OLD_CHANNELS = {"urgente", "importante", "leve", "fijas", "insistir", "resumen", "prueba", "default"};

    private Notifier() {}

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        make(nm, CH_URGENTE, "Tareas urgentes", "Recordatorios de tareas urgentes", NotificationManager.IMPORTANCE_HIGH);
        make(nm, CH_IMPORTANTE, "Tareas importantes", "Recordatorios de tareas importantes", NotificationManager.IMPORTANCE_DEFAULT);
        make(nm, CH_LEVE, "Tareas leves", "Recordatorios suaves de tareas leves", NotificationManager.IMPORTANCE_LOW);
        make(nm, CH_FIJAS, "Tareas fijas", "Aviso de tus tareas fijas en los días que te tocan", NotificationManager.IMPORTANCE_DEFAULT);
        make(nm, CH_INSISTIR, "Después del evento", "Te recuerda las tareas que aún no marcas como hechas", NotificationManager.IMPORTANCE_DEFAULT);
        make(nm, CH_RESUMEN, "Resumen de la mañana", "Saludo con las tareas del día", NotificationManager.IMPORTANCE_LOW);
        make(nm, CH_PENDIENTES, "Pendientes del día", "Te recuerda lo que falta por hacer hoy", NotificationManager.IMPORTANCE_DEFAULT);
        make(nm, CH_LOGROS, "Felicitaciones", "Mensajes cuando completas todas tus tareas", NotificationManager.IMPORTANCE_DEFAULT);
        make(nm, CH_PRUEBA, "Avisos de prueba", "El aviso que envías desde la app para probar", NotificationManager.IMPORTANCE_HIGH);
    }

    /** Borra los canales de la versión anterior, que mostraban el contenido en la pantalla bloqueada. */
    static void deleteOldChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        for (String id : OLD_CHANNELS) {
            try { nm.deleteNotificationChannel(id); } catch (Exception ignored) { }
        }
    }

    private static void make(NotificationManager nm, String id, String name, String desc, int importance) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(desc);
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
        ch.enableVibration(importance >= NotificationManager.IMPORTANCE_DEFAULT);
        nm.createNotificationChannel(ch);
    }

    static String channelFor(String ch) {
        if (ch == null) return CH_IMPORTANTE;
        switch (ch) {
            case "urgente": return CH_URGENTE;
            case "leve": return CH_LEVE;
            case "fijas": return CH_FIJAS;
            case "insistir": return CH_INSISTIR;
            case "resumen": return CH_RESUMEN;
            case "prueba": return CH_PRUEBA;
            default: return CH_IMPORTANTE;
        }
    }

    static boolean enabled(Context c) {
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    static void post(Context c, int id, String channel, String title, String body, String ds) {
        if (!enabled(c)) return;
        ensureChannels(c);
        Intent open = new Intent(c, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (Agenda.isYmd(ds)) open.putExtra(EXTRA_DS, ds);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        // Versión pública: es lo único que se ve con el teléfono bloqueado.
        android.app.Notification publicVersion = new NotificationCompat.Builder(c, channel)
                .setSmallIcon(R.drawable.ic_stat_agendita)
                .setColor(0xFFB54134)
                .setContentTitle("Agendita")
                .setContentText("Tienes un recordatorio")
                .build();
        android.app.Notification n = new NotificationCompat.Builder(c, channel)
                .setSmallIcon(R.drawable.ic_stat_agendita)
                .setColor(0xFFB54134)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        try {
            NotificationManagerCompat.from(c).notify(id, n);
        } catch (SecurityException ignored) {
            // Sin permiso de notificaciones: no se muestra nada.
        }
    }
}
