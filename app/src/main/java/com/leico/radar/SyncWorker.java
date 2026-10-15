package com.leico.radar;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Tâche de fond lancée toutes les heures par Android : une page invisible exécute le moteur
 * (collecte du jour à partir de 8 h, puis analyse des articles en attente).
 */
public class SyncWorker extends Worker {
    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        final CountDownLatch latch = new CountDownLatch(1);
        final Handler main = new Handler(Looper.getMainLooper());
        final WebView[] holder = new WebView[1];
        final String[] result = new String[1];
        main.post(() -> {
            try {
                WebView web = Web.create(getApplicationContext(), null, json -> {
                    result[0] = json;
                    latch.countDown();
                });
                holder[0] = web;
                web.loadUrl(Web.BASE + "background.html");
            } catch (Exception e) {
                Log.w("Radar", "tâche de fond impossible", e);
                latch.countDown();
            }
        });
        try {
            latch.await(9, TimeUnit.MINUTES);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        main.post(() -> {
            if (holder[0] != null) {
                holder[0].stopLoading();
                holder[0].destroy();
            }
        });
        Log.i("Radar", "tâche de fond terminée : " + result[0]);
        return Result.success();
    }
}
