package com.leico.radar;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Requêtes réseau du moteur (sans les restrictions CORS d'une page web). Réponse au format JSON. */
public final class Http {
    private static final int MAX_BYTES = 4 * 1024 * 1024;
    private static final Pattern CHARSET = Pattern.compile("charset=[\"']?([\\w\\-]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern XML_ENC = Pattern.compile("encoding=[\"']([\\w\\-]+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern META_CHARSET = Pattern.compile("<meta[^>]+charset=[\"']?([\\w\\-]+)", Pattern.CASE_INSENSITIVE);

    private Http() {}

    public static String request(String reqJson) {
        String first = attempt(reqJson);
        // Coupure réseau passagère (changement 5G / Wi-Fi) : deux nouveaux essais.
        for (int i = 0; i < 2 && first.contains("\"error\"") && first.contains("UnknownHost"); i++) {
            try { Thread.sleep(2000L * (i + 1)); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
            first = attempt(reqJson);
        }
        return first;
    }

    private static String attempt(String reqJson) {
        try {
            JSONObject req = new JSONObject(reqJson);
            String method = req.optString("method", "GET").toUpperCase(Locale.ROOT);
            int timeout = Math.max(3000, req.optInt("timeout", 30000));
            JSONObject headers = req.optJSONObject("headers");
            String body = req.isNull("body") ? null : req.optString("body", null);
            URL url = new URL(req.getString("url"));

            for (int hop = 0; hop < 7; hop++) {
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(Math.min(timeout, 15000));
                c.setReadTimeout(timeout);
                c.setRequestMethod(method);
                if (headers != null) {
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        if (!"accept-encoding".equalsIgnoreCase(k)) c.setRequestProperty(k, headers.optString(k));
                    }
                }
                if (body != null && !"GET".equals(method)) {
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    c.setDoOutput(true);
                    c.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
                }
                int status = c.getResponseCode();
                String location = c.getHeaderField("Location");
                if (status >= 300 && status < 400 && location != null) {
                    url = new URL(url, location);
                    if (status == 303 || ((status == 301 || status == 302) && "POST".equals(method))) {
                        method = "GET";
                        body = null;
                    }
                    c.disconnect();
                    continue;
                }
                InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                byte[] data = in == null ? new byte[0] : readAll(in);
                JSONObject h = new JSONObject();
                for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                    if (e.getKey() != null && e.getValue() != null && !e.getValue().isEmpty()) h.put(e.getKey().toLowerCase(Locale.ROOT), e.getValue().get(0));
                }
                String text = decode(data, c.getContentType());
                c.disconnect();
                return new JSONObject().put("status", status).put("url", url.toString()).put("headers", h).put("body", text).toString();
            }
            return err("trop de redirections");
        } catch (java.net.SocketTimeoutException e) {
            return err("délai dépassé");
        } catch (Exception e) {
            return err(e.getClass().getSimpleName() + " : " + e.getMessage());
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n, total = 0;
            while ((n = is.read(buf)) > 0) {
                total += n;
                if (total > MAX_BYTES) break;
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    // Encodage : en-tête HTTP, sinon déclaration XML / balise meta (sites chinois en GB2312/GBK), sinon UTF-8.
    private static String decode(byte[] data, String contentType) {
        String name = null;
        if (contentType != null) {
            Matcher m = CHARSET.matcher(contentType);
            if (m.find()) name = m.group(1);
        }
        if (name == null) {
            String head = new String(data, 0, Math.min(data.length, 2048), StandardCharsets.ISO_8859_1);
            Matcher m = XML_ENC.matcher(head);
            if (m.find()) name = m.group(1);
            else {
                m = META_CHARSET.matcher(head);
                if (m.find()) name = m.group(1);
            }
        }
        Charset cs = StandardCharsets.UTF_8;
        if (name != null) {
            String n = name.toLowerCase(Locale.ROOT);
            if (n.equals("gb2312") || n.equals("gbk") || n.equals("gb18030")) n = "GB18030";
            try { cs = Charset.forName(n); } catch (Exception ignored) { cs = StandardCharsets.UTF_8; }
        }
        return new String(data, cs);
    }

    private static String err(String message) {
        try {
            return new JSONObject().put("error", message).toString();
        } catch (Exception e) {
            return "{\"error\":\"erreur réseau\"}";
        }
    }
}
