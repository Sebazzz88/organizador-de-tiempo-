package com.sebas.jardindetareas;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.TimeZone;
import java.util.regex.Pattern;

/** Lógica de tareas que comparten el widget y los avisos: qué toca hoy, marcar hecho y mensajes variados. */
final class Agenda {
    static final String STATE = "state";
    private static final Pattern YMD = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern HM = Pattern.compile("\\d{2}:\\d{2}");

    private Agenda() {}

    static final class Item {
        String kind;   // "task" o "fixed"
        String id;
        String title;
        String time;
        String cat;    // urgente, importante, leve o fija
        boolean done;
    }

    // ---------- Estado ----------

    static JSONObject load(Context c) {
        String raw = SecureStore.get(c, STATE);
        if (raw == null) return new JSONObject();
        try { return new JSONObject(raw); } catch (Exception e) { return new JSONObject(); }
    }

    static boolean save(Context c, JSONObject state) {
        return SecureStore.put(c, STATE, state.toString());
    }

    static String name(JSONObject st) {
        JSONObject s = st.optJSONObject("settings");
        String n = s == null ? "" : s.optString("name", "").trim();
        return n.length() > 40 ? n.substring(0, 40) : n;
    }

    // ---------- Fechas ----------

    static String today() { return ymd(Calendar.getInstance()); }

    static String ymd(Calendar c) {
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static boolean isYmd(String s) { return s != null && YMD.matcher(s).matches(); }

    static boolean isTime(String s) { return s != null && HM.matcher(s).matches(); }

    /** Fecha a medianoche UTC: sirve para contar días sin que el horario de verano moleste. */
    private static Calendar utc(String ymd) {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        c.clear();
        c.set(Integer.parseInt(ymd.substring(0, 4)), Integer.parseInt(ymd.substring(5, 7)) - 1, Integer.parseInt(ymd.substring(8, 10)));
        return c;
    }

    /** Día de la semana como en JavaScript: 0 = domingo … 6 = sábado. */
    static int weekday(String ymd) { return utc(ymd).get(Calendar.DAY_OF_WEEK) - 1; }

    private static long dayNumber(String ymd) { return utc(ymd).getTimeInMillis() / 86400000L; }

    // ---------- Qué toca en un día ----------

    static boolean taskOccurs(JSONObject t, String ds) {
        String start = t.optString("date", "");
        if (!isYmd(start) || ds.compareTo(start) < 0) return false;
        if (ds.equals(start)) return true;
        String repeat = t.optString("repeat", "none");
        switch (repeat) {
            case "daily": return true;
            case "weekly": return (dayNumber(ds) - dayNumber(start)) % 7 == 0;
            case "monthly": return ds.substring(8).equals(start.substring(8));
            case "yearly": return ds.substring(5).equals(start.substring(5));
            default: return false;
        }
    }

    static boolean fixedOccurs(JSONObject f, String ds) {
        String start = f.optString("start", "");
        if (isYmd(start) && ds.compareTo(start) < 0) return false;
        JSONArray days = f.optJSONArray("days");
        if (days == null || days.length() == 0) return true;
        int wd = weekday(ds);
        for (int i = 0; i < days.length(); i++) if (days.optInt(i, -1) == wd) return true;
        return false;
    }

    static boolean isDone(JSONObject item, String ds) {
        JSONObject done = item.optJSONObject("done");
        return done != null && done.has(ds) && done.optInt(ds, 0) != 0;
    }

    /** Tareas y fijas del día, ordenadas por hora. */
    static List<Item> itemsFor(JSONObject st, String ds) {
        List<Item> out = new ArrayList<>();
        JSONArray tasks = st.optJSONArray("tasks");
        if (tasks != null) for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null || !taskOccurs(t, ds)) continue;
            Item it = new Item();
            it.kind = "task"; it.id = t.optString("id"); it.title = t.optString("title", "");
            it.time = isTime(t.optString("time")) ? t.optString("time") : "09:00";
            it.cat = t.optString("cat", "importante"); it.done = isDone(t, ds);
            out.add(it);
        }
        JSONArray fixed = st.optJSONArray("fixed");
        if (fixed != null) for (int i = 0; i < fixed.length(); i++) {
            JSONObject f = fixed.optJSONObject(i);
            if (f == null || !fixedOccurs(f, ds)) continue;
            Item it = new Item();
            it.kind = "fixed"; it.id = f.optString("id"); it.title = f.optString("title", "");
            it.time = isTime(f.optString("time")) ? f.optString("time") : "08:00";
            it.cat = "fija"; it.done = isDone(f, ds);
            out.add(it);
        }
        Collections.sort(out, (a, b) -> a.time.compareTo(b.time));
        return out;
    }

    static int pending(List<Item> items) {
        int n = 0;
        for (Item it : items) if (!it.done) n++;
        return n;
    }

    /** ¿La tarea (o fija) sigue existiendo y está sin hacer ese día? */
    static boolean isPending(JSONObject st, String kind, String id, String ds) {
        JSONArray list = st.optJSONArray("fixed".equals(kind) ? "fixed" : "tasks");
        if (list == null) return false;
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) {
                boolean occurs = "fixed".equals(kind) ? fixedOccurs(o, ds) : taskOccurs(o, ds);
                return occurs && !isDone(o, ds);
            }
        }
        return false;
    }

    /** Marca o desmarca una tarea de hoy. Devuelve el nuevo estado, o null si no se encontró. */
    static Boolean toggle(Context c, String kind, String id, String ds) {
        JSONObject st = load(c);
        JSONArray list = st.optJSONArray("fixed".equals(kind) ? "fixed" : "tasks");
        if (list == null) return null;
        try {
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o == null || !id.equals(o.optString("id"))) continue;
                JSONObject done = o.optJSONObject("done");
                if (done == null) { done = new JSONObject(); o.put("done", done); }
                boolean nowDone = !(done.optInt(ds, 0) != 0);
                if (nowDone) done.put(ds, 1); else done.remove(ds);
                return save(c, st) ? nowDone : null;
            }
        } catch (Exception ignored) { }
        return null;
    }

    // ---------- Mensajes variados (sin repetirse hasta agotar la lista) ----------

    static final String[] DONE = {
        "¡Bien hecho%s! Completaste todo lo de hoy 🌺",
        "¡Lo lograste%s! Hoy no quedó nada pendiente. A descansar 🌴",
        "Día completo%s. Cada tarea hecha es una flor nueva en tu jardín 🌸",
        "¡Qué orgullo%s! Terminaste todas tus tareas de hoy ✨",
        "Todo listo por hoy%s. Te ganaste un rato para ti 🥭",
        "¡Misión cumplida%s! Hoy fuiste imparable 🌿",
        "¡Hoy brillaste%s! No quedó ninguna tarea pendiente 🌞",
        "Tareas completas%s. Así, paso a paso, se construyen grandes cosas 🌱",
        "¡Excelente%s! Cerraste el día con todo hecho 🌊",
        "Lo hiciste increíble%s. Mañana seguimos con la misma energía 💚",
        "¡Felicitaciones%s! Tu lista de hoy quedó en cero 🎉",
        "Todo hecho%s. Respira, sonríe y disfruta lo que lograste 🌼"
    };

    static final String[] PENDING = {
        "Te quedan %d tareas de hoy%s. Una a la vez, tú puedes 🌱",
        "Aún tienes %d pendientes%s. Empieza por la más corta y verás cómo fluye 🌊",
        "%d tareas esperan por ti%s. Diez minutos de enfoque y avanzas mucho ✨",
        "Todavía hay %d tareas para hoy%s. Lo estás haciendo bien, sigue así 🌺",
        "Quedan %d pendientes%s. Un pasito más y cierras el día tranquila 🌴",
        "Ojo%s: faltan %d tareas de hoy. ¡Tú con todo! 💪",
        "Faltan %d tareas%s. Elige una ahora y táchala en el widget 🌿",
        "%d pendientes de hoy%s. Lo pequeño también cuenta, empieza ya 🌸",
        "Te faltan %d por hoy%s. Una pausa de agua y a terminar 🥭",
        "Recordatorio amable%s: %d tareas siguen pendientes hoy 🌞"
    };

    static final String[] MISSED = {
        "Hoy quedaron %d tareas sin hacer%s. Mañana es otra oportunidad para florecer 🌱",
        "No alcanzaste %d tareas hoy%s. Está bien: descansa y mañana sigues 🌙",
        "%d pendientes no se completaron hoy%s. Pásalas a mañana y empieza por ellas 🌺",
        "Hoy faltaron %d tareas%s. Lo importante es no rendirse, ¡mañana con todo! 💚",
        "Quedaron %d tareas abiertas%s. Mañana, una a la vez, las cierras 🌿",
        "Hoy no se pudo con %d tareas%s. Respira, ajusta tu plan y sigue adelante ✨",
        "%d tareas siguen pendientes%s. Cada día es una página nueva 🌴",
        "Hoy quedaron %d sin marcar%s. Si ya las hiciste, márcalas en el widget 🌊",
        "Te faltaron %d tareas hoy%s. Mañana empieza por la más importante 🥭",
        "%d tareas no se completaron%s. Tu esfuerzo de hoy igual cuenta 🌸"
    };

    /** Versiones en singular: cuando solo queda una tarea. */
    static final String[] PENDING_ONE = {
        "Te queda 1 tarea de hoy%s. Es la última, ¡tú puedes! 🌱",
        "Solo falta 1 tarea%s. Termínala y cierras el día tranquila 🌴",
        "1 tarea espera por ti%s. Diez minutos y listo ✨",
        "Ya casi%s: te queda 1 pendiente. ¡Último empujón! 💪",
        "Recordatorio amable%s: 1 tarea sigue pendiente hoy 🌞",
        "Una sola tarea más%s y tu lista queda en cero 🌺",
        "Falta 1 por hoy%s. Una pausa de agua y a terminar 🥭",
        "Ojo%s: queda 1 tarea de hoy. Táchala en el widget 🌿"
    };

    static final String[] MISSED_ONE = {
        "Hoy quedó 1 tarea sin hacer%s. Mañana es otra oportunidad para florecer 🌱",
        "Te faltó 1 tarea hoy%s. Está bien: descansa y mañana sigues 🌙",
        "Quedó 1 pendiente abierta%s. Mañana empieza por ella 🌺",
        "Hoy faltó solo 1 tarea%s. ¡Casi lo logras! Mañana con todo 💚",
        "1 tarea quedó sin marcar%s. Si ya la hiciste, márcala en el widget 🌊",
        "Se quedó 1 tarea pendiente%s. Cada día es una página nueva 🌴",
        "Hoy no se pudo con 1 tarea%s. Tu esfuerzo de hoy igual cuenta 🌸",
        "Solo 1 tarea no se completó%s. Respira y sigue adelante ✨"
    };

    /** Elige un mensaje de pendientes con el número bien escrito (singular o plural). */
    static String countMessage(Context c, String bag, String[] many, String[] one, int n, String name) {
        return n == 1 ? fill(pick(c, bag + "_1", one), n, name) : fill(pick(c, bag, many), n, name);
    }

    static final String[] CHEER = {
        "Una a la vez, tú puedes",
        "Lo estás haciendo muy bien",
        "Pasito a pasito se llega lejos",
        "Diez minutos de enfoque y avanzas",
        "Empieza por la más corta",
        "Cada ✓ es una flor nueva",
        "Tú con todo hoy",
        "Respira y sigue",
        "Hoy es tu día",
        "Lo pequeño también cuenta"
    };

    /** Elige el siguiente mensaje de una bolsa mezclada: no se repite hasta usar todos. */
    static String pick(Context c, String bag, String[] options) {
        SharedPreferences p = c.getApplicationContext().getSharedPreferences("agendita_mensajes", Context.MODE_PRIVATE);
        String order = p.getString(bag + "_orden", "");
        int pos = p.getInt(bag + "_pos", 0);
        String[] idx = order.isEmpty() ? new String[0] : order.split(",");
        if (idx.length != options.length || pos >= idx.length) {
            List<Integer> l = new ArrayList<>();
            for (int i = 0; i < options.length; i++) l.add(i);
            Collections.shuffle(l, new Random());
            String last = p.getString(bag + "_ultimo", "");
            if (l.size() > 1 && String.valueOf(l.get(0)).equals(last)) Collections.swap(l, 0, 1);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < l.size(); i++) { if (i > 0) sb.append(','); sb.append(l.get(i)); }
            order = sb.toString(); idx = order.split(","); pos = 0;
        }
        int chosen = Integer.parseInt(idx[pos]);
        p.edit().putString(bag + "_orden", order).putInt(bag + "_pos", pos + 1).putString(bag + "_ultimo", String.valueOf(chosen)).apply();
        return options[chosen];
    }

    /** Rellena un mensaje con la cantidad y el nombre (", Ana"), respetando el orden de cada plantilla. */
    static String fill(String template, int n, String name) {
        String hi = name.isEmpty() ? "" : ", " + name;
        int d = template.indexOf("%d"), s = template.indexOf("%s");
        if (d < 0) return String.format(Locale.US, template, hi);
        if (s < 0) return String.format(Locale.US, template, n);
        return d < s ? String.format(Locale.US, template, n, hi) : String.format(Locale.US, template, hi, n);
    }
}
