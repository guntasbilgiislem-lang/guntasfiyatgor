import pg from 'pg';
const { Client } = pg;

const regions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-central-2',
  'eu-south-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-south-1',
  'ap-south-2',
  'ap-east-1',
  'sa-east-1',
  'me-central-1',
  'af-south-1'
];

async function checkRegion(region, pwd) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const config = {
    user: 'postgres.wfmayboaoufumpyejwph',
    host: host,
    database: 'postgres',
    password: pwd,
    port: 6543,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 3000
  };

  const client = new Client(config);
  try {
    await client.connect();
    console.log(`>>> BAŞARILI! Bölge: ${region}, Şifre: "${pwd}"`);
    const res = await client.query('SELECT NOW()');
    console.log('Saat:', res.rows[0]);
    await client.end();
    return true;
  } catch (err) {
    if (err.message.includes('tenant/user') || err.message.includes('Tenant or user')) {
      // Tenant or user not found means the host is valid but this is the wrong region
      // So we don't need to log the full error, just a summary
    } else {
      console.log(`Bölge ${region} hatası ("${pwd}"):`, err.message);
    }
    try {
      await client.end();
    } catch (e) {}
    return false;
  }
}

async function run() {
  console.log('Tüm bölgeler test ediliyor...');
  for (const region of regions) {
    console.log(`Test ediliyor: ${region}...`);
    const success1 = await checkRegion(region, '[T6k6V=*8cvIEy]');
    if (success1) return;
    const success2 = await checkRegion(region, 'T6k6V=*8cvIEy');
    if (success2) return;
  }
  console.log('Tüm bölgeler denendi, bağlantı kurulamadı.');
}

run();
