package com.leico.radar;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/** Création de la vue web qui affiche l'interface (ou exécute la tâche de fond). */
public final class Web {
    /** Adresse sécurisée locale : les fichiers viennent du dossier assets de l'application. */
    public static final String HOST = "appassets.androidplatform.net";
    public static final String BASE = "https://" + HOST + "/";

    private Web() {}

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    static WebView create(final Context ctx, final Activity activity, RadarBridge.DoneListener done) {
        final WebView web = new WebView(activity != null ? activity : ctx.getApplicationContext());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);
        web.setBackgroundColor(0xFF0A0A0C);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(ctx))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                // Liens vers les articles : ouverts dans le navigateur du téléphone.
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(i);
                } catch (Exception ignored) { /* aucun navigateur */ }
                return true;
            }
        });
        web.addJavascriptInterface(new RadarBridge(ctx, activity, web, done), "RadarBridge");
        return web;
    }
}
