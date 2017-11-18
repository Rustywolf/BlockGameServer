const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

let httpsServer = https.createServer({
  key: fs.readFileSync('./ssl/privkey.pem', 'utf8'),
  cert: fs.readFileSync('./ssl/fullchain.pem', 'utf8')
});
httpsServer.listen(6745);

const server = new WebSocket.Server({ server: httpsServer });
const clients = [];

function insertClient(client) {
  let id = -1;
  for (let i = 0; i < clients.length; i++) {
    if (!clients[i]) {
      id = i;
      break;
    }
  }

  if (id != -1) {
    clients[id] = client;
  } else {
    id = clients.length;
    clients.push(client);
  }

  client.id = id;
}

function removeClient(client) {
  clients[client.id] = null;
  client.socket.client = null;
  client.socket = null;
}

let width = 20, depth = 20, height = 64;
let floors = [0x280e02, 0x3a1301, 0x421602, 0x511a01, 0x329333];
const map = new Array(width);
for (let x = 0; x < width; x++) {
  map[x] = new Array(depth);
  for (let z = 0; z < depth; z++) {
    map[x][z] = new Array(height);
    for (let y = 0; y < 5; y++) {
      map[x][z][y] = floors[y];
    }
  }
}

function withinBounds(x, y, z) {
  if (isNaN(x) || isNaN(y) || isNaN(z)) return false;
  if (x < 0 || x >= map.length || z < 0 || z >= map[x].length || y < 0 || y >= map[x][z].length) return false;

  return true;
}

function send(client, packet) {
  client.socket.send(JSON.stringify(packet));
}

function sendAll(packet) {
  clients.forEach(client => {
    if (client && client.socket) send(client, packet);
  });
}

function updateColor(id, color) {
  sendAll({
    action: "color",
    id: id,
    color: color
  });
}

function updateBlock(x, y, z) {
  sendAll({
    action: (map[x][z][y]) ? "place" : "break",
    color: map[x][z][y] || null,
    x: x,
    y: y,
    z: z
  });
}

function playerJoin(id, client) {
  sendAll({
    action: "join",
    id: id,
    color: client.color,
    x: client.x,
    y: client.y,
    z: client.z,
    pitch: client.pitch,
    yaw: client.yaw
  });
}

function playerLeave(id) {
  sendAll({
    action: "leave",
    id: id
  });
}

function playerMove(id, client) {
  sendAll({
    action: "move",
    id: id,
    x: client.x,
    y: client.y,
    z: client.z,
    pitch: client.pitch,
    yaw: client.yaw
  });
}

server.on('connection', socket => {
  let client = {
    color: 0xffffff,
    socket: socket,
    x: width / 2,
    y: 6,
    z: depth / 2,
    pitch: 0,
    yaw: 0
  };

  socket.client = client;
  insertClient(client);

  socket.on('message', msg => {
    if (typeof msg === "string") {
      let packet = JSON.parse(msg);
      if (packet.action == "color") {
        client.color = packet.color;
        updateColor(socket.client.id, packet.color);
      } else if (packet.action == "place" || packet.action == "break") {
        let x = packet.x;
        let y = packet.y;
        let z = packet.z;

        if(y == 0) return;

        if (withinBounds(x, y, z)) {
          map[x][z][y] = (packet.action == "place") ? socket.client.color : null;
          updateBlock(x, y, z);
        }
      } else if (packet.action == "move") {
        socket.client.x = packet.x;
        socket.client.y = packet.y;
        socket.client.z = packet.z;
        socket.client.pitch = packet.pitch;
        socket.client.yaw = packet.yaw;
        playerMove(client.id, client);
      }
    }
  });

  socket.on('error', err => {
    console.log("ERR: " + err);
  });

  socket.on('close', (code, reason) => {
    console.log("CLOSE: " + reason);
    removeClient(client);
    playerLeave(client.id);
  });

  send(client, {
    action: "connect",
    id: client.id,
    color: client.color,
    x: client.x,
    y: client.y,
    z: client.z,
    pitch: client.pitch,
    yaw: client.yaw,
    map: map
  });

  clients.forEach(other => {
    if (other) {
      send(client, {
        action: "join",
        id: other.id,
        color: other.color,
        x: other.x,
        y: other.y,
        z: other.z,
        pitch: other.pitch,
        yaw: other.yaw
      });
    }
  })

  playerJoin(client.id, client);
});

server.on('error', err => {
  console.log(err);
  process.exit(1);
});
