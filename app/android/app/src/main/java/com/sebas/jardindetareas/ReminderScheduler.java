package com.sebas.jardindetareas;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.List;

/**
 * Programa los avisos con AlarmManager. Cada alarma solo lleva un número: el texto vive cifrado
 * en la bóveda y se arma al momento de avisar. Si la tarea ya está hecha o se borró, no se avisa.
 */
final class ReminderScheduler {
    static final String ACTION_FIRE = "com.sebas.agendita.AVISO";
    static final String ACTION_DAILY = "com.sebas.agendita.DIARIO";
    static final String ACTION_TEST = "com.sebas.agendita.PRUEBA";
    private static final String SCHEDULE = "schedule";
    private static final String TEST = "prueba";
    private static final int MAX = 450;
    static final int ID_TARDE = 900101, ID_NOCHE = 900102, ID_LOGRO = 900103, ID_PRUEBA = 900104;

    private ReminderScheduler() {}

    // ---------- Avisos de tareas (los calcula la app) ----------

    static int setSchedule(Context c, String json) throws Exception {
        JSONArray in = new JSONArray(json);
        JSONArray clean = new JSONArray();
        for (int i = 0; i < in.length() && clean.length() < MAX; i++) {
            JSONObject e = in.optJSONObject(i);
            if (e == null) continue;
            int id = e.optInt("id", -1);
            long at = e.optLong("at", 0);
            if (id < 1 || id > 100000 || at <= 0) continue;
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("at", at);
            o.put("kind", cut(e.optString("kind"), 12));
            o.put("ch", cut(e.optString("ch"), 16));
            o.put("src", "fixed".equals(e.optString("src")) ? "fixed" : "task");
            o.put("tid", cut(e.optString("tid"), 64));
            o.put("ds", Agenda.isYmd(e.optString("ds")) ? e.optString("ds") : "");
            o.put("title", cut(e.optString("title"), 200));
            o.put("body", cut(e.optString("body"), 600));
            clean.put(o);
        }
        cancelScheduled(c);
        if (!SecureStore.put(c, SCHEDULE, clean.toString())) throw new IllegalStateException("No se pudo guardar");
        return armScheduled(c, clean);
    }

    private static int armScheduled(Context c, JSONArray list) {
        long now = System.currentTimeMillis();
        StringBuilder ids = new StringBuilder();
        int n = 0;
        for (int i = 0; i < list.length(); i++) {
            JSONObject e = list.optJSONObject(i);
            if (e == null || e.optLong("at") <= now) continue;
            int id = e.optInt("id");
            setAlarm(c, e.optLong("at"), fireIntent(c, id));
            if (n++ > 0) ids.append(',');
            ids.append(id);
        }
        prefs(c).edit().putString("ids", ids.toString()).apply();
        return n;
    }

    private static void cancelScheduled(Context c) {
        String ids = prefs(c).getString("ids", "");
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null || ids.isEmpty()) return;
        for (String s : ids.split(",")) {
            try {
                PendingIntent pi = fireIntent(c, Integer.parseInt(s));
                am.cancel(pi);
                pi.cancel();
            } catch (NumberFormatException ignored) { }
        }
    }

    static void fire(Context c, int id) {
        String raw = SecureStore.get(c, SCHEDULE);
        if (raw == null) return;
        try {
            JSONArray list = new JSONArray(raw);
            for (int i = 0; i < list.length(); i++) {
                JSONObject e = list.optJSONObject(i);
                if (e == null || e.optInt("id") != id) continue;
                if (System.currentTimeMillis() - e.optLong("at") > 3L * 3600_000L) return; // llegó muy tarde: ya no sirve
                String kind = e.optString("kind"), ds = e.optString("ds"), tid = e.optString("tid");
                JSONObject st = Agenda.load(c);
                if ("brief".equals(kind)) {
                    List<Agenda.Item> items = Agenda.itemsFor(st, Agenda.today());
                    int left = Agenda.pending(items);
                    String body = left == 0 ? "Hoy no tienes tareas pendientes. Día tranquilo para lo que quieras 🌿"
                            : "Hoy tienes " + left + (left == 1 ? " tarea pendiente." : " tareas pendientes.") + " Una a la vez 🌱";
                    Notifier.post(c, id, Notifier.CH_RESUMEN, e.optString("title"), body, Agenda.today());
                    return;
                }
                if (!tid.isEmpty() && !Agenda.isPending(st, e.optString("src"), tid, ds)) return; // ya hecha o borrada
                Notifier.post(c, id, Notifier.channelFor(e.optString("ch")), e.optString("title"), e.optString("body"), ds);
                return;
            }
        } catch (Exception ignored) { }
    }

    // ---------- Pendientes del día (tarde y noche) y cambio de día ----------

    static void scheduleDaily(Context c) {
        JSONObject st = Agenda.load(c);
        JSONObject settings = st.optJSONObject("settings");
        JSONObject pend = settings == null ? null : settings.optJSONObject("pend");
        boolean on = pend == null || pend.optBoolean("on", true);
        String tarde = pend != null && Agenda.isTime(pend.optString("afternoon")) ? pend.optString("afternoon") : "18:00";
        String noche = pend != null && Agenda.isTime(pend.optString("evening")) ? pend.optString("evening") : "21:30";
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        for (String w : new String[]{"tarde", "noche"}) am.cancel(dailyIntent(c, w));
        if (on) {
            setAlarm(c, next(tarde), dailyIntent(c, "tarde"));
            setAlarm(c, next(noche), dailyIntent(c, "noche"));
        }
        setAlarm(c, next("00:01"), dailyIntent(c, "medianoche"));
    }

    static void daily(Context c, String which) {
        if ("medianoche".equals(which)) {
            AgenditaWidget.refreshAll(c);
            scheduleDaily(c);
            return;
        }
        JSONObject st = Agenda.load(c);
        List<Agenda.Item> items = Agenda.itemsFor(st, Agenda.today());
        int left = Agenda.pending(items);
        String name = Agenda.name(st);
        if (!items.isEmpty() && left > 0) {
            if ("tarde".equals(which)) {
                StringBuilder body = new StringBuilder(Agenda.countMessage(c, "pendientes", Agenda.PENDING, Agenda.PENDING_ONE, left, name));
                int shown = 0;
                for (Agenda.Item it : items) {
                    if (it.done) continue;
                    body.append(shown == 0 ? "\n\n" : "\n").append("• ").append(it.title);
                    if (!it.time.isEmpty()) body.append(" · ").append(it.time);
                    if (++shown == 3) break;
                }
                Notifier.post(c, ID_TARDE, Notifier.CH_PENDIENTES, left == 1 ? "Tarea pendiente de hoy" : "Tareas pendientes de hoy", body.toString(), Agenda.today());
            } else {
                Notifier.post(c, ID_NOCHE, Notifier.CH_PENDIENTES, left == 1 ? "Te quedó una tarea pendiente" : "No completaste todas tus tareas",
                        Agenda.countMessage(c, "noche", Agenda.MISSED, Agenda.MISSED_ONE, left, name), Agenda.today());
            }
        }
        scheduleDaily(c);
    }

    /** Aviso de felicitación cuando se completan todas las tareas del día. */
    static void congratulate(Context c) {
        JSONObject st = Agenda.load(c);
        Notifier.post(c, ID_LOGRO, Notifier.CH_LOGROS, "¡Bien hecho!",
                Agenda.fill(Agenda.pick(c, "logros", Agenda.DONE), 0, Agenda.name(st)), Agenda.today());
    }

    // ---------- Aviso de prueba ----------

    static void scheduleTest(Context c, String title, String body, long at) throws Exception {
        JSONObject o = new JSONObject();
        o.put("title", cut(title, 200));
        o.put("body", cut(body, 600));
        SecureStore.put(c, TEST, o.toString());
        setAlarm(c, at, testIntent(c));
    }

    static void fireTest(Context c) {
        String raw = SecureStore.get(c, TEST);
        if (raw == null) return;
        try {
            JSONObject o = new JSONObject(raw);
            Notifier.post(c, ID_PRUEBA, Notifier.CH_PRUEBA, o.optString("title"), o.optString("body"), Agenda.today());
        } catch (Exception ignored) { }
        SecureStore.put(c, TEST, null);
    }

    // ---------- Después de reiniciar o actualizar ----------

    static void rescheduleAll(Context c) {
        String raw = SecureStore.get(c, SCHEDULE);
        if (raw != null) {
            try { armScheduled(c, new JSONArray(raw)); } catch (Exception ignored) { }
        }
        scheduleDaily(c);
        AgenditaWidget.refreshAll(c);
    }

    // ---------- Utilidades ----------

    private static void setAlarm(Context c, long at, PendingIntent pi) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    static boolean canExact(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        return Build.VERSION.SDK_INT < 31 || (am != null && am.canScheduleExactAlarms());
    }

    private static long next(String hm) {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm.substring(0, 2)));
        cal.set(Calendar.MINUTE, Integer.parseInt(hm.substring(3, 5)));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 1000) cal.add(Calendar.DAY_OF_YEAR, 1);
        return cal.getTimeInMillis();
    }

    private static PendingIntent fireIntent(Context c, int id) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION_FIRE).setData(Uri.parse("agendita://aviso/" + id)).putExtra("id", id);
        return PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent dailyIntent(Context c, String which) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION_DAILY).setData(Uri.parse("agendita://diario/" + which)).putExtra("cual", which);
        return PendingIntent.getBroadcast(c, 900000, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent testIntent(Context c) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION_TEST).setData(Uri.parse("agendita://prueba"));
        return PendingIntent.getBroadcast(c, ID_PRUEBA, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("agendita_alarmas", Context.MODE_PRIVATE);
    }

    private static String cut(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) : s;
    }
}
