const { db, getSettings } = require("./database");

console.log("SmartClass simulator running. Press Ctrl+C to stop.");

setInterval(() => {
  const settings = getSettings();

  if (settings.manualMode) return;

  const temperature = Number((24 + Math.random() * 10).toFixed(1));
  const humidity = Math.round(40 + Math.random() * 35);
  const light = Math.round(300 + Math.random() * 1800);
  const people = Math.round(Math.random() * settings.manualReadings.classSize);

  db.prepare(`
    INSERT INTO sensor_readings
      (temperature, humidity, light_level, people, motion_detected)
    VALUES (?, ?, ?, ?, ?)
  `).run(temperature, humidity, light, people, people > 0 ? 1 : 0);

  console.log(`Temperature: ${temperature}°C | People: ${people}`);
}, 5000);