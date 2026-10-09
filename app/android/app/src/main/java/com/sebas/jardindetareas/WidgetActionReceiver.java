package com.sebas.jardindetareas;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

import java.util.List;

/**
 * Toques del widget: marcar tareas, pausar, seguir y pasar de página.
 * No está expuesto: solo lo alcanzan los PendingIntent del propio widget. Aun así valida todo lo que recibe.
 */
public class WidgetActionReceiver extends BroadcastReceiver {
    private static final long RESUME_AFTER = 15_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !AgenditaWidget.ACTION.equals(intent.getAction())) return;
        final Context c = context.getApplicationContext();
        final int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        int[] mine = AgenditaWidget.ids(c);
        boolean known = false;
        for (int w : mine) if (w == id) known = true;
        if (!known) return;
        final String a = intent.getStringExtra("a");
        if (a == null) return;
        final String kind = intent.getStringExtra("k");
        final String itemId = intent.getStringExtra("i");
        final PendingResult result = goAsync();
        new Thread(() -> {
            try { handle(c, id, a, kind, itemId); } finally { result.finish(); }
        }).start();
    }

    private static void handle(Context c, int id, String a, String kind, String itemId) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        switch (a) {
            case "marcar": {
                if (!("task".equals(kind) || "fixed".equals(kind)) || itemId == null || itemId.isEmpty() || itemId.length() > 64) return;
                String ds = Agenda.today();
                Boolean done = Agenda.toggle(c, kind, itemId, ds);
                if (done == null) return;
                List<Agenda.Item> items = Agenda.itemsFor(Agenda.load(c), ds);
                if (done && !items.isEmpty() && Agenda.pending(items) == 0) ReminderScheduler.congratulate(c);
                AgenditaWidget.refreshAll(c);
                AgenditaPlugin.emitStateChanged();
                return;
            }
            case "pausa": {
                boolean paused = !AgenditaWidget.prefs(c).getBoolean("pausa_" + id, false);
                AgenditaWidget.prefs(c).edit().putBoolean("pausa_" + id, paused).apply();
                if (paused) scheduleResume(c, id); else cancelResume(c, id);
                AgenditaWidget.render(c, m, id);
                return;
            }
            case "seguir": {
                AgenditaWidget.prefs(c).edit().putBoolean("pausa_" + id, false).apply();
                AgenditaWidget.render(c, m, id);
                return;
            }
            case "atras":
            case "adelante": {
                RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_agendita_pausa);
                if ("atras".equals(a)) rv.showPrevious(R.id.w_flipper); else rv.showNext(R.id.w_flipper);
                m.partiallyUpdateAppWidget(id, rv);
                scheduleResume(c, id);
                return;
            }
            default:
        }
    }

    private static void scheduleResume(Context c, int id) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = AgenditaWidget.action(c, id, "seguir");
        long at = System.currentTimeMillis() + RESUME_AFTER;
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.set(AlarmManager.RTC, at, pi);
            else am.setExact(AlarmManager.RTC, at, pi);
        } catch (SecurityException e) {
            am.set(AlarmManager.RTC, at, pi);
        }
    }

    private static void cancelResume(Context c, int id) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(AgenditaWidget.action(c, id, "seguir"));
    }
}
