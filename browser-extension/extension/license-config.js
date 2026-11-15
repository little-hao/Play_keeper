"use strict";

// 部署授权服务器后，将 enabled 改为 true，并把 serverBaseUrl 改成 HTTPS 地址。
// 修改地址后还要同步修改 manifest.json 的 host_permissions。
globalThis.PlayKeeperLicenseConfig = Object.freeze({
  enabled: true,
  productId: "playkeeper-god-planner",
  extensionVersion: "1.5.5",
  serverBaseUrl: "https://keeper.19990920.xyz/license-api",
  refreshBeforeMinutes: 12 * 60,
  publicKeyJwk: {
    kty: "EC",
    x: "qiGL0WxM797SWGJf8xA-h6Azfd2LDV2_0a3rnl7kJq4",
    y: "R_urGIVfP9GsFnTx8gKEmo9DHe_ZyTdSPsk0Iubuzq8",
    crv: "P-256",
    ext: true,
  },
});
