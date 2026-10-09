package com.sebas.jardindetareas;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebStorage;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.lang.ref.WeakReference;

/** Puente entre la app y la parte nativa: bóveda cifrada, avisos, permisos y widget. */
@CapacitorPlugin(name = "Agendita", permissions = {
        @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "display")
})
public class AgenditaPlugin extends Plugin {
    private static final int MAX_STATE = 2_000_000;
    private static final String LEGACY_KEY = "jardin-app-v1";
    private static WeakReference<AgenditaPlugin> current = new WeakReference<>(null);

    @Override
    public void load() {
        current = new WeakReference<>(this);
        Notifier.ensureChannels(getContext());
        if (getActivity() != null) openFrom(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        openFrom(intent);
    }

    /** Al tocar un aviso, la app abre el calendario en ese día. */
    private void openFrom(Intent intent) {
        if (intent == null) return;
        String ds = intent.getStringExtra(Notifier.EXTRA_DS);
        if (!Agenda.isYmd(ds)) return;
        intent.removeExtra(Notifier.EXTRA_DS);
        JSObject o = new JSObject();
        o.put("ds", ds);
        notifyListeners("open", o, true);
    }

    /** Avisa a la app que el widget cambió los datos. */
    static void emitStateChanged() {
        AgenditaPlugin p = current.get();
        if (p != null) p.notifyListeners("stateChanged", new JSObject());
    }

    // ---------- Bóveda ----------

    @PluginMethod
    public void loadState(PluginCall call) {
        Context c = getContext();
        String value = SecureStore.get(c, Agenda.STATE);
        JSObject r = new JSObject();
        r.put("value", value);
        r.put("unreadable", value == null && SecureStore.lastReadFailed);
        call.resolve(r);
    }

    @PluginMethod
    public void saveState(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > MAX_STATE) { call.reject("Datos no válidos"); return; }
        try { new JSONObject(value); } catch (Exception e) { call.reject("Datos no válidos"); return; }
        Context c = getContext();
        if (!SecureStore.put(c, Agenda.STATE, value)) { call.reject("No se pudo guardar"); return; }
        ReminderScheduler.scheduleDaily(c);
        AgenditaWidget.refreshAll(c);
        call.resolve();
    }

    // ---------- Avisos ----------

    @PluginMethod
    public void setSchedule(PluginCall call) {
        String items = call.getString("items");
        if (items == null || items.length() > MAX_STATE) { call.reject("Avisos no válidos"); return; }
        try {
            int n = ReminderScheduler.setSchedule(getContext(), items);
            JSObject r = new JSObject();
            r.put("count", n);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudieron programar los avisos");
        }
    }

    @PluginMethod
    public void testNotification(PluginCall call) {
        try {
            ReminderScheduler.scheduleTest(getContext(), call.getString("title", "Aviso de prueba"),
                    call.getString("body", ""), System.currentTimeMillis() + 5000);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo programar la prueba");
        }
    }

    @PluginMethod
    public void checkNotif(PluginCall call) {
        JSObject r = new JSObject();
        String display;
        if (Build.VERSION.SDK_INT >= 33) {
            PermissionState s = getPermissionState("display");
            display = s == null ? "prompt" : s.toString();
            if ("granted".equals(display) && !Notifier.enabled(getContext())) display = "denied";
        } else {
            display = Notifier.enabled(getContext()) ? "granted" : "denied";
        }
        r.put("display", display);
        r.put("exact", ReminderScheduler.canExact(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestNotif(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("display") != PermissionState.GRANTED) {
            requestPermissionForAlias("display", call, "notifResult");
        } else {
            checkNotif(call);
        }
    }

    @PermissionCallback
    private void notifResult(PluginCall call) {
        checkNotif(call);
    }

    @PluginMethod
    public void openExactSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getActivity() != null) {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(i);
        }
        call.resolve();
    }

    // ---------- Migración desde versiones anteriores ----------

    /** Datos de la versión anterior guardados sin cifrar por el plugin Preferences (solo para migrarlos). */
    @PluginMethod
    public void legacyPreferences(PluginCall call) {
        JSObject r = new JSObject();
        r.put("value", getContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString(LEGACY_KEY, null));
        call.resolve(r);
    }

    /**
     * Borra todo lo que las versiones anteriores dejaron sin cifrar: la copia en Preferences,
     * los avisos guardados en texto plano, sus alarmas, sus canales y el almacenamiento web.
     */
    @PluginMethod
    public void clearLegacy(PluginCall call) {
        Context c = getContext();
        c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).edit().remove(LEGACY_KEY).commit();
        if (!c.getSharedPreferences("agendita_migracion", Context.MODE_PRIVATE).getBoolean("limpio_v1", false)) {
            AlarmManager am = c.getSystemService(AlarmManager.class);
            ComponentName old = new ComponentName(c.getPackageName(), "com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher");
            int flags = PendingIntent.FLAG_NO_CREATE | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            // Avisos 1..460 de la versión anterior, más el de prueba.
            for (int i = 0; i <= 460; i++) {
                int req = i == 0 ? 2000000001 : i;
                PendingIntent pi = PendingIntent.getBroadcast(c, req, new Intent().setComponent(old), flags);
                if (pi != null) {
                    if (am != null) am.cancel(pi);
                    pi.cancel();
                }
            }
            for (String f : new String[]{"NOTIFICATION_STORE", "ACTION_TYPE_STORE", "NOTIFICATION_ID", "NOTIFICATION_PID"}) {
                c.deleteSharedPreferences(f);
            }
            Notifier.deleteOldChannels(c);
            c.getSharedPreferences("agendita_migracion", Context.MODE_PRIVATE).edit().putBoolean("limpio_v1", true).commit();
        }
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                WebStorage.getInstance().deleteAllData();
                call.resolve();
            });
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void refreshWidget(PluginCall call) {
        AgenditaWidget.refreshAll(getContext());
        call.resolve();
    }
}
