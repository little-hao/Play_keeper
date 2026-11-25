package com.local.sgplaykeeper;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Portable, data-only automation package. It never contains executable JavaScript. */
final class AutomationPackageFile {
    static final String FORMAT = "playkeeper.automation";
    static final int SCHEMA_VERSION = 1;
    static final int MAX_PACKAGE_BYTES = 256 * 1024;
    private static final int MAX_UNCOMPRESSED_BYTES = 128 * 1024;
    private static final int MAX_ENTRIES = 8;
    private static final String PACKAGE_ENTRY = "package.json";
    private static final String MANIFEST_ENTRY = "manifest.json";

    private AutomationPackageFile() {}

    static byte[] create(AutomationManifest manifest) {
        byte[] manifestBytes = manifest.canonicalJson.getBytes(StandardCharsets.UTF_8);
        try {
            JSONObject metadata = new JSONObject();
            metadata.put("format", FORMAT);
            metadata.put("schemaVersion", SCHEMA_VERSION);
            metadata.put("manifestPath", MANIFEST_ENTRY);
            metadata.put("manifestSha256", sha256(manifestBytes));
            metadata.put("scriptId", manifest.id);
            metadata.put("scriptVersion", manifest.version);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
                write(zip, PACKAGE_ENTRY, metadata.toString().getBytes(StandardCharsets.UTF_8));
                write(zip, MANIFEST_ENTRY, manifestBytes);
            }
            return output.toByteArray();
        } catch (JSONException | IOException error) {
            throw new IllegalArgumentException("无法生成自动化包", error);
        }
    }

    static AutomationManifest parse(byte[] packageBytes) {
        if (packageBytes == null || packageBytes.length == 0
                || packageBytes.length > MAX_PACKAGE_BYTES) {
            throw new IllegalArgumentException("自动化包大小必须在 1–256KB 之间");
        }
        byte[] metadataBytes = null;
        byte[] manifestBytes = null;
        int total = 0;
        int entries = 0;
        Set<String> names = new HashSet<>();
        try (ZipInputStream zip = new ZipInputStream(
                new ByteArrayInputStream(packageBytes), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries++;
                String name = entry.getName();
                if (entries > MAX_ENTRIES || entry.isDirectory() || !safeEntry(name)
                        || !names.add(name)) {
                    throw new IllegalArgumentException("自动化包包含非法或重复文件");
                }
                byte[] value = readEntry(zip, MAX_UNCOMPRESSED_BYTES - total);
                total += value.length;
                if (PACKAGE_ENTRY.equals(name)) metadataBytes = value;
                if (MANIFEST_ENTRY.equals(name)) manifestBytes = value;
            }
        } catch (IOException error) {
            throw new IllegalArgumentException("自动化包不是有效的 .pkauto 文件", error);
        }
        if (metadataBytes == null || manifestBytes == null) {
            throw new IllegalArgumentException("自动化包缺少 package.json 或 manifest.json");
        }
        try {
            JSONObject metadata = new JSONObject(new String(metadataBytes, StandardCharsets.UTF_8));
            if (!FORMAT.equals(metadata.optString("format"))
                    || metadata.optInt("schemaVersion") != SCHEMA_VERSION
                    || !MANIFEST_ENTRY.equals(metadata.optString("manifestPath"))) {
                throw new IllegalArgumentException("自动化包格式或版本不兼容");
            }
            String actualHash = sha256(manifestBytes);
            if (!actualHash.equals(metadata.optString("manifestSha256").toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("自动化包完整性校验失败");
            }
            AutomationManifest manifest = AutomationManifest.parse(
                    new String(manifestBytes, StandardCharsets.UTF_8));
            if (!manifest.id.equals(metadata.optString("scriptId"))
                    || !manifest.version.equals(metadata.optString("scriptVersion"))) {
                throw new IllegalArgumentException("自动化包元数据与清单不一致");
            }
            return manifest;
        } catch (JSONException error) {
            throw new IllegalArgumentException("自动化包元数据无效", error);
        }
    }

    static boolean looksLikePackage(byte[] bytes) {
        return bytes != null && bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K';
    }

    private static void write(ZipOutputStream zip, String name, byte[] value) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        entry.setTime(0L);
        zip.putNextEntry(entry);
        zip.write(value);
        zip.closeEntry();
    }

    private static byte[] readEntry(ZipInputStream zip, int remaining) throws IOException {
        if (remaining < 0) throw new IllegalArgumentException("自动化包解压后超过 128KB");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = zip.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            if (output.size() > remaining) {
                throw new IllegalArgumentException("自动化包解压后超过 128KB");
            }
        }
        return output.toByteArray();
    }

    private static boolean safeEntry(String name) {
        return PACKAGE_ENTRY.equals(name) || MANIFEST_ENTRY.equals(name);
    }

    private static String sha256(byte[] value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
            StringBuilder result = new StringBuilder();
            for (byte item : digest) result.append(String.format(Locale.ROOT, "%02x", item));
            return result.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }
}
