package com.sebas.jardindetareas;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.text.SpannableString;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

/** Arma las páginas del widget: cada página muestra hasta 4 tareas de hoy. */
public class WidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Pages(getApplicationContext(), intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID));
    }

    static final class Pages implements RemoteViewsFactory {
        private static final int[] ROW = {R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4};
        private static final int[] BODY = {R.id.w_b1, R.id.w_b2, R.id.w_b3, R.id.w_b4};
        private static final int[] CHECK = {R.id.w_c1, R.id.w_c2, R.id.w_c3, R.id.w_c4};
        private static final int[] TITLE = {R.id.w_t1, R.id.w_t2, R.id.w_t3, R.id.w_t4};
        private static final int[] META = {R.id.w_m1, R.id.w_m2, R.id.w_m3, R.id.w_m4};

        private final Context c;
        private final int widgetId;
        private final List<List<Agenda.Item>> pages = new ArrayList<>();

        Pages(Context c, int widgetId) { this.c = c; this.widgetId = widgetId; }

        @Override public void onCreate() { }
        @Override public void onDestroy() { pages.clear(); }

        @Override
        public void onDataSetChanged() {
            pages.clear();
            List<Agenda.Item> items = Agenda.itemsFor(Agenda.load(c), Agenda.today());
            int per = AgenditaWidget.rows(c, widgetId);
            for (int i = 0; i < items.size(); i += per) pages.add(new ArrayList<>(items.subList(i, Math.min(items.size(), i + per))));
        }

        @Override public int getCount() { return pages.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_pagina);
            if (position < 0 || position >= pages.size()) return rv;
            List<Agenda.Item> page = pages.get(position);
            for (int r = 0; r < ROW.length; r++) {
                if (r >= page.size()) { rv.setViewVisibility(ROW[r], View.GONE); continue; }
                Agenda.Item it = page.get(r);
                rv.setViewVisibility(ROW[r], View.VISIBLE);
                rv.setImageViewResource(CHECK[r], it.done ? R.drawable.w_check_on : R.drawable.w_check_off);
                rv.setContentDescription(CHECK[r], (it.done ? "Desmarcar " : "Marcar como hecha: ") + it.title);
                SpannableString title = new SpannableString(it.title);
                if (it.done) {
                    title.setSpan(new StrikethroughSpan(), 0, title.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    title.setSpan(new ForegroundColorSpan(Color.parseColor("#8A907C")), 0, title.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                }
                rv.setTextViewText(TITLE[r], title);
                rv.setTextViewText(META[r], meta(it));
                rv.setOnClickFillInIntent(CHECK[r], new Intent().putExtra("a", "marcar").putExtra("k", it.kind).putExtra("i", it.id));
                rv.setOnClickFillInIntent(BODY[r], new Intent().putExtra("a", "pausa"));
            }
            rv.setTextViewText(R.id.w_pg, pages.size() > 1 ? (position + 1) + "/" + pages.size() : "");
            return rv;
        }

        private static CharSequence meta(Agenda.Item it) {
            String label;
            int color;
            switch (it.cat) {
                case "urgente": label = "Urgente"; color = 0xFFFF7A6B; break;
                case "leve": label = "Leve"; color = 0xFF5AD8C8; break;
                case "fija": label = "Fija"; color = 0xFF68EF3F; break;
                default: label = "Importante"; color = 0xFFFFC14D; break;
            }
            SpannableStringBuilder sb = new SpannableStringBuilder("● ");
            sb.setSpan(new ForegroundColorSpan(color), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            sb.append(it.time).append(" · ").append(label);
            return sb;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }
    }
}
