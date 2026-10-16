package com.leico.radar;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.EnumMap;
import java.util.Map;

/** Partage des réglages entre deux téléphones : code QR (création et lecture), message, presse-papiers. */
final class KeyShare {
    interface Result { void done(String json); }

    private KeyShare() {}

    /** Matrice du code QR : {"size":n,"rows":["0101…",…]} ; la page la dessine elle-même. */
    static String qrMatrix(String text) {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 2);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            BitMatrix m = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints);
            JSONArray rows = new JSONArray();
            for (int y = 0; y < m.getHeight(); y++) {
                StringBuilder sb = new StringBuilder(m.getWidth());
                for (int x = 0; x < m.getWidth(); x++) sb.append(m.get(x, y) ? '1' : '0');
                rows.put(sb.toString());
            }
            return new JSONObject().put("size", m.getWidth()).put("rows", rows).toString();
        } catch (Exception e) {
            return "{\"error\":\"code QR impossible\"}";
        }
    }

    /** Ouvre le scanner de Google (pas besoin d'autoriser la caméra) et renvoie le texte lu. */
    static void scan(Activity activity, Result result) {
        try {
            GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .build();
            GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(activity, options);
            scanner.startScan()
                    .addOnSuccessListener(barcode -> result.done(json("text", barcode.getRawValue())))
                    .addOnCanceledListener(() -> result.done("{\"cancel\":true}"))
                    .addOnFailureListener(e -> result.done(json("error", "Lecture impossible : " + e.getMessage())));
        } catch (Exception e) {
            result.done(json("error", "Scanner indisponible : " + e.getMessage()));
        }
    }

    static void share(Activity activity, String text) {
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        activity.startActivity(Intent.createChooser(send, "Envoyer le code Radar"));
    }

    static String clipboard(Context ctx) {
        try {
            ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence t = clip.getItemAt(0).coerceToText(ctx);
            return t == null ? "" : t.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String json(String key, String value) {
        try {
            return new JSONObject().put(key, value == null ? "" : value).toString();
        } catch (Exception e) {
            return "{}";
        }
    }
}
