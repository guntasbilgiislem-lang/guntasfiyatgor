import dns from 'dns';
import net from 'net';

dns.resolve6('db.wfmayboaoufumpyejwph.supabase.co', (err, addresses) => {
  if (err) {
    console.error('DNS IPv6 çözümleme hatası:', err.message);
    return;
  }
  console.log('Bulunan IPv6 adresleri:', addresses);
  
  const targetIp = addresses[0];
  console.log(`TCP bağlantısı deneniyor: [${targetIp}]:5432 ...`);
  
  const socket = new net.Socket();
  socket.setTimeout(5000);
  
  socket.connect(5432, targetIp, () => {
    console.log('TCP BAĞLANTISI BAŞARILI!');
    socket.destroy();
  });
  
  socket.on('error', (sErr) => {
    console.error('Bağlantı hatası:', sErr.message);
  });
  
  socket.on('timeout', () => {
    console.error('Bağlantı zaman aşımına uğradı (Timeout).');
    socket.destroy();
  });
});
