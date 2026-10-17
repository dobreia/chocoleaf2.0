const net = require("node:net");
module.exports = async () => {
  const messages = [];
  const server = net.createServer((socket) => {
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "",
      data = false,
      body = [];
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let i;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (data) {
          if (line === ".") {
            messages.push(body.join("\n"));
            body = [];
            data = false;
            socket.write("250 accepted\r\n");
          } else body.push(line);
          continue;
        }
        if (/^EHLO|^HELO/.test(line)) socket.write("250 localhost\r\n");
        else if (/^DATA/.test(line)) {
          data = true;
          socket.write("354 end with dot\r\n");
        } else if (/^QUIT/.test(line)) {
          socket.end("221 bye\r\n");
        } else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: server.address().port,
    messages,
    close: () => new Promise((r) => server.close(r)),
  };
};
