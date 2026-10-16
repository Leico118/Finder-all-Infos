package com.leico.radar;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import org.json.JSONObject;

/** Écran principal : l'interface de Radar dans une vue web plein écran. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(0xFF0A0A0C);
        w.setNavigationBarColor(0xFF0A0A0C);
        w.getDecorView().setSystemUiVisibility(0);       // icônes claires sur fond sombre

        Notifier.ensureChannel(this);
        RadarApp.schedule(this);

        web = Web.create(this, this, null);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        if (savedInstanceState == null || web.getUrl() == null) web.loadUrl(Web.BASE + "index.html" + route(getIntent()));
    }

    private static String route(Intent intent) {
        String r = intent == null ? null : intent.getStringExtra("route");
        return r == null || r.isEmpty() ? "" : "#" + r;
    }

    // Notification touchée alors que l'application est déjà ouverte.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String r = intent.getStringExtra("route");
        if (r != null && !r.isEmpty() && web != null) {
            web.evaluateJavascript("window.radarNavigate && window.radarNavigate(" + JSONObject.quote(r) + ")", null);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        // La page décide où revenir (sujet → accueil, article → liste, réglages → actualités) ; « exit » : quitter.
        web.evaluateJavascript("(window.radarBack && window.radarBack()) || 'none'", res -> {
            if ("\"exit\"".equals(res)) moveTaskToBack(true);
            else if ("\"none\"".equals(res)) {
                if (web.canGoBack()) web.goBack(); else moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    // Retour dans Radar (par exemple après avoir copié une clé sur le site de Google) : la page vérifie
    // le presse-papiers, ce qui n'est possible qu'une fois la fenêtre au premier plan.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && web != null) web.evaluateJavascript("window.__radarFocus && window.__radarFocus()", null);
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
