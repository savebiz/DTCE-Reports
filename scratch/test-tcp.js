const tls = require('tls')
const net = require('net')

const socket = net.connect(5432, 'db.vmwlpakvhfwpjjxelsis.supabase.co', () => {
  console.log('TCP Connected to db.vmwlpakvhfwpjjxelsis.supabase.co:5432')
  // SSLRequest
  const sslReq = Buffer.from('0000000804d2162f', 'hex')
  socket.write(sslReq)
})

socket.on('data', data => {
  console.log('Data from server:', data.toString('utf8'), data)
})

socket.on('error', err => console.log('Socket error:', err.message))
