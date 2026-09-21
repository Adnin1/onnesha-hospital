import fs from 'fs';

async function main() {
  const tomlPath = 'C:\\Users\\mahin khan\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
  const content = fs.readFileSync(tomlPath, 'utf8');
  let oauthToken = '';
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('oauth_token')) {
      const parts = line.split('=');
      if (parts[1]) oauthToken = parts[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  const headers = {
    'Authorization': `Bearer ${oauthToken}`,
    'Content-Type': 'application/json'
  };

  const accountId = '0eaa8aeb3e2ea628065da5c05b1368a7';

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/onnesha-hospital/domains/onneshahospital.com`, { headers });
  const data = await res.json();
  console.log('Domain detail onneshahospital.com:', JSON.stringify(data, null, 2));

  const resWww = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/onnesha-hospital/domains/www.onneshahospital.com`, { headers });
  const dataWww = await resWww.json();
  console.log('Domain detail www.onneshahospital.com:', JSON.stringify(dataWww, null, 2));
}

main().catch(console.error);
