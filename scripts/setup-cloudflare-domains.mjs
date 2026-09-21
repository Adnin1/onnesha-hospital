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

  // Add www.onneshahospital.com
  console.log('Adding www.onneshahospital.com to Pages project...');
  const pageDomainRes2 = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/onnesha-hospital/domains`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'www.onneshahospital.com' })
  });
  const pageDomainData2 = await pageDomainRes2.json();
  console.log('Pages www domain response:', JSON.stringify(pageDomainData2, null, 2));

  // Query all domains on the Pages project
  console.log('\nQuerying all domains for onnesha-hospital...');
  const listRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/onnesha-hospital/domains`, { headers });
  const listData = await listRes.json();
  console.log('Current custom domains:', JSON.stringify(listData, null, 2));
}

main().catch(console.error);
