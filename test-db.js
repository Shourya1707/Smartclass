
const{ db } = require("./database");

const insert = db.prepare(`
  INSERT INTO sensor_readings
  (temperature, humidity, motion_detected, light_level)
  VALUES (?, ?, ?, ?)
`);

const result = insert.run(27.5, 58, 1, 650);

console.log("Sensor reading saved!");
console.log("Inserted record ID:", result.lastInsertRowid);

const readings = db.prepare(
  "SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 5"
).all();

console.log("Recent readings:");
console.table(readings);

db.close();
