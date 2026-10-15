package com.leico.radar;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** Notifications des nouveautés importantes (une par sujet). */
public final class Notifier {
    static final String CHANNEL = "radar_news";
    private Notifier() {}

    static void ensureChannel(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Nouveautés importantes", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Annonces officielles et informations majeures sur vos sujets");
            nm.createNotificationChannel(ch);
        }
    }

    static boolean allowed(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || !nm.areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 33
                || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static void show(Context ctx, String title, String body, String route) {
        if (!allowed(ctx)) return;
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("route", route == null ? "" : route);
        int id = (route == null ? title : route).hashCode();
        PendingIntent pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification n = new android.app.Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_radar)
                .setColor(0xFFD9C4A3)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(id, n);
    }
}
