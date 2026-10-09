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
    to: plan.reportEmail || environment.REPORT_TO || "konghao0920@gmail.com",
    subject: report.subject,
    text: report.text
  });
  return { status: `已发送至 ${plan.reportEmail}` };
}
