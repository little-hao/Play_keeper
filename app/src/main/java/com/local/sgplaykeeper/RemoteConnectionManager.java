package com.local.sgplaykeeper;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

final class RemoteConnectionManager {
    enum State {
        DISABLED,
        CONNECTING,
        CONNECTED,
        ERROR
    }

    interface Listener {
        void onRemoteStateChanged(State state, String message);

        void onRemoteCommand(String commandId, String command, JSONObject parameters);

        JSONObject createTelemetry();
    }

    private static final long[] RECONNECT_DELAYS_MS = {
            2_000L, 5_000L, 15_000L, 30_000L, 60_000L
    };
    private static final int MAX_MESSAGE_CHARS = 262_144;

    private final Listener listener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();

    private RemoteConfigStore.Config config;
    private WebSocket webSocket;
    private boolean desiredConnection;
    private boolean authenticated;
    private int reconnectAttempt;
    private int generation;

    RemoteConnectionManager(Listener listener) {
        this.listener = listener;
    }

    void start(RemoteConfigStore.Config newConfig) {
        stopInternal(false);
        config = newConfig;
        if (!newConfig.isComplete()) {
            desiredConnection = false;
            notifyState(State.DISABLED, "远程连接未启用");
            return;
        }
        desiredConnection = true;
        reconnectAttempt = 0;
        generation++;
        connect(generation);
    }

    void stop() {
        stopInternal(true);
    }

    void destroy() {
        stopInternal(false);
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
    }

    void sendTelemetry() {
        if (!authenticated || webSocket == null) {
            return;
        }
        try {
            JSONObject envelope = new JSONObject();
            envelope.put("type", "telemetry.update");
            envelope.put("deviceId", config.deviceId);
            envelope.put("timestamp", System.currentTimeMillis());
            envelope.put("payload", listener.createTelemetry());
            webSocket.send(envelope.toString());
        } catch (JSONException ignored) {
            // Telemetry is best effort and will be sent again at the next sample.
        }
    }

    void sendCommandResult(String commandId, boolean success, String message) {
        if (!authenticated || webSocket == null) {
            return;
        }
        try {
            JSONObject result = new JSONObject();
            result.put("type", "command.result");
            result.put("deviceId", config.deviceId);
            result.put("commandId", commandId);
            result.put("success", success);
            result.put("message", message);
            result.put("timestamp", System.currentTimeMillis());
            webSocket.send(result.toString());
        } catch (JSONException ignored) {
            // Command acknowledgement contains only known primitive values.
        }
    }

    void sendPreviewFrame(JSONObject frame) {
        if (!authenticated || webSocket == null) {
            return;
        }
        try {
            JSONObject envelope = new JSONObject();
            envelope.put("type", "preview.frame");
            envelope.put("deviceId", config.deviceId);
            envelope.put("timestamp", System.currentTimeMillis());
            envelope.put("payload", frame);
            webSocket.send(envelope.toString());
        } catch (JSONException ignored) {
            // Preview is best effort. The next scheduled frame can recover.
        }
    }

    private void connect(int connectionGeneration) {
        if (!desiredConnection || connectionGeneration != generation) {
            return;
        }
        authenticated = false;
        notifyState(State.CONNECTING, "正在连接远程服务器");
        try {
            Request request = new Request.Builder()
                    .url(config.endpoint)
                    .header("User-Agent", "PlayKeeper-Android/0.5")
                    .build();
            webSocket = client.newWebSocket(request, new SocketListener(connectionGeneration));
        } catch (RuntimeException error) {
            notifyState(State.ERROR, "远程地址无效");
            scheduleReconnect(connectionGeneration);
        }
    }

    private void stopInternal(boolean notify) {
        desiredConnection = false;
        authenticated = false;
        generation++;
        mainHandler.removeCallbacksAndMessages(null);
        if (webSocket != null) {
            webSocket.close(1000, "client stopped");
            webSocket = null;
        }
        if (notify) {
            notifyState(State.DISABLED, "远程连接已关闭");
        }
    }

    private void scheduleReconnect(int connectionGeneration) {
        if (!desiredConnection || connectionGeneration != generation) {
            return;
        }
        int index = Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1);
        long delay = RECONNECT_DELAYS_MS[index];
        reconnectAttempt++;
        mainHandler.postDelayed(() -> connect(connectionGeneration), delay);
    }

    private void notifyState(State state, String message) {
        mainHandler.post(() -> listener.onRemoteStateChanged(state, message));
    }

    private final class SocketListener extends WebSocketListener {
        private final int connectionGeneration;

        SocketListener(int connectionGeneration) {
            this.connectionGeneration = connectionGeneration;
        }

        @Override
        public void onOpen(WebSocket socket, Response response) {
            if (connectionGeneration != generation || !desiredConnection) {
                socket.close(1000, "stale connection");
                return;
            }
            try {
                JSONObject hello = new JSONObject();
                hello.put("type", "device.hello");
                hello.put("deviceId", config.deviceId);
                hello.put("token", config.token);
                hello.put("appVersion", "0.5.0");
                socket.send(hello.toString());
            } catch (JSONException ignored) {
                socket.close(1002, "invalid hello");
            }
        }

        @Override
        public void onMessage(WebSocket socket, String text) {
            if (connectionGeneration != generation || text.length() > MAX_MESSAGE_CHARS) {
                return;
            }
            try {
                JSONObject message = new JSONObject(text);
                String type = message.optString("type");
                if ("device.accepted".equals(type)) {
                    authenticated = true;
                    reconnectAttempt = 0;
                    notifyState(State.CONNECTED, "远程连接已上线");
                    mainHandler.post(RemoteConnectionManager.this::sendTelemetry);
                    return;
                }
                if ("device.rejected".equals(type)) {
                    authenticated = false;
                    desiredConnection = false;
                    notifyState(State.ERROR, "设备密钥被服务器拒绝");
                    socket.close(1008, "authentication rejected");
                    return;
                }
                if ("command.request".equals(type) && authenticated) {
                    handleCommand(message);
                }
            } catch (JSONException ignored) {
                // Malformed remote messages are ignored without affecting local挂机.
            }
        }

        @Override
        public void onClosed(WebSocket socket, int code, String reason) {
            if (connectionGeneration != generation) {
                return;
            }
            authenticated = false;
            webSocket = null;
            if (desiredConnection) {
                notifyState(State.ERROR, "远程连接已断开，正在重连");
                scheduleReconnect(connectionGeneration);
            }
        }

        @Override
        public void onFailure(WebSocket socket, Throwable error, Response response) {
            if (connectionGeneration != generation) {
                return;
            }
            authenticated = false;
            webSocket = null;
            if (desiredConnection) {
                notifyState(State.ERROR, "远程服务器连接失败");
                scheduleReconnect(connectionGeneration);
            }
        }

        private void handleCommand(JSONObject message) throws JSONException {
            String commandId = message.optString("commandId");
            String command = message.optString("command");
            long expiresAt = message.optLong("expiresAt", 0L);
            JSONObject parameters = message.optJSONObject("parameters");
            if (parameters == null) {
                parameters = new JSONObject();
            }
            if (commandId.isBlank() || command.isBlank()) {
                return;
            }
            if (expiresAt > 0L && System.currentTimeMillis() > expiresAt) {
                sendCommandResult(commandId, false, "命令已过期");
                return;
            }
            JSONObject safeParameters = parameters;
            mainHandler.post(() -> listener.onRemoteCommand(
                    commandId, command, safeParameters));
        }
    }
}
