package com.local.sgplaykeeper;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

final class BatteryMonitor {
    interface Listener {
        void onBatterySnapshot(Snapshot snapshot);
    }

    static final class Snapshot {
        final long timestamp;
        final int levelPercent;
        final int status;
        final int plugType;
        final double temperatureC;
        final int voltageMv;
        final Integer currentNowMa;
        final Integer currentAverageMa;
        final Integer chargeCounterMah;
        final Double estimatedPowerW;
        final int thermalStatus;
        final boolean powerSaveMode;

        Snapshot(long timestamp, int levelPercent, int status, int plugType,
                 double temperatureC, int voltageMv, Integer currentNowMa,
                 Integer currentAverageMa, Integer chargeCounterMah,
                 Double estimatedPowerW, int thermalStatus, boolean powerSaveMode) {
            this.timestamp = timestamp;
            this.levelPercent = levelPercent;
            this.status = status;
            this.plugType = plugType;
            this.temperatureC = temperatureC;
            this.voltageMv = voltageMv;
            this.currentNowMa = currentNowMa;
            this.currentAverageMa = currentAverageMa;
            this.chargeCounterMah = chargeCounterMah;
            this.estimatedPowerW = estimatedPowerW;
            this.thermalStatus = thermalStatus;
            this.powerSaveMode = powerSaveMode;
        }

        String compactLabel() {
            if (levelPercent < 0) {
                return "电量 --";
            }
            if (Double.isNaN(temperatureC)) {
                return levelPercent + "%";
            }
            return String.format(Locale.CHINA, "%d%%·%.0f°", levelPercent, temperatureC);
        }

        String detailText() {
            StringBuilder text = new StringBuilder();
            text.append("电量：").append(levelPercent >= 0 ? levelPercent + "%" : "不可用");
            text.append("\n状态：").append(statusLabel(status));
            text.append("\n供电：").append(plugLabel(plugType));
            text.append("\n温度：").append(Double.isNaN(temperatureC)
                    ? "不可用" : String.format(Locale.CHINA, "%.1f°C", temperatureC));
            text.append("\n电压：").append(voltageMv > 0 ? voltageMv + " mV" : "不可用");
            text.append("\n瞬时电流：").append(valueOrUnavailable(currentNowMa, " mA"));
            text.append("\n平均电流：").append(valueOrUnavailable(currentAverageMa, " mA"));
            text.append("\n剩余电量计数：").append(valueOrUnavailable(chargeCounterMah, " mAh"));
            text.append("\n估算净功率：").append(estimatedPowerW == null
                    ? "不可用" : String.format(Locale.CHINA, "%.2f W", estimatedPowerW));
            text.append("\n热状态：").append(thermalLabel(thermalStatus));
            text.append("\n省电模式：").append(powerSaveMode ? "已开启" : "未开启");
            text.append("\n\n说明：电流和功率是整机电池净流入/流出估算，不是单独 APP 的精确耗电。");
            return text.toString();
        }

        JSONObject toJson() throws JSONException {
            JSONObject json = new JSONObject();
            json.put("timestamp", timestamp);
            json.put("levelPercent", levelPercent);
            json.put("status", statusLabel(status));
            json.put("plugType", plugLabel(plugType));
            json.put("temperatureC", Double.isNaN(temperatureC) ? JSONObject.NULL : temperatureC);
            json.put("voltageMv", voltageMv > 0 ? voltageMv : JSONObject.NULL);
            json.put("currentNowMa", currentNowMa == null ? JSONObject.NULL : currentNowMa);
            json.put("currentAverageMa", currentAverageMa == null ? JSONObject.NULL : currentAverageMa);
            json.put("chargeCounterMah", chargeCounterMah == null ? JSONObject.NULL : chargeCounterMah);
            json.put("estimatedPowerW", estimatedPowerW == null ? JSONObject.NULL : estimatedPowerW);
            json.put("thermalStatus", thermalLabel(thermalStatus));
            json.put("powerSaveMode", powerSaveMode);
            return json;
        }

        private static String valueOrUnavailable(Integer value, String suffix) {
            return value == null ? "不可用" : value + suffix;
        }

        private static String statusLabel(int status) {
            switch (status) {
                case BatteryManager.BATTERY_STATUS_CHARGING:
                    return "充电中";
                case BatteryManager.BATTERY_STATUS_DISCHARGING:
                    return "放电中";
                case BatteryManager.BATTERY_STATUS_FULL:
                    return "已充满";
                case BatteryManager.BATTERY_STATUS_NOT_CHARGING:
                    return "未充电";
                default:
                    return "未知";
            }
        }

        private static String plugLabel(int plugType) {
            if ((plugType & BatteryManager.BATTERY_PLUGGED_AC) != 0) {
                return "交流电源";
            }
            if ((plugType & BatteryManager.BATTERY_PLUGGED_USB) != 0) {
                return "USB";
            }
            if ((plugType & BatteryManager.BATTERY_PLUGGED_WIRELESS) != 0) {
                return "无线充电";
            }
            return "未接电源";
        }

        private static String thermalLabel(int status) {
            switch (status) {
                case PowerManager.THERMAL_STATUS_LIGHT:
                    return "轻微";
                case PowerManager.THERMAL_STATUS_MODERATE:
                    return "中等";
                case PowerManager.THERMAL_STATUS_SEVERE:
                    return "严重";
                case PowerManager.THERMAL_STATUS_CRITICAL:
                    return "危险";
                case PowerManager.THERMAL_STATUS_EMERGENCY:
                    return "紧急";
                case PowerManager.THERMAL_STATUS_SHUTDOWN:
                    return "即将关机";
                default:
                    return "正常";
            }
        }
    }

    private static final long SAMPLE_INTERVAL_MS = 15_000L;
    private final Context context;
    private final Listener listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable sampler = new Runnable() {
        @Override
        public void run() {
            listener.onBatterySnapshot(readSnapshot());
            handler.postDelayed(this, SAMPLE_INTERVAL_MS);
        }
    };

    BatteryMonitor(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    void start() {
        handler.removeCallbacks(sampler);
        handler.post(sampler);
    }

    void stop() {
        handler.removeCallbacks(sampler);
    }

    private Snapshot readSnapshot() {
        Intent battery = context.registerReceiver(
                null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int level = -1;
        int status = BatteryManager.BATTERY_STATUS_UNKNOWN;
        int plugged = 0;
        double temperature = Double.NaN;
        int voltage = -1;
        if (battery != null) {
            int rawLevel = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (rawLevel >= 0 && scale > 0) {
                level = Math.round(rawLevel * 100f / scale);
            }
            status = battery.getIntExtra(BatteryManager.EXTRA_STATUS,
                    BatteryManager.BATTERY_STATUS_UNKNOWN);
            plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            int rawTemperature = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,
                    Integer.MIN_VALUE);
            if (rawTemperature != Integer.MIN_VALUE) {
                temperature = rawTemperature / 10d;
            }
            voltage = battery.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1);
        }

        BatteryManager batteryManager =
                (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
        Integer currentNow = propertyAsMilli(batteryManager, BatteryManager.BATTERY_PROPERTY_CURRENT_NOW);
        Integer currentAverage = propertyAsMilli(
                batteryManager, BatteryManager.BATTERY_PROPERTY_CURRENT_AVERAGE);
        Integer chargeCounter = propertyAsMilli(
                batteryManager, BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER);
        Double power = currentNow != null && voltage > 0
                ? (voltage / 1000d) * (currentNow / 1000d)
                : null;

        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        int thermalStatus = Build.VERSION.SDK_INT >= 29
                ? powerManager.getCurrentThermalStatus()
                : 0;
        return new Snapshot(System.currentTimeMillis(), level, status, plugged,
                temperature, voltage, currentNow, currentAverage, chargeCounter,
                power, thermalStatus, powerManager.isPowerSaveMode());
    }

    private Integer propertyAsMilli(BatteryManager manager, int property) {
        int raw = manager.getIntProperty(property);
        if (raw == Integer.MIN_VALUE) {
            return null;
        }
        return Math.round(raw / 1000f);
    }
}
