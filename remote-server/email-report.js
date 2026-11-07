import nodemailer from "nodemailer";

export function buildCompletionReport(plan) {
  const accounts = Object.entries(plan.inventoryByAccount ?? {});
  const totals = {};
  for (const [, counts] of accounts) {
    for (const [item, count] of Object.entries(counts ?? {})) {
      totals[item] = (totals[item] ?? 0) + (Number(count) || 0);
    }
  }
  const accountLines = accounts.map(([account, counts]) =>
    `${account}：${Object.entries(counts).map(([item, count]) => `${item} ${count}`).join("，")}`);
  const totalLine = Object.entries(totals).map(([item, count]) => `${item} ${count}`).join("，");
  const subject = `Play Keeper：今日${accounts.length}账号挂机脚本已完成`;
  const text = [
    `今日${accounts.length}账号装备转移、默认副本和道具转移已完成。`,
    "",
    ...accountLines,
    "",
    `各项道具数量共计：${totalLine || "暂无数据"}`,
    `完成时间：${new Date(plan.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
  ].join("\n");
  return { subject, text, totals };
}

export async function sendCompletionReport(plan, environment = process.env) {
  if (!String(plan?.reportEmail || "").trim()) {
    return { status: "未发送：未填写完成报告邮箱" };
  }
  const host = environment.SMTP_HOST;
  const user = environment.SMTP_USER;
  const pass = environment.SMTP_PASS;
  if (!host || !user || !pass) return { status: "未发送：服务器未配置SMTP" };
  const port = Number.parseInt(environment.SMTP_PORT ?? "465", 10);
  const secure = String(environment.SMTP_SECURE ?? "true").toLowerCase() !== "false";
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  const report = buildCompletionReport(plan);
  await transporter.sendMail({
    from: environment.REPORT_FROM || user,
    to: plan.reportEmail,
    subject: report.subject,
    text: report.text
  });
  return { status: `已发送至 ${plan.reportEmail}` };
}

export function buildDailyRoutineReport(plan) {
  const accounts = Array.isArray(plan.accounts) ? plan.accounts : [];
  const totals = {};
  const lines = accounts.map((account) => {
    for (const [item, count] of Object.entries(account.inventoryCounts || {})) {
      totals[item] = (totals[item] || 0) + (Number(count) || 0);
    }
    const proof = account.evidence || {};
    const inventory = Object.entries(account.inventoryCounts || {})
      .map(([item, count]) => `${item} ${count}`).join("，") || "未获取";
    return `${account.accountLabel}：${account.status}；${account.message || ""}\n`
      + `  领取验证=${proof.dailyTaskAcceptVerified === true ? "是" : "否"}`
      + `，可完成发现=${proof.completableFoundCount ?? "?"}`
      + `，实际完成=${proof.completableCompletedCount ?? "?"}`
      + `，剩余=${proof.completableRemainingCount ?? "?"}\n  背包：${inventory}`;
  });
  const totalLine = Object.entries(totals).map(([item, count]) => `${item} ${count}`).join("，") || "暂无已验证数据";
  return { subject: `Play Keeper：各账号每日任务 ${plan.status === "success" ? "已完成" : "存在失败"}`,
    text: [`批次：${plan.runId}`, `状态：${plan.status}`, "", ...lines, "",
      `本用户全部账号背包合计：${totalLine}`,
      `完成时间：${new Date(plan.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`].join("\n"),
    totals };
}

export async function sendDailyRoutineReport(plan, environment = process.env) {
  if (!String(plan?.reportEmail || "").trim()) return { status: "未发送：未填写通知邮箱" };
  const host = environment.SMTP_HOST;
  const user = environment.SMTP_USER;
  const pass = environment.SMTP_PASS;
  if (!host || !user || !pass) return { status: "未发送：服务器未配置SMTP" };
  const transporter = nodemailer.createTransport({ host,
    port: Number.parseInt(environment.SMTP_PORT ?? "465", 10),
    secure: String(environment.SMTP_SECURE ?? "true").toLowerCase() !== "false",
    auth: { user, pass } });
  const report = buildDailyRoutineReport(plan);
  await transporter.sendMail({ from: environment.REPORT_FROM || user,
    to: plan.reportEmail, subject: report.subject, text: report.text });
  return { status: `已发送至 ${plan.reportEmail}` };
}
