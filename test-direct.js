import pg from 'pg';
const { Client } = pg;

async function testDirect(pwd) {
  const config = {
    user: 'postgres',
    host: 'db.wfmayboaoufumpyejwph.supabase.co',
    database: 'postgres',
    password: pwd,
    port: 5432,
    ssl: { rejectUnauthorized: false }
  };

  const client = new Client(config);
  try {
    console.log(`Direct ile deneniyor: "${pwd}"`);
    await client.connect();
    console.log('Bağlantı başarılı!');
    const res = await client.query('SELECT NOW()');
    console.log('Veritabanı Saati:', res.rows[0]);
    await client.end();
    return true;
  } catch (err) {
    console.error('Bağlantı hatası:', err.message);
    try {
      await client.end();
    } catch (e) {}
    return false;
  }
}

async function run() {
  const success1 = await testDirect('[T6k6V=*8cvIEy]');
  if (!success1) {
    await testDirect('T6k6V=*8cvIEy');
  }
}

run();
