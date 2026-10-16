package com.leico.radar;

import android.app.Application;
import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

public class RadarApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        schedule(this);
    }

    /** Passage toutes les heures (réseau requis) ; le moteur décide s'il faut collecter ou analyser. */
    static void schedule(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(SyncWorker.class, 1, TimeUnit.HOURS, 15, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("radar-sync", ExistingPeriodicWorkPolicy.KEEP, req);
        scheduleDaily(ctx, ExistingWorkPolicy.KEEP);
    }

    static final String DAILY_TAG = "radar-daily";

    /** Heure de la collecte quotidienne choisie dans les réglages (8 h par défaut). */
    static int dailyHour(Context ctx) {
        return ctx.getSharedPreferences("radar", Context.MODE_PRIVATE).getInt("daily_hour", 8);
    }

    static void setDailyHour(Context ctx, int hour) {
        ctx.getSharedPreferences("radar", Context.MODE_PRIVATE).edit().putInt("daily_hour", hour).apply();
        scheduleDaily(ctx, ExistingWorkPolicy.REPLACE);
    }

    /**
     * Passage précis à l'heure choisie (en plus du passage horaire, qui rattrape un éventuel oubli d'Android).
     * policy : KEEP au démarrage, REPLACE quand l'heure change, APPEND_OR_REPLACE pour programmer le lendemain.
     */
    static void scheduleDaily(Context ctx, ExistingWorkPolicy policy) {
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, dailyHour(ctx));
        next.set(Calendar.MINUTE, 1);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis() + 60000) next.add(Calendar.DAY_OF_MONTH, 1);
        long delay = next.getTimeInMillis() - System.currentTimeMillis();
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(SyncWorker.class)
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .addTag(DAILY_TAG)
                .build();
        WorkManager.getInstance(ctx).enqueueUniqueWork(DAILY_TAG, policy, req);
    }
}
