package com.leico.radar;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteCursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteProgram;
import android.database.sqlite.SQLiteStatement;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Base SQLite locale. Le moteur JavaScript lui envoie ses requêtes en JSON ; les paramètres
 * sont liés avec leur vrai type (entier, réel, texte) pour que les comparaisons SQL restent justes.
 */
public final class Db extends SQLiteOpenHelper {
    private static Db instance;

    public static synchronized Db get(Context ctx) {
        if (instance == null) instance = new Db(ctx.getApplicationContext());
        return instance;
    }

    private Db(Context ctx) {
        super(ctx, "radar.db", null, 1);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        db.enableWriteAheadLogging();
    }

    @Override
    public void onCreate(SQLiteDatabase db) { /* les tables sont créées par le moteur */ }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { /* idem */ }

    private static void bindAll(SQLiteProgram p, JSONArray args) throws Exception {
        if (args == null) return;
        for (int i = 0; i < args.length(); i++) {
            Object v = args.get(i);
            int idx = i + 1;
            if (v == null || v == JSONObject.NULL) p.bindNull(idx);
            else if (v instanceof Integer || v instanceof Long) p.bindLong(idx, ((Number) v).longValue());
            else if (v instanceof Number) {
                double d = ((Number) v).doubleValue();
                if (d == Math.rint(d) && Math.abs(d) < 9.0e15) p.bindLong(idx, (long) d);
                else p.bindDouble(idx, d);
            } else if (v instanceof Boolean) p.bindLong(idx, ((Boolean) v) ? 1 : 0);
            else p.bindString(idx, v.toString());
        }
    }

    private static Object value(Cursor c, int i) {
        switch (c.getType(i)) {
            case Cursor.FIELD_TYPE_INTEGER: return c.getLong(i);
            case Cursor.FIELD_TYPE_FLOAT: return c.getDouble(i);
            case Cursor.FIELD_TYPE_STRING: return c.getString(i);
            default: return JSONObject.NULL;
        }
    }

    private static JSONObject row(Cursor c) throws Exception {
        JSONObject o = new JSONObject();
        for (int i = 0; i < c.getColumnCount(); i++) o.put(c.getColumnName(i), value(c, i));
        return o;
    }

    private int execute(SQLiteDatabase db, String sql, JSONArray args) throws Exception {
        SQLiteStatement st = db.compileStatement(sql);
        try {
            bindAll(st, args);
            return st.executeUpdateDelete();
        } finally {
            st.close();
        }
    }

    /** mode : "all" (toutes les lignes), "first" (première ligne) ou "run" (écriture). */
    public synchronized String sql(String sql, String params, String mode) {
        try {
            SQLiteDatabase db = getWritableDatabase();
            final JSONArray args = params == null || params.isEmpty() ? new JSONArray() : new JSONArray(params);
            JSONObject out = new JSONObject();
            if ("run".equals(mode)) {
                out.put("changes", execute(db, sql, args));
                out.put("lastId", 0);
                return out.toString();
            }
            Cursor c = db.rawQueryWithFactory((database, driver, editTable, query) -> {
                try {
                    bindAll(query, args);
                } catch (Exception e) {
                    throw new IllegalArgumentException(e.getMessage());
                }
                return new SQLiteCursor(driver, editTable, query);
            }, sql, null, null);
            try {
                if ("first".equals(mode)) {
                    out.put("row", c.moveToFirst() ? row(c) : JSONObject.NULL);
                } else {
                    JSONArray rows = new JSONArray();
                    while (c.moveToNext()) rows.put(row(c));
                    out.put("rows", rows);
                }
            } finally {
                c.close();
            }
            return out.toString();
        } catch (Exception e) {
            return error(e);
        }
    }

    /** Plusieurs écritures dans une même transaction : tout ou rien. */
    public synchronized String batch(String json) {
        SQLiteDatabase db = getWritableDatabase();
        try {
            JSONArray list = new JSONArray(json);
            JSONArray results = new JSONArray();
            db.beginTransaction();
            try {
                for (int i = 0; i < list.length(); i++) {
                    JSONObject s = list.getJSONObject(i);
                    JSONArray args = s.optJSONArray("params");
                    JSONObject r = new JSONObject();
                    r.put("changes", execute(db, s.getString("sql"), args));
                    results.put(r);
                }
                db.setTransactionSuccessful();
            } finally {
                db.endTransaction();
            }
            return new JSONObject().put("results", results).toString();
        } catch (Exception e) {
            return error(e);
        }
    }

    private static String error(Exception e) {
        try {
            return new JSONObject().put("error", String.valueOf(e.getMessage())).toString();
        } catch (Exception ignored) {
            return "{\"error\":\"erreur SQLite\"}";
        }
    }
}
