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

  // Try creating the zone for onneshahospital.com
  console.log('Attempting to create zone onneshahospital.com...');
  const zonePayload = {
    account: { id: accountId },
    name: 'onneshahospital.com',
    type: 'full'
  };

  const createZoneRes = await fetch('https://api.cloudflare.com/client/v4/zones', {
    method: 'POST',
    headers,
    body: JSON.stringify(zonePayload)
  });

  const createZoneData = await createZoneRes.json();
  console.log('Create Zone Response:', JSON.stringify(createZoneData, null, 2));

  if (createZoneData.success) {
    const zone = createZoneData.result;
    console.log(`\nZone created successfully!`);
    console.log(`Zone ID: ${zone.id}`);
    console.log(`Zone Name: ${zone.name}`);
    console.log(`Status: ${zone.status}`);
    console.log(`Assigned Cloudflare Name Servers:`, zone.name_servers);

    // Try adding custom domains to Pages
    console.log('\nAdding onneshahospital.com to Pages project...');
    const pageDomainRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/onnesha-hospital/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'onneshahospital.com' })
    });
    const pageDomainData = await pageDomainRes.json();
    console.log('Pages apex domain response:', JSON.stringify(pageDomainData, null, 2));

    console.log('\nAdding www.onneshahospital.com to Pages project...');
    const pageDomainRes2 = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/onnesha-hospital/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'www.onneshahospital.com' })
    });
    const pageDomainData2 = await pageDomainRes2.json();
    console.log('Pages www domain response:', JSON.stringify(pageDomainData2, null, 2));
  } else {
    // If zone couldn't be created, check if domain can still be added to Pages directly
    console.log('\nTrying to add onneshahospital.com directly to Pages project without pre-existing zone...');
    const pageDomainRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/onnesha-hospital/domains`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'onneshahospital.com' })
    });
    const pageDomainData = await pageDomainRes.json();
    console.log('Pages apex domain response:', JSON.stringify(pageDomainData, null, 2));
  }
}

main().catch(console.error);
