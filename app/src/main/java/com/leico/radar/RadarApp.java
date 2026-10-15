package com.leico.radar;

import android.app.Application;
import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

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
    }
}
