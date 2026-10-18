import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;

/** Small cross-platform release helper backed by the Android apksig library. */
public final class ApkSignerMain {
    private ApkSignerMain() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 6) {
            throw new IllegalArgumentException(
                    "usage: ApkSignerMain <input> <output> <keystore> <alias> <storepass> <keypass>");
        }
        KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType());
        try (FileInputStream input = new FileInputStream(args[2])) {
            store.load(input, args[4].toCharArray());
        }
        PrivateKey key = (PrivateKey) store.getKey(args[3], args[5].toCharArray());
        List<X509Certificate> certificates = new ArrayList<>();
        for (Certificate certificate : store.getCertificateChain(args[3])) {
            certificates.add((X509Certificate) certificate);
        }
        ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder(
                args[3], key, certificates).build();
        new ApkSigner.Builder(List.of(signer))
                .setInputApk(new File(args[0]))
                .setOutputApk(new File(args[1]))
                .setV1SigningEnabled(true)
                .setV2SigningEnabled(true)
                .setV3SigningEnabled(true)
                .build()
                .sign();
        ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[1])).build().verify();
        if (!result.isVerified()) {
            throw new IllegalStateException("APK signature verification failed: " + result.getErrors());
        }
        System.out.println("verified v1=" + result.isVerifiedUsingV1Scheme()
                + " v2=" + result.isVerifiedUsingV2Scheme()
                + " v3=" + result.isVerifiedUsingV3Scheme());
        System.out.println("certificateSha256=" + bytesToHex(
                result.getSignerCertificates().get(0).getEncoded()));
    }

    private static String bytesToHex(byte[] certificate) throws Exception {
        byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(certificate);
        StringBuilder output = new StringBuilder();
        for (byte value : digest) output.append(String.format("%02x", value));
        return output.toString();
    }
}
