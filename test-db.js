import pg from 'pg';
const { Client } = pg;

async function testCombo(user, pwd) {
  const config = {
    user: user,
    host: 'aws-0-ap-southeast-2.pooler.supabase.com',
    database: 'postgres',
    password: pwd,
    port: 6543,
    ssl: { rejectUnauthorized: false }
  };

  const client = new Client(config);
  try {
    console.log(`Deneniyor: User="${user}", Pass="${pwd}"`);
    await client.connect();
    console.log('>>> BAŞARILI!');
    await client.end();
    return true;
  } catch (err) {
    console.error('Hata:', err.message);
    try {
      await client.end();
    } catch (e) {}
    return false;
  }
}

async function run() {
  await testCombo('postgres.wfmayboaoufumpyejwph', 'T6k6V=*8cvIEy');
  await testCombo('postgres', '[T6k6V=*8cvIEy]');
  await testCombo('postgres', 'T6k6V=*8cvIEy');
}

run();
