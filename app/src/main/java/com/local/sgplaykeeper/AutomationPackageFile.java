package com.local.sgplaykeeper;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.security.interfaces.ECPublicKey;
import java.util.Base64;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Portable, data-only automation package. It never contains executable JavaScript. */
final class AutomationPackageFile {
    static final String FORMAT = "playkeeper.automation";
    static final int SCHEMA_VERSION = 2;
    private static final int LEGACY_SCHEMA_VERSION = 1;
    static final int MAX_PACKAGE_BYTES = 256 * 1024;
    private static final int MAX_UNCOMPRESSED_BYTES = 128 * 1024;
    private static final int MAX_ENTRIES = 8;
    private static final String PACKAGE_ENTRY = "package.json";
    private static final String MANIFEST_ENTRY = "manifest.json";

    private AutomationPackageFile() {}

    static final class Inspection {
        final AutomationManifest manifest;
        final boolean signatureVerified;
        final String publisherName;
        final String publisherFingerprint;

        Inspection(AutomationManifest manifest, boolean signatureVerified,
                   String publisherName, String publisherFingerprint) {
            this.manifest = manifest;
            this.signatureVerified = signatureVerified;
            this.publisherName = publisherName;
            this.publisherFingerprint = publisherFingerprint;
        }
    }

    static byte[] create(AutomationManifest manifest) {
        return createPackage(manifest, null, null, null);
    }

    static byte[] createSigned(AutomationManifest manifest, String publisherName,
                               PublicKey publicKey, PrivateKey privateKey) {
        if (publisherName == null || publisherName.trim().isEmpty()
                || publisherName.length() > 80) {
            throw new IllegalArgumentException("发布者名称必须在 1–80 个字符之间");
        }
        if (!(publicKey instanceof ECPublicKey) || privateKey == null
                || ((ECPublicKey) publicKey).getParams().getCurve().getField().getFieldSize() != 256) {
            throw new IllegalArgumentException("发布者必须使用 EC P-256 密钥");
        }
        return createPackage(manifest, publisherName.trim(), publicKey, privateKey);
    }

    private static byte[] createPackage(AutomationManifest manifest, String publisherName,
                                        PublicKey publicKey, PrivateKey privateKey) {
        byte[] manifestBytes = manifest.canonicalJson.getBytes(StandardCharsets.UTF_8);
        try {
            JSONObject metadata = new JSONObject();
            metadata.put("format", FORMAT);
            metadata.put("schemaVersion", SCHEMA_VERSION);
            metadata.put("manifestPath", MANIFEST_ENTRY);
            metadata.put("manifestSha256", sha256(manifestBytes));
            metadata.put("scriptId", manifest.id);
            metadata.put("scriptVersion", manifest.version);
            if (publicKey != null) {
                String publicKeyBase64 = Base64.getEncoder().encodeToString(publicKey.getEncoded());
                String fingerprint = sha256(publicKey.getEncoded());
                byte[] payload = signaturePayload(manifestBytes, manifest.id, manifest.version,
                        publisherName, fingerprint);
                Signature signer = Signature.getInstance("SHA256withECDSA");
                signer.initSign(privateKey);
                signer.update(payload);
                JSONObject publisher = new JSONObject();
                publisher.put("name", publisherName);
                publisher.put("algorithm", "SHA256withECDSA");
                publisher.put("publicKeySpki", publicKeyBase64);
                publisher.put("fingerprintSha256", fingerprint);
                publisher.put("signature", Base64.getEncoder().encodeToString(signer.sign()));
                metadata.put("publisher", publisher);
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
                write(zip, PACKAGE_ENTRY, metadata.toString().getBytes(StandardCharsets.UTF_8));
                write(zip, MANIFEST_ENTRY, manifestBytes);
            }
            return output.toByteArray();
        } catch (JSONException | IOException | GeneralSecurityException error) {
            throw new IllegalArgumentException("无法生成自动化包", error);
        }
    }

    static AutomationManifest parse(byte[] packageBytes) {
        return inspect(packageBytes).manifest;
    }

    static Inspection inspect(byte[] packageBytes) {
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
            int schemaVersion = metadata.optInt("schemaVersion");
            if (!FORMAT.equals(metadata.optString("format"))
                    || (schemaVersion != LEGACY_SCHEMA_VERSION && schemaVersion != SCHEMA_VERSION)
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
            if (schemaVersion == LEGACY_SCHEMA_VERSION || !metadata.has("publisher")) {
                return new Inspection(manifest, false, "未签名发布者", "");
            }
            JSONObject publisher = metadata.getJSONObject("publisher");
            String publisherName = publisher.getString("name").trim();
            String algorithm = publisher.getString("algorithm");
            byte[] publicKeyBytes = Base64.getDecoder().decode(publisher.getString("publicKeySpki"));
            String fingerprint = sha256(publicKeyBytes);
            if (publisherName.isEmpty() || publisherName.length() > 80
                    || !"SHA256withECDSA".equals(algorithm)
                    || !fingerprint.equals(publisher.optString("fingerprintSha256").toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("自动化包发布者信息无效");
            }
            PublicKey publicKey = KeyFactory.getInstance("EC")
                    .generatePublic(new X509EncodedKeySpec(publicKeyBytes));
            if (!(publicKey instanceof ECPublicKey)
                    || ((ECPublicKey) publicKey).getParams().getCurve().getField().getFieldSize() != 256) {
                throw new IllegalArgumentException("发布者必须使用 EC P-256 密钥");
            }
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(publicKey);
            verifier.update(signaturePayload(manifestBytes, manifest.id, manifest.version,
                    publisherName, fingerprint));
            byte[] signature = Base64.getDecoder().decode(publisher.getString("signature"));
            if (!verifier.verify(signature)) {
                throw new IllegalArgumentException("自动化包发布者签名验证失败");
            }
            return new Inspection(manifest, true, publisherName, fingerprint);
        } catch (JSONException | GeneralSecurityException | IllegalArgumentException error) {
            if (error instanceof IllegalArgumentException
                    && !(error.getCause() instanceof JSONException)) {
                throw (IllegalArgumentException) error;
            }
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

    private static byte[] signaturePayload(byte[] manifestBytes, String id, String version,
                                           String publisherName, String fingerprint) {
        String header = FORMAT + "\n" + SCHEMA_VERSION + "\n" + sha256(manifestBytes)
                + "\n" + id + "\n" + version + "\n" + publisherName + "\n" + fingerprint;
        return header.getBytes(StandardCharsets.UTF_8);
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
