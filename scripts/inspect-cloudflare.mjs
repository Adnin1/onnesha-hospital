import fs from 'fs';

async function main() {
  const tomlPath = 'C:\\Users\\mahin khan\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
  if (!fs.existsSync(tomlPath)) {
    console.error('Wrangler config not found at', tomlPath);
    return;
  }

  const content = fs.readFileSync(tomlPath, 'utf8');
  const lines = content.split('\n');
  let oauthToken = '';
  for (const line of lines) {
    if (line.trim().startsWith('oauth_token')) {
      const parts = line.split('=');
      if (parts[1]) {
        oauthToken = parts[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  if (!oauthToken) {
    console.error('OAuth token not found in config');
    return;
  }

  console.log('OAuth token extracted successfully (length: ' + oauthToken.length + ')');

  const headers = {
    'Authorization': `Bearer ${oauthToken}`,
    'Content-Type': 'application/json'
  };

  // 1. Check user/accounts
  try {
    const userRes = await fetch('https://api.cloudflare.com/client/v4/user', { headers });
    const userData = await userRes.json();
    console.log('User status:', userData.success ? 'Authenticated as ' + userData.result?.email : 'Failed: ' + JSON.stringify(userData.errors));
  } catch (err) {
    console.error('User fetch error:', err.message);
  }

  // 2. List zones
  let zones = [];
  try {
    const zonesRes = await fetch('https://api.cloudflare.com/client/v4/zones', { headers });
    const zonesData = await zonesRes.json();
    if (zonesData.success) {
      zones = zonesData.result;
      console.log(`Found ${zones.length} zone(s):`);
      for (const z of zones) {
        console.log(` - Zone: ${z.name} (ID: ${z.id}, status: ${z.status}, nameservers: ${JSON.stringify(z.name_servers)})`);
      }
    } else {
      console.log('Zones query failed:', JSON.stringify(zonesData.errors));
    }
  } catch (err) {
    console.error('Zones fetch error:', err.message);
  }

  // 3. Check Pages projects & custom domains
  const accountId = '0eaa8aeb3e2ea628065da5c05b1368a7';
  try {
    const pagesRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/onnesha-hospital/domains`, { headers });
    const pagesData = await pagesRes.json();
    if (pagesData.success) {
      console.log(`Pages custom domains for onnesha-hospital:`, JSON.stringify(pagesData.result, null, 2));
    } else {
      console.log('Pages domains error:', JSON.stringify(pagesData.errors));
    }
  } catch (err) {
    console.error('Pages domains fetch error:', err.message);
  }
}

main().catch(console.error);
