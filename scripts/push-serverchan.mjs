#!/usr/bin/env node
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import fs from "node:fs";
import path from "node:path";

// 1) 解析推送地址：优先完整 URL，否则从 SendKey 自动识别新版/旧版
function resolveEndpoint() {
  if (process.env.SERVERCHAN_API_URL) return process.env.SERVERCHAN_API_URL.trim();
  const key = (process.env.SERVERCHAN_SEND_KEY || process.env.SCT_SEND_KEY || "").trim();
  if (!key) return null;
  const m = key.match(/^sctp(\d+)t/);            // 新版 3.6: sctp<uid>t...
  if (m) return `https://${m[1]}.push.ft07.com/send/${key}.send`;
  return `https://sctapi.ftqq.com/${key}.send`;  // 旧版 ftqq
}
const endpoint = resolveEndpoint();
if (!endpoint) { console.log("[push] 未配置 Server酱 key — 跳过"); process.exit(0); }

// 2) 选报告（逻辑照搬 scripts/deploy.mjs）
const dateArg = process.argv[2];
const todayLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.REPORT_TZ?.trim() || undefined,
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const reportFile = (d) => path.join("daily_reports", d, `${d}.html`);
let date;
if (dateArg) { date = dateArg;
  if (!fs.existsSync(reportFile(date))) { console.error(`[push] 找不到 ${reportFile(date)}`); process.exit(1); }
} else if (fs.existsSync(reportFile(todayLocal))) { date = todayLocal;
} else {
  const dirs = fs.readdirSync("daily_reports")
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && fs.existsSync(reportFile(f))).sort();
  if (!dirs.length) { console.error("[push] daily_reports/ 里没有报告"); process.exit(1); }
  date = dirs.at(-1); console.log(`[push] 今天(${todayLocal})未生成，改用最新 ${date}`);
}

// 3) 组装内容（正文用 Markdown，微信端渲染；HTML 会被剥掉，所以推「摘要+链接」）
function reportUrl() {
  if (process.env.REPORT_URL) return process.env.REPORT_URL.trim();
  if (process.env.GITHUB_REPOSITORY) {
    const [u, r] = process.env.GITHUB_REPOSITORY.split("/");
    return `https://${u}.github.io/${r}/`;
  }
  return null;
}
const url = reportUrl();
const title = `📰 每日简报 ${date}`;
const desp = [
  `**${date} 的 DailyBrief 已生成 ✅**`, "",
  url ? `📎 [点击查看完整报告](${url})` : "报告已在本机生成（未配置 REPORT_URL）",
  "", "> 26 个数据源 · 21 个标的技术指标 + AI 点评",
].join("\n");

// 4) 发送（Node 20 自带 fetch，零依赖）
const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ title, desp }).toString(),
});
const text = await res.text().catch(() => "");
if (res.ok) { console.log(`[push] ✅ 已推送（${date}）${text ? " — " + text.slice(0,160) : ""}`); process.exit(0); }
else { console.error(`[push] ❌ 失败 HTTP ${res.status} ${text}`); process.exit(1); }
