// Waits until something accepts connections on localhost:<port>, then exits 0.
// Used by `npm run serve` so the frontend server starts only once the backend
// is listening - otherwise a browser tab left open can hit /api in the gap and
// the proxy logs ECONNREFUSED. Gives up (exit 1) after the timeout.
//
//   node scripts/wait-for-port.cjs 4000 [timeoutSeconds=120]
const net = require('net');
const port = Number(process.argv[2]);
const deadline = Date.now() + Number(process.argv[3] || 120) * 1000;
if (!port) {
  console.error('usage: node scripts/wait-for-port.cjs <port> [timeoutSeconds]');
  process.exit(2);
}
(function attempt() {
  const socket = net.connect({ port, host: '127.0.0.1' });
  socket.once('connect', () => {
    socket.end();
    console.log(`port ${port} is up`);
    process.exit(0);
  });
  socket.once('error', () => {
    socket.destroy();
    if (Date.now() > deadline) {
      console.error(`gave up waiting for port ${port}`);
      process.exit(1);
    }
    setTimeout(attempt, 500);
  });
})();
