// One-time setup: lets the outreach mailbox grant Vault permission to send and read mail.
// Run: npm run gmail:connect   (needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env)
// Then copy the printed GMAIL_REFRESH_TOKEN into .env and into Render's environment.
import http from 'node:http';

const { GMAIL_CLIENT_ID: id, GMAIL_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to .env first.');
  process.exit(1);
}

const PORT = 5055;
const redirect = `http://localhost:${PORT}/callback`;
const scopes = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];
const url =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({ client_id: id, redirect_uri: redirect, response_type: 'code', scope: scopes.join(' '), access_type: 'offline', prompt: 'consent' });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/callback') return res.end();
  const code = u.searchParams.get('code');
  if (!code) {
    res.end('No code received. Close this tab and run the command again.');
    return server.close();
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const data = await r.json();
  if (!data.refresh_token) {
    res.end('Google did not return a refresh token. Check the terminal.');
    console.error(data);
  } else {
    res.end('Gmail connected. You can close this tab and go back to the terminal.');
    console.log(`\nGMAIL_REFRESH_TOKEN=${data.refresh_token}\n`);
  }
  server.close();
});

server.listen(PORT, () => console.log(`Open this link, sign in with the outreach mailbox and allow access:\n\n${url}\n`));
