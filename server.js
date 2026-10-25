const express = require("express");
const path = require("path");
const {
  db,
  getSettings,
  saveSettings
} = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function logAction(message) {
  db.prepare("INSERT INTO control_logs (message) VALUES (?)").run(message);
}

function bounded(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

app.get("/api/health", (_req, res) => {
  res.json({ success: true, project: "SmartClass", status: "Backend is healthy" });
});

app.get("/api/settings", (_req, res) => {
  res.json({ success: true, ...getSettings() });
});

app.post("/api/settings", (req, res) => {
  const body = { ...(req.body || {}) };

  const ranges = {
    temperatureThreshold: [30, 10, 50],
    lightThreshold: [1000, 0, 5000],
    manualTemperature: [28, 0, 50],
    manualHumidity: [58, 0, 100],
    manualLightLevel: [1800, 0, 10000],
    manualPeople: [0, 0, 300],
    manualClassSize: [40, 1, 300]
  };

  for (const [key, [fallback, min, max]] of Object.entries(ranges)) {
    if (key in body) body[key] = bounded(body[key], fallback, min, max);
  }

  const settings = saveSettings(body);
  logAction("Settings updated");
  res.json({ success: true, ...settings });
});

app.post("/api/readings", (req, res) => {
  const body = req.body || {};
  const defaults = getSettings().manualReadings;

  const reading = {
    temperature: bounded(body.temperature, defaults.temperature, 0, 60),
    humidity: bounded(body.humidity, defaults.humidity, 0, 100),
    lightLevel: bounded(body.lightLevel ?? body.light_level, defaults.lightLevel, 0, 10000),
    people: bounded(body.people, defaults.people, 0, 300),
    motionDetected: Boolean(body.motionDetected ?? body.motion_detected)
  };

  const result = db.prepare(`
    INSERT INTO sensor_readings
      (temperature, humidity, light_level, people, motion_detected)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    reading.temperature,
    reading.humidity,
    reading.lightLevel,
    reading.people,
    reading.motionDetected ? 1 : 0
  );

  logAction(`Sensor reading saved: ${reading.temperature}°C`);

  res.json({ success: true, id: result.lastInsertRowid, reading });
});

app.get("/api/readings", (req, res) => {
  const limit = bounded(req.query.limit, 100, 1, 500);

  const readings = db.prepare(`
    SELECT id, temperature, humidity, light_level, people,
      motion_detected AS motionDetected, created_at AS createdAt
    FROM sensor_readings
    ORDER BY id DESC LIMIT ?
  `).all(limit).map(r => ({
    ...r,
    motionDetected: Boolean(r.motionDetected)
  }));

  res.json({ success: true, count: readings.length, readings });
});

app.get("/api/readings/latest", (_req, res) => {
  const reading = db.prepare(`
    SELECT id, temperature, humidity, light_level, people,
      motion_detected AS motionDetected, created_at AS createdAt
    FROM sensor_readings
    ORDER BY id DESC LIMIT 1
  `).get();

  res.json({
    success: true,
    reading: reading ? {
      ...reading,
      motionDetected: Boolean(reading.motionDetected)
    } : null
  });
});

app.get("/api/devices", (_req, res) => {
  const devices = db.prepare(`
    SELECT device, is_on, speed, brightness, target_temperature
    FROM device_states
  `).all().map(d => ({ ...d, is_on: Boolean(d.is_on) }));

  res.json({ success: true, devices });
});

app.post("/api/devices/:device", (req, res) => {
  const device = req.params.device;

  if (!["lights", "fan", "ac"].includes(device)) {
    return res.status(400).json({ success: false, error: "Unknown device" });
  }

  const body = req.body || {};
  const current = db.prepare(
    "SELECT * FROM device_states WHERE device = ?"
  ).get(device);

  const isOn = body.is_on ?? body.isOn ?? Boolean(current.is_on);
  const speed = device === "fan"
    ? bounded(body.speed, current.speed ?? 60, 0, 100)
    : current.speed;
  const brightness = device === "lights"
    ? bounded(body.brightness, current.brightness ?? 70, 0, 100)
    : current.brightness;
  const target = device === "ac"
    ? bounded(body.target_temperature ?? body.targetTemperature,
        current.target_temperature ?? 24, 16, 30)
    : current.target_temperature;

  db.prepare(`
    UPDATE device_states
    SET is_on = ?, speed = ?, brightness = ?, target_temperature = ?,
        updated_at = datetime('now','localtime')
    WHERE device = ?
  `).run(isOn ? 1 : 0, speed, brightness, target, device);

  logAction(`${device.toUpperCase()} updated`);

  const updated = db.prepare(
    "SELECT * FROM device_states WHERE device = ?"
  ).get(device);

  res.json({
    success: true,
    device: { ...updated, is_on: Boolean(updated.is_on) }
  });
});

app.get("/api/activity", (_req, res) => {
  const logs = db.prepare(`
    SELECT id, message, created_at AS createdAt
    FROM control_logs ORDER BY id DESC LIMIT 30
  `).all();

  res.json({ success: true, logs });
});

app.delete("/api/activity", (_req, res) => {
  db.prepare("DELETE FROM control_logs").run();
  res.json({ success: true });
});

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`SmartClass running at http://localhost:${PORT}`);
});