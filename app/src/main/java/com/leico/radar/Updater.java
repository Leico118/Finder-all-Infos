package com.leico.radar;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Mise à jour depuis l'application : téléchargement de la nouvelle version puis installation par-dessus. */
final class Updater {
    interface Progress { void report(String state, String detail); }

    private Updater() {}

    static void run(Context ctx, Activity activity, String url, Progress p) {
        try {
            if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
                p.report("permission", "Autorisez Radar à installer des applications, puis revenez et touchez à nouveau « Mettre à jour ».");
                if (activity != null) {
                    activity.runOnUiThread(() -> activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + ctx.getPackageName()))));
                }
                return;
            }
            File apk = new File(ctx.getCacheDir(), "radar-update.apk");
            download(url, apk, p);
            p.report("installing", "Installation…");
            PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(ctx.getPackageName());
            params.setSize(apk.length());
            int id = pi.createSession(params);
            try (PackageInstaller.Session s = pi.openSession(id)) {
                try (OutputStream out = s.openWrite("radar.apk", 0, apk.length()); InputStream in = new FileInputStream(apk)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    s.fsync(out);
                }
                Intent cb = new Intent(ctx, UpdateReceiver.class);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent pend = PendingIntent.getBroadcast(ctx, id, cb, flags);
                s.commit(pend.getIntentSender());
            }
        } catch (Exception e) {
            p.report("error", "Mise à jour impossible : " + e.getClass().getSimpleName() + " " + e.getMessage());
        }
    }

    private static void download(String url, File dest, Progress p) throws Exception {
        URL u = new URL(url);
        for (int hop = 0; hop < 8; hop++) {
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            c.setRequestProperty("User-Agent", "Radar-Android");
            int status = c.getResponseCode();
            String loc = c.getHeaderField("Location");
            if (status >= 300 && status < 400 && loc != null) {
                u = new URL(u, loc);
                c.disconnect();
                continue;
            }
            if (status != 200) throw new Exception("téléchargement refusé (" + status + ")");
            long total = c.getContentLengthLong(), done = 0;
            int last = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    done += n;
                    int pct = total > 0 ? (int) (done * 100 / total) : -1;
                    if (pct != last && pct % 5 == 0) { last = pct; p.report("download", pct >= 0 ? pct + " %" : ""); }
                }
            }
            c.disconnect();
            if (total > 0 && done != total) throw new Exception("téléchargement incomplet");
            return;
        }
        throw new Exception("trop de redirections");
    }
}
