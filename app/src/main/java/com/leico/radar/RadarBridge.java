package com.leico.radar;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Fonctions natives appelées par la page (window.RadarBridge). */
public final class RadarBridge {
    public interface DoneListener { void onDone(String json); }

    private static final ExecutorService NET = Executors.newFixedThreadPool(6);
    private final Context ctx;
    private final Activity activity;          // null dans la tâche de fond
    private final WebView web;
    private final DoneListener done;
    private final Handler main = new Handler(Looper.getMainLooper());

    RadarBridge(Context ctx, Activity activity, WebView web, DoneListener done) {
        this.ctx = ctx.getApplicationContext();
        this.activity = activity;
        this.web = web;
        this.done = done;
    }

    @JavascriptInterface
    public String sql(String sql, String params, String mode) {
        return Db.get(ctx).sql(sql, params, mode);
    }

    @JavascriptInterface
    public String batch(String json) {
        return Db.get(ctx).batch(json);
    }

    /** Requête asynchrone : la réponse revient par window.__radarHttp(id, json). */
    @JavascriptInterface
    public void http(final String id, final String reqJson) {
        NET.execute(() -> {
            final String res = Http.request(reqJson);
            main.post(() -> web.evaluateJavascript(
                    "window.__radarHttp && window.__radarHttp(" + JSONObject.quote(id) + "," + JSONObject.quote(res) + ")", null));
        });
    }

    @JavascriptInterface
    public void notify(String title, String body, String route) {
        Notifier.show(ctx, title, body, route);
    }

    @JavascriptInterface
    public String info() {
        try {
            PowerManager pm = ctx.getSystemService(PowerManager.class);
            String version = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
            return new JSONObject()
                    .put("platform", "android")
                    .put("version", version)
                    .put("notifications", Notifier.allowed(ctx))
                    .put("batteryExempt", pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()))
                    .put("sdk", Build.VERSION.SDK_INT)
                    .toString();
        } catch (Exception e) {
            return "{\"platform\":\"android\"}";
        }
    }

    @JavascriptInterface
    public void requestNotifications() {
        if (activity == null) return;
        main.post(() -> {
            SharedPreferences prefs = ctx.getSharedPreferences("radar", Context.MODE_PRIVATE);
            boolean asked = prefs.getBoolean("notif_asked", false);
            if (Build.VERSION.SDK_INT >= 33 && !asked) {
                prefs.edit().putBoolean("notif_asked", true).apply();
                activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
            } else {
                Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
                activity.startActivity(i);
            }
        });
    }

    @JavascriptInterface
    public void requestBatteryExemption() {
        if (activity == null) return;
        main.post(() -> {
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + ctx.getPackageName()));
                activity.startActivity(i);
            } catch (Exception e) {
                activity.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            }
        });
    }

    @JavascriptInterface
    public void openUrl(String url) {
        main.post(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            } catch (Exception ignored) { /* aucune application pour ouvrir ce lien */ }
        });
    }

    /** Télécharge et installe la nouvelle version ; l'avancement revient par window.__radarUpdate(état, détail). */
    @JavascriptInterface
    public void installUpdate(final String url) {
        NET.execute(() -> Updater.run(ctx, activity, url, (state, detail) -> main.post(() -> web.evaluateJavascript(
                "window.__radarUpdate && window.__radarUpdate(" + JSONObject.quote(state) + "," + JSONObject.quote(detail) + ")", null))));
    }

    @JavascriptInterface
    public void done(String json) {
        if (done != null) done.onDone(json);
    }
}
