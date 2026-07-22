#!/usr/bin/env node
/**
 * Phone Bills — Gmail watcher
 *
 * Denně kontroluje Gmail schránku na nová T-Mobile vyúčtování (PDF přílohy),
 * nahraje je do aplikace phone-bills, vygeneruje PDF vyúčtování pro každou
 * skupinu a pošle je souhrnným e-mailem (k přeposlání jednotlivým lidem).
 *
 * Bez závislostí — Node 22+ (fetch, FormData, Blob).
 *
 * Konfigurace: ~/.claude/phone-bills-automation.json
 *   { "api_base": "https://phone-bills-tc.fly.dev", "api_key": "...", "notify_email": "novak@techcrowd.cz",
 *     "extra_oauth_dirs": ["~/.claude/gmail-oauth-personal"] }   // volitelné další schránky (jen čtení)
 * Gmail OAuth:  ~/.claude/gmail-oauth/{client_secret.json,token.json} (scope gmail.readonly + gmail.compose)
 *               další schránky autorizuješ přes `node authorize.mjs <dir> <email>` (token.json v <dir>)
 * Stav:         ~/.claude/phone-bills-automation-state.json (zpracované Gmail message ids)
 *
 * Použití: node watcher.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const DRY_RUN = process.argv.includes('--dry-run');
const HOME = os.homedir();
const OAUTH_DIR = path.join(HOME, '.claude', 'gmail-oauth');
const CONFIG_PATH = path.join(HOME, '.claude', 'phone-bills-automation.json');
const STATE_PATH = path.join(HOME, '.claude', 'phone-bills-automation-state.json');

const GMAIL_QUERY = 'from:t-mobile.cz filename:pdf newer_than:60d';
const ATTACHMENT_PATTERN = /vyuctovani|vyúčtování|faktura/i;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function loadJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return fallback;
  }
}

// ---------- Gmail auth ----------

async function getAccessToken(oauthDir = OAUTH_DIR) {
  // client_secret.json: preferuj vlastní ve složce schránky (vlastní GCP projekt), jinak sdílený
  const secret = loadJson(path.join(oauthDir, 'client_secret.json')) || loadJson(path.join(OAUTH_DIR, 'client_secret.json'));
  const token = loadJson(path.join(oauthDir, 'token.json'));
  if (!secret || !token?.refresh_token) {
    throw new Error(`Chybí Gmail OAuth credentials (${oauthDir})`);
  }
  const { client_id, client_secret } = secret.installed || secret.web;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id,
      client_secret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh selhal: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function gmailApi(accessToken, endpoint) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${endpoint}: ${res.status} ${await res.text()}`);
  return res.json();
}

function walkParts(part, out = []) {
  if (part.filename && part.body?.attachmentId) out.push(part);
  for (const p of part.parts || []) walkParts(p, out);
  return out;
}

function base64UrlToBuffer(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function headerValue(message, name) {
  return message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

// ---------- Phone Bills API ----------

async function api(config, endpoint, options = {}) {
  const res = await fetch(`${config.api_base}${endpoint}`, {
    ...options,
    headers: { 'X-Api-Key': config.api_key, ...(options.headers || {}) },
  });
  return res;
}

async function uploadInvoice(config, filename, buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
  form.append('source', 'email');
  const res = await api(config, '/api/invoices/upload', { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ---------- E-mail (Gmail send) ----------

function rfc2047(str) {
  return /^[\x20-\x7e]*$/.test(str) ? str : `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`;
}

function buildMime({ from, to, subject, text, attachments }) {
  const boundary = 'phonebills_' + Math.random().toString(36).slice(2);
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${rfc2047(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf-8').toString('base64'),
  ];
  for (const att of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${rfc2047(att.filename)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${rfc2047(att.filename)}"`,
      '',
      att.buffer.toString('base64'),
    );
  }
  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

async function sendEmail(accessToken, mime) {
  const raw = Buffer.from(mime, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send selhal: ${res.status} ${await res.text()}`);
  return res.json();
}

// ---------- Main ----------

async function main() {
  const config = loadJson(CONFIG_PATH);
  if (!config?.api_base || !config?.api_key || !config?.notify_email) {
    throw new Error(`Chybí nebo neúplná konfigurace v ${CONFIG_PATH}`);
  }
  const state = loadJson(STATE_PATH, { processedMessageIds: [] });
  const processed = new Set(state.processedMessageIds);

  const mailboxes = [OAUTH_DIR, ...(config.extra_oauth_dirs || []).map((d) => d.replace(/^~/, HOME))];
  log(`Start${DRY_RUN ? ' (dry-run)' : ''} — hledám: ${GMAIL_QUERY} (${mailboxes.length} schránek)`);

  const uploaded = []; // { period, docNumber, total, filename }
  const skipped = [];
  let primaryToken = null;

  for (const mailbox of mailboxes) {
    const mailboxKey = path.basename(mailbox);
    let accessToken;
    try {
      accessToken = await getAccessToken(mailbox);
    } catch (e) {
      log(`CHYBA: schránka ${mailboxKey}: ${e.message}`);
      continue;
    }
    if (mailbox === OAUTH_DIR) primaryToken = accessToken;

    const search = await gmailApi(accessToken, `messages?q=${encodeURIComponent(GMAIL_QUERY)}&maxResults=50`);
    const stateKey = (id) => `${mailboxKey}:${id}`;
    const messages = (search.messages || []).filter((m) => !processed.has(stateKey(m.id)) && !processed.has(m.id));
    log(`[${mailboxKey}] Nalezeno ${search.messages?.length || 0} zpráv, ${messages.length} nezpracovaných`);

    for (const m of messages) {
      const full = await gmailApi(accessToken, `messages/${m.id}?format=full`);
      const subject = headerValue(full, 'Subject');
      const attachments = walkParts(full.payload).filter(
        (p) => p.filename.toLowerCase().endsWith('.pdf') && ATTACHMENT_PATTERN.test(p.filename),
      );
      if (attachments.length === 0) {
        processed.add(stateKey(m.id));
        continue;
      }
      log(`[${mailboxKey}] Zpráva "${subject}" — ${attachments.length} PDF příloh`);

      let allOk = true;
      for (const att of attachments) {
        if (DRY_RUN) {
          log(`  [dry-run] nahrál bych: ${att.filename}`);
          continue;
        }
        try {
          const attData = await gmailApi(accessToken, `messages/${m.id}/attachments/${att.body.attachmentId}`);
          const buffer = base64UrlToBuffer(attData.data);
          const { status, body } = await uploadInvoice(config, att.filename, buffer);
          if (status === 201) {
            log(`  Nahráno: ${att.filename} → období ${body.invoice.period}, doklad ${body.invoice.doc_number}`);
            uploaded.push({
              period: body.invoice.period,
              docNumber: body.invoice.doc_number,
              total: body.invoice.total_with_vat,
              filename: att.filename,
            });
          } else if (status === 409) {
            log(`  Přeskočeno (už nahráno): ${att.filename}`);
          } else {
            log(`  CHYBA uploadu ${att.filename}: ${status} ${JSON.stringify(body)}`);
            skipped.push({ filename: att.filename, error: body.error || `HTTP ${status}` });
            // 4xx = trvalá chyba (soubor se nezmění) → zprávu označit jako zpracovanou
            if (status >= 500) allOk = false;
          }
        } catch (e) {
          log(`  CHYBA zpracování ${att.filename}: ${e.message}`);
          allOk = false;
        }
      }
      if (allOk && !DRY_RUN) processed.add(stateKey(m.id));
    }
  }

  const accessToken = primaryToken; // odesílání e-mailu jde vždy z hlavní schránky (scope compose)

  if (DRY_RUN) {
    log('Dry-run hotov, nic se nenahrálo ani neposlalo.');
    return;
  }

  // Pro každé nové období vygeneruj PDF vyúčtování per skupina a pošli e-mailem
  const periods = [...new Set(uploaded.map((u) => u.period))];
  if (periods.length > 0 && !accessToken) {
    throw new Error('Hlavní schránka není dostupná — nelze odeslat souhrnný e-mail');
  }
  for (const period of periods) {
    const summaryRes = await api(config, `/api/payments/summary?period=${encodeURIComponent(period)}`);
    if (!summaryRes.ok) {
      log(`CHYBA: summary za ${period}: ${summaryRes.status}`);
      continue;
    }
    const summary = await summaryRes.json();
    const unpaidGroups = (summary.groups || []).filter((g) => !g.is_paid);

    const attachments = [];
    for (const g of unpaidGroups) {
      const pdfRes = await api(
        config,
        `/api/payments/export?period=${encodeURIComponent(period)}&group_id=${g.group_id}`,
      );
      if (!pdfRes.ok) {
        log(`CHYBA: export ${g.group_name} za ${period}: ${pdfRes.status}`);
        continue;
      }
      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      const safeName = g.group_name.replace(/[^\wÀ-ſ-]+/g, '-');
      attachments.push({ filename: `vyuctovani_${period}_${safeName}.pdf`, buffer, group: g });
    }

    const czk = (n) => Math.round(n).toLocaleString('cs-CZ') + ' Kč';
    const docs = uploaded.filter((u) => u.period === period);
    const bodyText = [
      `Telefonní vyúčtování — období ${period}`,
      '',
      'Automaticky nahráno z e-mailu:',
      ...docs.map((d) => `  • ${d.filename} (doklad ${d.docNumber}, celkem ${czk(d.total)})`),
      '',
      'Vyúčtování pro skupiny (PDF v příloze — stačí přeposlat):',
      ...attachments.map((a) => `  • ${a.group.group_name}: ${czk(a.group.amount)}`),
      ...(skipped.length
        ? ['', 'Nepodařilo se zpracovat:', ...skipped.map((s) => `  • ${s.filename}: ${s.error}`)]
        : []),
      '',
      `Aplikace: ${config.api_base}`,
    ].join('\n');

    const mime = buildMime({
      from: config.notify_email,
      to: config.notify_email,
      subject: `Telefonní vyúčtování ${period} — podklady k přeposlání`,
      text: bodyText,
      attachments,
    });
    await sendEmail(accessToken, mime);
    log(`E-mail za období ${period} odeslán na ${config.notify_email} (${attachments.length} PDF)`);
  }

  if (periods.length === 0) log('Žádná nová vyúčtování.');

  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify({ processedMessageIds: [...processed].slice(-500), lastRun: new Date().toISOString() }, null, 2),
  );
  log('Hotovo.');
}

main().catch((e) => {
  console.error(`[${new Date().toISOString()}] FATAL: ${e.message}`);
  process.exit(1);
});
