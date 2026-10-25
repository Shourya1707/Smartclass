
const db = require("./database");

console.log("Virtual devices:");
console.table(
  db.prepare("SELECT * FROM device_states ORDER BY device").all()
);

console.log("Control history:");
console.table(
  db.prepare(
    "SELECT * FROM control_logs ORDER BY id DESC LIMIT 10"
  ).all()
);

db.close();
