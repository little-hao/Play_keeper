package com.local.sgplaykeeper;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class RemoteConfigStore {
    static final class Config {
        final boolean enabled;
        final String endpoint;
        final String deviceId;
        final String token;

        Config(boolean enabled, String endpoint, String deviceId, String token) {
            this.enabled = enabled;
            this.endpoint = endpoint;
            this.deviceId = deviceId;
            this.token = token;
        }

        boolean isComplete() {
            return enabled && endpoint.startsWith("wss://")
                    && !deviceId.isBlank() && !token.isBlank();
        }
    }

    private static final String PREFS = "remote_connection";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_ENDPOINT = "endpoint";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final String KEY_TOKEN = "encrypted_token";
    private static final String KEY_ALIAS = "play_keeper_remote_token_v1";
    private static final String ANDROID_KEY_STORE = "AndroidKeyStore";

    private final SharedPreferences preferences;

    RemoteConfigStore(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    Config load() {
        String deviceId = preferences.getString(KEY_DEVICE_ID, "");
        if (deviceId == null || deviceId.isBlank()) {
            deviceId = createDeviceId();
            preferences.edit().putString(KEY_DEVICE_ID, deviceId).apply();
        }
        return new Config(
                preferences.getBoolean(KEY_ENABLED, false),
                safe(preferences.getString(KEY_ENDPOINT, "")),
                deviceId,
                decrypt(safe(preferences.getString(KEY_TOKEN, ""))));
    }

    boolean save(boolean enabled, String endpoint, String token) {
        String encrypted = encrypt(token);
        if (!token.isBlank() && encrypted.isBlank()) {
            return false;
        }
        preferences.edit()
                .putBoolean(KEY_ENABLED, enabled)
                .putString(KEY_ENDPOINT, endpoint.trim())
                .putString(KEY_TOKEN, encrypted)
                .apply();
        return true;
    }

    private String encrypt(String value) {
        if (value.isBlank()) {
            return "";
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            ByteBuffer buffer = ByteBuffer.allocate(4 + iv.length + encrypted.length);
            buffer.putInt(iv.length);
            buffer.put(iv);
            buffer.put(encrypted);
            return Base64.encodeToString(buffer.array(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        }
    }

    private String decrypt(String encoded) {
        if (encoded.isBlank()) {
            return "";
        }
        try {
            ByteBuffer buffer = ByteBuffer.wrap(Base64.decode(encoded, Base64.NO_WRAP));
            int ivLength = buffer.getInt();
            if (ivLength < 12 || ivLength > 16 || buffer.remaining() <= ivLength) {
                return "";
            }
            byte[] iv = new byte[ivLength];
            buffer.get(iv);
            byte[] encrypted = new byte[buffer.remaining()];
            buffer.get(encrypted);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "";
        }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEY_STORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private String createDeviceId() {
        byte[] bytes = new byte[6];
        new SecureRandom().nextBytes(bytes);
        StringBuilder value = new StringBuilder("PK-");
        for (byte item : bytes) {
            value.append(String.format("%02X", item));
        }
        return value.toString();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
