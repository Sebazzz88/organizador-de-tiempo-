package com.sebas.jardindetareas;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Bóveda cifrada de Agendita.
 *
 * Todo lo que la app guarda (tareas, notas, ajustes y avisos programados) pasa por aquí:
 * se cifra con AES-256-GCM usando una llave que vive en el Android Keystore (hardware seguro
 * del teléfono) y nunca sale de él. En disco solo queda texto cifrado y autenticado: si alguien
 * lo modifica, el descifrado falla en vez de entregar datos alterados.
 *
 * Formato de cada valor: [versión = 1][IV de 12 bytes][texto cifrado + etiqueta de 16 bytes], en Base64.
 * El nombre de cada valor se usa como dato asociado (AAD), así un valor no se puede mover a otro nombre.
 */
final class SecureStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "agendita_datos_v1";
    private static final String PREFS = "agendita_boveda";
    private static final byte VERSION = 1;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final Object LOCK = new Object();

    /** true si el último intento de leer encontró datos pero no pudo descifrarlos. */
    static volatile boolean lastReadFailed = false;

    private SecureStore() {}

    static String get(Context context, String name) {
        synchronized (LOCK) {
            lastReadFailed = false;
            String stored = prefs(context).getString(name, null);
            if (stored == null) return null;
            try {
                byte[] all = Base64.decode(stored, Base64.NO_WRAP);
                if (all.length <= 1 + IV_BYTES || all[0] != VERSION) throw new IllegalStateException("formato");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, all, 1, IV_BYTES));
                cipher.updateAAD(aad(name));
                byte[] plain = cipher.doFinal(all, 1 + IV_BYTES, all.length - 1 - IV_BYTES);
                return new String(plain, StandardCharsets.UTF_8);
            } catch (Exception e) {
                lastReadFailed = true;
                return null;
            }
        }
    }

    static boolean put(Context context, String name, String value) {
        synchronized (LOCK) {
            try {
                if (value == null) return prefs(context).edit().remove(name).commit();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key());
                cipher.updateAAD(aad(name));
                byte[] ct = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
                byte[] iv = cipher.getIV();
                if (iv == null || iv.length != IV_BYTES) return false;
                byte[] all = new byte[1 + IV_BYTES + ct.length];
                all[0] = VERSION;
                System.arraycopy(iv, 0, all, 1, IV_BYTES);
                System.arraycopy(ct, 0, all, 1 + IV_BYTES, ct.length);
                return prefs(context).edit().putString(name, Base64.encodeToString(all, Base64.NO_WRAP)).commit();
            } catch (Exception e) {
                return false;
            }
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static byte[] aad(String name) {
        return ("agendita:" + name).getBytes(StandardCharsets.UTF_8);
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return gen.generateKey();
    }
}
