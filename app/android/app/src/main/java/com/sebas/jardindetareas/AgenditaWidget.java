package com.sebas.jardindetareas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.List;

/**
 * Widget de Agendita: tareas de hoy que pasan solas como páginas cada 4,5 segundos, sin fin.
 * Tocar una tarea (o el botón de pausa) detiene el paso de páginas; sigue solo a los 15 segundos.
 */
public class AgenditaWidget extends AppWidgetProvider {
    static final String ACTION = "com.sebas.agendita.WIDGET";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        saveRows(context, id, options);
        manager.notifyAppWidgetViewDataChanged(new int[]{id}, R.id.w_flipper);
        render(context, manager, id);
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor e = prefs(context).edit();
        for (int id : ids) e.remove("pausa_" + id).remove("filas_" + id);
        e.apply();
    }

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("agendita_widget", Context.MODE_PRIVATE);
    }

    static int[] ids(Context c) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, AgenditaWidget.class));
    }

    /** Vuelve a dibujar todos los widgets con los datos actuales. */
    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = ids(c);
        if (ids.length == 0) return;
        m.notifyAppWidgetViewDataChanged(ids, R.id.w_flipper);
        for (int id : ids) render(c, m, id);
    }

    static int rows(Context c, int id) {
        return prefs(c).getInt("filas_" + id, 3);
    }

    private static void saveRows(Context c, int id, Bundle o) {
        if (o == null) return;
        int h = Math.max(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0));
        if (h <= 0) return;
        int rows = Math.max(1, Math.min(4, (h - 96) / 46));
        prefs(c).edit().putInt("filas_" + id, rows).apply();
    }

    static void render(Context c, AppWidgetManager m, int id) {
        saveRows(c, id, m.getAppWidgetOptions(id));
        JSONObject st = Agenda.load(c);
        String ds = Agenda.today();
        List<Agenda.Item> items = Agenda.itemsFor(st, ds);
        int total = items.size(), left = Agenda.pending(items);
        boolean paused = prefs(c).getBoolean("pausa_" + id, false);

        RemoteViews rv = new RemoteViews(c.getPackageName(), paused ? R.layout.widget_agendita_pausa : R.layout.widget_agendita);
        rv.setTextViewText(R.id.w_count, total == 0 ? "" : (total - left) + "/" + total);
        rv.setOnClickPendingIntent(R.id.w_head, openApp(c));
        rv.setOnClickPendingIntent(R.id.w_pause, action(c, id, "pausa"));
        if (paused) {
            rv.setOnClickPendingIntent(R.id.w_prev, action(c, id, "atras"));
            rv.setOnClickPendingIntent(R.id.w_next, action(c, id, "adelante"));
        }

        rv.setViewVisibility(R.id.w_flipper, View.GONE);
        rv.setViewVisibility(R.id.w_done, View.GONE);
        rv.setViewVisibility(R.id.w_empty, View.GONE);
        rv.setViewVisibility(R.id.w_pause, total > 0 && left > 0 ? View.VISIBLE : View.GONE);

        if (total == 0) {
            rv.setViewVisibility(R.id.w_empty, View.VISIBLE);
            rv.setOnClickPendingIntent(R.id.w_empty, openApp(c));
            rv.setTextViewText(R.id.w_footer, "Toca para abrir Agendita");
        } else if (left == 0) {
            rv.setViewVisibility(R.id.w_done, View.VISIBLE);
            rv.setTextViewText(R.id.w_done_text, doneMessage(c, ds, Agenda.name(st)));
            rv.setOnClickPendingIntent(R.id.w_done, openApp(c));
            rv.setTextViewText(R.id.w_footer, "Completaste " + total + (total == 1 ? " tarea hoy" : " tareas hoy"));
        } else {
            rv.setViewVisibility(R.id.w_flipper, View.VISIBLE);
            Intent svc = new Intent(c, WidgetService.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
            rv.setRemoteAdapter(R.id.w_flipper, svc);
            rv.setPendingIntentTemplate(R.id.w_flipper, template(c, id));
            rv.setTextViewText(R.id.w_footer, (left == 1 ? "Te falta 1" : "Te faltan " + left) + " · " + cheer(c, ds, left));
        }
        m.updateAppWidget(id, rv);
    }

    /** El mensaje de felicitación del día se elige una vez y se mantiene. */
    static String doneMessage(Context c, String ds, String name) {
        SharedPreferences p = prefs(c);
        if (ds.equals(p.getString("logro_dia", ""))) return p.getString("logro_msg", "¡Bien hecho!");
        String msg = Agenda.fill(Agenda.pick(c, "logros", Agenda.DONE), 0, name);
        p.edit().putString("logro_dia", ds).putString("logro_msg", msg).apply();
        return msg;
    }

    /** Frase corta de ánimo: cambia cuando cambia la cantidad de pendientes. */
    private static String cheer(Context c, String ds, int left) {
        SharedPreferences p = prefs(c);
        String key = ds + "#" + left;
        if (key.equals(p.getString("animo_clave", ""))) return p.getString("animo_msg", Agenda.CHEER[0]);
        String msg = Agenda.pick(c, "animo", Agenda.CHEER);
        p.edit().putString("animo_clave", key).putString("animo_msg", msg).apply();
        return msg;
    }

    static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 7001, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent action(Context c, int id, String a) {
        Intent i = new Intent(c, WidgetActionReceiver.class).setAction(ACTION)
                .setData(Uri.parse("agendita://widget/" + id + "/" + a))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra("a", a);
        return PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Plantilla para los toques dentro de las páginas. Es explícita: solo puede llegar a nuestro receptor. */
    private static PendingIntent template(Context c, int id) {
        Intent i = new Intent(c, WidgetActionReceiver.class).setAction(ACTION)
                .setData(Uri.parse("agendita://widget/" + id + "/toque"))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(c, id, i, flags);
    }
}
