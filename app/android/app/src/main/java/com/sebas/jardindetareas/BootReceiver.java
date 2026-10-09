package com.sebas.jardindetareas;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Vuelve a programar los avisos al encender el teléfono, al actualizar la app o al cambiar la hora.
 * Solo atiende avisos del sistema que otras apps no pueden enviar.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        switch (intent.getAction()) {
            case Intent.ACTION_BOOT_COMPLETED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
            case Intent.ACTION_TIME_CHANGED:
            case Intent.ACTION_TIMEZONE_CHANGED:
                break;
            default:
                return;
        }
        final Context c = context.getApplicationContext();
        final PendingResult result = goAsync();
        new Thread(() -> {
            try {
                ReminderScheduler.rescheduleAll(c);
            } finally {
                result.finish();
            }
        }).start();
    }
}
