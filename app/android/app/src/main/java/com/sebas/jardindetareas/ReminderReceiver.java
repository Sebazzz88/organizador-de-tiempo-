package com.sebas.jardindetareas;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Recibe las alarmas propias de la app (no está expuesto a otras apps). */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        final Context c = context.getApplicationContext();
        final String action = intent.getAction();
        final int id = intent.getIntExtra("id", -1);
        final String which = intent.getStringExtra("cual");
        final PendingResult result = goAsync();
        new Thread(() -> {
            try {
                if (ReminderScheduler.ACTION_FIRE.equals(action) && id > 0) ReminderScheduler.fire(c, id);
                else if (ReminderScheduler.ACTION_DAILY.equals(action) && which != null) ReminderScheduler.daily(c, which);
                else if (ReminderScheduler.ACTION_TEST.equals(action)) ReminderScheduler.fireTest(c);
            } finally {
                result.finish();
            }
        }).start();
    }
}
