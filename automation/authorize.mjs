#!/usr/bin/env node
/**
 * OAuth autorizace další Gmail schránky pro watcher.
 *
 * Použití: node authorize.mjs <target_oauth_dir> [login_hint]
 *   node authorize.mjs ~/.claude/gmail-oauth-personal novakmilos7@gmail.com
 *
 * Použije client_secret.json ze sdíleného ~/.claude/gmail-oauth/,
 * spustí lokální server na http://localhost:8765, vypíše URL k odkliknutí
 * a po dokončení uloží token.json (scope gmail.readonly) do cílové složky.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const HOME = os.homedir();
const SHARED_OAUTH_DIR = path.join(HOME, '.claude', 'gmail-oauth');
const targetDir = process.argv[2] ? process.argv[2].replace(/^~/, HOME) : null;
const loginHint = process.argv[3] || '';
const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

if (!targetDir) {
  console.error('Použití: node authorize.mjs <target_oauth_dir> [login_hint]');
  process.exit(1);
}

const secret = JSON.parse(fs.readFileSync(path.join(SHARED_OAUTH_DIR, 'client_secret.json'), 'utf-8'));
const { client_id, client_secret } = secret.installed || secret.web;

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();

console.log('\nOtevři v prohlížeči (a přihlas se účtem ' + (loginHint || 'který chceš připojit') + '):\n');
console.log(authUrl + '\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) {
    res.end('Autorizace zamítnuta: ' + error);
    console.error('Autorizace zamítnuta:', error);
    server.close(() => process.exit(1));
    return;
  }
  if (!code) {
    res.end('Chybí code parametr.');
    return;
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id,
        client_secret,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const token = await tokenRes.json();
    if (!token.refresh_token) throw new Error('Odpověď neobsahuje refresh_token: ' + JSON.stringify(token));

    // Ověř, který účet byl autorizován
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = await profileRes.json();

    fs.mkdirSync(targetDir, { recursive: true });
    token.scope = SCOPE;
    token.account = profile.emailAddress;
    fs.writeFileSync(path.join(targetDir, 'token.json'), JSON.stringify(token, null, 2), { mode: 0o600 });

    res.end(`Hotovo — účet ${profile.emailAddress} připojen. Okno můžeš zavřít.`);
    console.log(`\nToken uložen do ${targetDir}/token.json (účet: ${profile.emailAddress})`);
    server.close(() => process.exit(0));
  } catch (e) {
    res.end('Chyba: ' + e.message);
    console.error('Chyba:', e.message);
    server.close(() => process.exit(1));
  }
});

server.listen(PORT, () => console.log(`Čekám na dokončení autorizace na ${REDIRECT_URI} ...`));
setTimeout(() => {
  console.error('Timeout (10 min) — autorizace nedokončena.');
  process.exit(1);
}, 10 * 60 * 1000);
