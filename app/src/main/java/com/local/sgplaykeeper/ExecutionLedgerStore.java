package com.local.sgplaykeeper;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Small durable journal for remote plan steps.  The server may resend the same
 * step after a network interruption; a completed local step must never execute
 * twice merely because its acknowledgement was lost.
 */
final class ExecutionLedgerStore {
    static final String RUNNING = "running";
    static final String COMPLETED = "completed";
    static final String FAILED = "failed";

    private static final String PREFS = "remote_execution_ledger_v1";
    private static final String KEY_ENTRIES = "entries";
    private static final int MAX_ENTRIES = 160;

    static final class Entry {
        final String stepId;
        final String command;
        final int accountIndex;
        final String status;
        final boolean success;
        final String message;
        final long acceptedAt;
        final long finishedAt;

        Entry(String stepId, String command, int accountIndex, String status,
              boolean success, String message, long acceptedAt, long finishedAt) {
            this.stepId = stepId;
            this.command = command;
            this.accountIndex = accountIndex;
            this.status = status;
            this.success = success;
            this.message = message;
            this.acceptedAt = acceptedAt;
            this.finishedAt = finishedAt;
        }

        boolean isFinal() {
            return COMPLETED.equals(status) || FAILED.equals(status);
        }
    }

    private final SharedPreferences preferences;

    ExecutionLedgerStore(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        failInterruptedSteps();
    }

    synchronized Entry find(String stepId) {
        if (stepId == null || stepId.isBlank()) return null;
        for (Entry entry : readEntries()) {
            if (stepId.equals(entry.stepId)) return entry;
        }
        return null;
    }

    synchronized void markRunning(String stepId, String command, int accountIndex) {
        List<Entry> entries = readEntries();
        entries.removeIf(entry -> stepId.equals(entry.stepId));
        entries.add(0, new Entry(stepId, trim(command, 80), accountIndex, RUNNING,
                false, "", System.currentTimeMillis(), 0L));
        writeEntries(entries);
    }

    synchronized void finish(String stepId, boolean success, String message) {
        if (stepId == null || stepId.isBlank()) return;
        List<Entry> entries = readEntries();
        Entry previous = null;
        for (Entry entry : entries) {
            if (stepId.equals(entry.stepId)) {
                previous = entry;
                break;
            }
        }
        entries.removeIf(entry -> stepId.equals(entry.stepId));
        long acceptedAt = previous == null ? System.currentTimeMillis() : previous.acceptedAt;
        entries.add(0, new Entry(stepId, previous == null ? "" : previous.command,
                previous == null ? -1 : previous.accountIndex,
                success ? COMPLETED : FAILED, success, trim(message, 240),
                acceptedAt, System.currentTimeMillis()));
        writeEntries(entries);
    }

    synchronized JSONArray toTelemetry() {
        JSONArray result = new JSONArray();
        for (Entry entry : readEntries()) {
            try {
                JSONObject value = new JSONObject();
                value.put("stepId", entry.stepId);
                value.put("command", entry.command);
                value.put("accountIndex", entry.accountIndex);
                value.put("status", entry.status);
                value.put("success", entry.success);
                value.put("message", entry.message);
                value.put("acceptedAt", entry.acceptedAt);
                value.put("finishedAt", entry.finishedAt);
                result.put(value);
            } catch (JSONException ignored) {
                // Values are app-controlled primitives.
            }
        }
        return result;
    }

    private List<Entry> readEntries() {
        List<Entry> result = new ArrayList<>();
        String source = preferences.getString(KEY_ENTRIES, "[]");
        try {
            JSONArray array = new JSONArray(source == null ? "[]" : source);
            for (int index = 0; index < array.length() && result.size() < MAX_ENTRIES; index++) {
                JSONObject value = array.optJSONObject(index);
                if (value == null) continue;
                String stepId = value.optString("stepId", "").trim();
                if (stepId.isEmpty()) continue;
                result.add(new Entry(stepId, value.optString("command", ""),
                        value.optInt("accountIndex", -1), value.optString("status", RUNNING),
                        value.optBoolean("success", false), value.optString("message", ""),
                        value.optLong("acceptedAt", 0L), value.optLong("finishedAt", 0L)));
            }
        } catch (JSONException ignored) {
            // A corrupt journal is replaced by the next valid step instead of
            // blocking all remote operation.
        }
        return result;
    }

    private void failInterruptedSteps() {
        List<Entry> entries = readEntries();
        boolean changed = false;
        long now = System.currentTimeMillis();
        for (int index = 0; index < entries.size(); index++) {
            Entry entry = entries.get(index);
            if (!RUNNING.equals(entry.status)) continue;
            entries.set(index, new Entry(entry.stepId, entry.command, entry.accountIndex,
                    FAILED, false, "APP进程重启前步骤结果不明，需与VPS对账",
                    entry.acceptedAt, now));
            changed = true;
        }
        if (changed) writeEntries(entries);
    }

    private void writeEntries(List<Entry> entries) {
        JSONArray array = new JSONArray();
        for (int index = 0; index < entries.size() && index < MAX_ENTRIES; index++) {
            Entry entry = entries.get(index);
            try {
                JSONObject value = new JSONObject();
                value.put("stepId", entry.stepId);
                value.put("command", entry.command);
                value.put("accountIndex", entry.accountIndex);
                value.put("status", entry.status);
                value.put("success", entry.success);
                value.put("message", entry.message);
                value.put("acceptedAt", entry.acceptedAt);
                value.put("finishedAt", entry.finishedAt);
                array.put(value);
            } catch (JSONException ignored) {
                // Continue with the remaining valid entries.
            }
        }
        preferences.edit().putString(KEY_ENTRIES, array.toString()).commit();
    }

    private static String trim(String value, int limit) {
        String text = value == null ? "" : value.replace('\n', ' ').replace('\r', ' ').trim();
        return text.length() <= limit ? text : text.substring(0, limit);
    }
}
