package com.leico.radar;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URL;
import java.net.UnknownHostException;
import java.util.Collections;
import java.util.concurrent.ConcurrentHashMap;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import org.json.JSONArray;
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
        // Coupure passagère (changement 5G / Wi-Fi, connexion interrompue) : deux nouveaux essais.
        for (int i = 0; i < 2 && isTransient(first); i++) {
            try { Thread.sleep(1500L * (i + 1)); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
            first = attempt(reqJson);
        }
        return first;
    }

    private static boolean isTransient(String res) {
        if (!res.startsWith("{\"error\"")) return false;
        return res.contains("UnknownHost") || res.contains("ConnectException") || res.contains("SocketException")
            || res.contains("SSLException") || res.contains("EOFException") || res.contains("ProtocolException");
    }

    // ---------- Résolution de secours (DNS chiffré) ----------
    // Certains réseaux, VPN, bloqueurs ou « DNS privé » ne trouvent pas l'adresse de certains serveurs
    // (ex. generativelanguage.googleapis.com) alors qu'Internet fonctionne. On demande alors l'adresse
    // directement à Cloudflare (1.1.1.1) ou Google (8.8.8.8) en HTTPS, puis on se connecte à cette adresse
    // en présentant le vrai nom du serveur (certificat vérifié normalement).
    private static final long DOH_TTL = 30 * 60 * 1000L;
    private static final Map<String, String[]> dohCache = new ConcurrentHashMap<>();   // hôte -> {ip, expiration}
    private static final java.util.Set<String> dohHosts = Collections.newSetFromMap(new ConcurrentHashMap<>());

    private static String resolveDoh(String host) throws Exception {
        String[] c = dohCache.get(host);
        if (c != null && Long.parseLong(c[1]) > System.currentTimeMillis()) return c[0];
        String[] servers = {
            "https://1.1.1.1/dns-query?type=A&name=", "https://8.8.8.8/resolve?type=A&name=",
            "https://1.0.0.1/dns-query?type=A&name=", "https://8.8.4.4/resolve?type=A&name=" };
        Exception last = null;
        for (String srv : servers) {
            try {
                HttpURLConnection c2 = (HttpURLConnection) new URL(srv + host).openConnection();
                c2.setConnectTimeout(6000);
                c2.setReadTimeout(6000);
                c2.setRequestProperty("Accept", "application/dns-json");
                String body = new String(readAll(c2.getInputStream()), StandardCharsets.UTF_8);
                c2.disconnect();
                JSONArray ans = new JSONObject(body).optJSONArray("Answer");
                if (ans == null) continue;
                for (int i = 0; i < ans.length(); i++) {
                    JSONObject a = ans.getJSONObject(i);
                    if (a.optInt("type", 0) == 1) {
                        String ip = a.getString("data");
                        dohCache.put(host, new String[] { ip, String.valueOf(System.currentTimeMillis() + DOH_TTL) });
                        return ip;
                    }
                }
            } catch (Exception e) { last = e; }
        }
        throw new UnknownHostException(host + " (DNS de secours aussi en échec" + (last != null ? " : " + last.getClass().getSimpleName() : "") + ")");
    }

    /** Réponse d'un échange HTTP. */
    static final class Resp {
        int status;
        final Map<String, String> headers = new java.util.LinkedHashMap<>();
        byte[] body = new byte[0];
    }

    /**
     * Échange HTTP/1.1 direct avec l'adresse obtenue par le DNS de secours. Le vrai nom du serveur est annoncé
     * dans la poignée de main TLS (SNI) et le certificat est vérifié pour ce nom.
     */
    static Resp rawHop(URL url, String method, Map<String, String> headers, byte[] body, int timeout) throws Exception {
        String host = url.getHost();
        boolean https = "https".equalsIgnoreCase(url.getProtocol());
        int port = url.getPort() > 0 ? url.getPort() : (https ? 443 : 80);
        String ip = resolveDoh(host);
        Socket raw = new Socket();
        raw.connect(new java.net.InetSocketAddress(ip, port), Math.min(timeout, 15000));
        raw.setSoTimeout(timeout);
        Socket s = raw;
        try {
            if (https) {
                SSLSocket ss = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(raw, host, port, true);
                SSLParameters p = ss.getSSLParameters();
                p.setServerNames(Collections.singletonList(new SNIHostName(host)));
                ss.setSSLParameters(p);
                s = ss;
                ss.startHandshake();
                if (!certMatches(host, ss.getSession())) {
                    throw new javax.net.ssl.SSLPeerUnverifiedException("certificat non valable pour " + host);
                }
            }
            StringBuilder sb = new StringBuilder();
            String path = url.getFile().isEmpty() ? "/" : url.getFile();
            sb.append(method).append(' ').append(path).append(" HTTP/1.1\r\n");
            sb.append("Host: ").append(url.getPort() > 0 ? host + ":" + url.getPort() : host).append("\r\n");
            sb.append("Connection: close\r\nAccept-Encoding: identity\r\n");
            if (headers != null) {
                for (Map.Entry<String, String> e : headers.entrySet()) {
                    String k = e.getKey().toLowerCase(Locale.ROOT);
                    if (k.equals("host") || k.equals("connection") || k.equals("accept-encoding") || k.equals("content-length")) continue;
                    sb.append(e.getKey()).append(": ").append(e.getValue().replace("\r", "").replace("\n", "")).append("\r\n");
                }
            }
            if (body != null) sb.append("Content-Length: ").append(body.length).append("\r\n");
            sb.append("\r\n");
            OutputStream os = s.getOutputStream();
            os.write(sb.toString().getBytes(StandardCharsets.UTF_8));
            if (body != null) os.write(body);
            os.flush();

            InputStream in = new java.io.BufferedInputStream(s.getInputStream());
            Resp r = new Resp();
            do {                                                         // ignore les réponses « 100 Continue »
                String line = readLine(in);
                if (line == null) throw new java.io.EOFException("réponse vide");
                String[] parts = line.split(" ", 3);
                r.status = Integer.parseInt(parts[1].trim());
                r.headers.clear();
                String h;
                while ((h = readLine(in)) != null && !h.isEmpty()) {
                    int i = h.indexOf(':');
                    if (i > 0) {
                        String k = h.substring(0, i).trim().toLowerCase(Locale.ROOT);
                        if (!r.headers.containsKey(k)) r.headers.put(k, h.substring(i + 1).trim());
                    }
                }
            } while (r.status >= 100 && r.status < 200);
            if ("HEAD".equals(method) || r.status == 204 || r.status == 304) return r;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            String te = r.headers.get("transfer-encoding");
            if (te != null && te.toLowerCase(Locale.ROOT).contains("chunked")) {
                while (true) {
                    String sz = readLine(in);
                    if (sz == null) break;
                    int semi = sz.indexOf(';');
                    int n = Integer.parseInt((semi >= 0 ? sz.substring(0, semi) : sz).trim(), 16);
                    if (n == 0) break;
                    copy(in, out, n);
                    readLine(in);
                    if (out.size() > MAX_BYTES) break;
                }
            } else if (r.headers.containsKey("content-length")) {
                copy(in, out, (int) Math.min(MAX_BYTES, Long.parseLong(r.headers.get("content-length").trim())));
            } else {
                copy(in, out, MAX_BYTES);
            }
            r.body = out.toByteArray();
            return r;
        } finally {
            try { s.close(); } catch (Exception ignored) { }
        }
    }

    /** Le certificat (déjà validé par la chaîne de confiance du système) est-il bien celui de ce nom ? */
    static boolean certMatches(String host, javax.net.ssl.SSLSession session) {
        try {
            java.security.cert.X509Certificate cert = (java.security.cert.X509Certificate) session.getPeerCertificates()[0];
            java.util.Collection<List<?>> sans = cert.getSubjectAlternativeNames();
            if (sans == null) return false;
            String h = host.toLowerCase(Locale.ROOT);
            for (List<?> san : sans) {
                if (san.size() < 2 || !Integer.valueOf(2).equals(san.get(0))) continue;      // 2 = nom DNS
                String n = String.valueOf(san.get(1)).toLowerCase(Locale.ROOT);
                if (n.equals(h)) return true;
                if (n.startsWith("*.")) {
                    String suffix = n.substring(1);                                         // ".googleapis.com"
                    if (h.endsWith(suffix) && h.indexOf('.') == h.length() - suffix.length()) return true;
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    private static String readLine(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 65536) break;
        }
        if (c == -1 && b.size() == 0) return null;
        return new String(b.toByteArray(), StandardCharsets.ISO_8859_1);
    }

    private static void copy(InputStream in, ByteArrayOutputStream out, int max) throws java.io.IOException {
        byte[] buf = new byte[16384];
        int left = max;
        while (left > 0) {
            int n = in.read(buf, 0, Math.min(buf.length, left));
            if (n < 0) break;
            out.write(buf, 0, n);
            left -= n;
        }
    }

    private static String attempt(String reqJson) {
        String r = attempt(reqJson, false);
        if (r.startsWith("{\"error\"") && r.contains("UnknownHost") && !r.contains("DNS de secours")) {
            // Adresse introuvable alors qu'Internet peut fonctionner : nouvel essai via le DNS de secours.
            String r2 = attempt(reqJson, true);
            if (!r2.startsWith("{\"error\"")) {
                try { dohHosts.add(new URL(new JSONObject(reqJson).getString("url")).getHost()); } catch (Exception ignored) { }
            }
            return r2;
        }
        return r;
    }

    private static String attempt(String reqJson, boolean forceDoh) {
        try {
            JSONObject req = new JSONObject(reqJson);
            String method = req.optString("method", "GET").toUpperCase(Locale.ROOT);
            int timeout = Math.max(3000, req.optInt("timeout", 30000));
            JSONObject headers = req.optJSONObject("headers");
            String body = req.isNull("body") ? null : req.optString("body", null);
            URL url = new URL(req.getString("url"));

            for (int hop = 0; hop < 7; hop++) {
                boolean doh = forceDoh || dohHosts.contains(url.getHost());
                int status;
                String location, contentType;
                byte[] data;
                JSONObject h = new JSONObject();
                if (doh) {
                    Map<String, String> hm = new java.util.LinkedHashMap<>();
                    if (headers != null) {
                        Iterator<String> keys = headers.keys();
                        while (keys.hasNext()) { String k = keys.next(); hm.put(k, headers.optString(k)); }
                    }
                    byte[] bytes = body != null && !"GET".equals(method) ? body.getBytes(StandardCharsets.UTF_8) : null;
                    Resp r = rawHop(url, method, hm, bytes, timeout);
                    status = r.status;
                    location = r.headers.get("location");
                    contentType = r.headers.get("content-type");
                    data = r.body;
                    for (Map.Entry<String, String> e : r.headers.entrySet()) h.put(e.getKey(), e.getValue());
                } else {
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
                    status = c.getResponseCode();
                    location = c.getHeaderField("Location");
                    contentType = c.getContentType();
                    if (status >= 300 && status < 400 && location != null) {
                        data = new byte[0];
                    } else {
                        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                        data = in == null ? new byte[0] : readAll(in);
                        for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                            if (e.getKey() != null && e.getValue() != null && !e.getValue().isEmpty()) h.put(e.getKey().toLowerCase(Locale.ROOT), e.getValue().get(0));
                        }
                    }
                    c.disconnect();
                }
                if (status >= 300 && status < 400 && location != null) {
                    url = new URL(url, location);
                    if (status == 303 || ((status == 301 || status == 302) && "POST".equals(method))) {
                        method = "GET";
                        body = null;
                    }
                    continue;
                }
                String text = decode(data, contentType);
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
