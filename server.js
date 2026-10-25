```javascript
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

// --------------------------------------------------
// Activity logging: supports the existing SQLite schema
// --------------------------------------------------
function logAction(message, device = "lights", action = "info") {
  const allowedDevices = ["ac", "fan", "lights"];

  if (!allowedDevices.includes(device)) {
    device = "lights";
  }

  const columns = db
    .prepare("PRAGMA table_info(control_logs)")
    .all()
    .map(column => column.name);

  const values = {
    device,
    action,
    details: message,
    message
  };

  const insertColumns = Object.keys(values).filter(column =>
    columns.includes(column)
  );

  if (
    !insertColumns.includes("device") ||
    !insertColumns.includes("action")
  ) {
    throw new Error(
      "control_logs must contain device and action columns"
    );
  }

    const sql =`
    INSERT INTO control_logs (${insertColumns.join(", ")})
    VALUES (${insertColumns.map(() => "?").join(", ")})
  `;

  db.prepare(sql).run(
    ...insertColumns.map(column => values[column])
  );

  db.prepare(sql).run(
    ...insertColumns.map(column => values[column])
  );
}

// --------------------------------------------------
// Health check — updated for CI/CD demonstration
// --------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    project: "SmartClass",
    version: "2.0.0",
    status: "Backend is healthy",
    deployment: "Jenkins CI/CD + Kubernetes"
  });
});

// --------------------------------------------------
// Settings
// --------------------------------------------------
app.get("/api/settings", (req, res, next) => {
  try {
    res.json({
      success: true,
      ...getSettings()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/settings", (req, res, next) => {
  try {
    const body = { ...(req.body || {}) };

    const ranges = {
      manualTemperature: [0, 60],
      manualHumidity: [0, 100],
      manualLightLevel: [0, 4095],
      manualPeople: [0, 500],
      manualClassSize: [1, 500],
      temperatureThreshold: [0, 60],
      lightThreshold: [0, 4095]
    };

    for (const [key, [min, max]] of Object.entries(ranges)) {
      if (body[key] === undefined) continue;

      const value = Number(body[key]);

      if (!Number.isFinite(value) || value < min || value > max) {
        return res.status(400).json({
          success: false,
          error: `${key} must be between ${min} and ${max}`
        });
      }

      body[key] = value;
    }

    const settings = saveSettings(body);

    logAction("Classroom settings updated", "lights", "settings");

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// Sensor readings
// --------------------------------------------------
app.post("/api/readings", (req, res, next) => {
  try {
    const body = req.body || {};

    const temperature = Number(body.temperature);
    const humidity = Number(body.humidity);
    const lightLevel = Number(body.lightLevel ?? body.light_level);
    const people = Number(body.people ?? 0);

    const motionDetected =
      body.motionDetected ?? body.motion_detected ?? false;

    if (
      !Number.isFinite(temperature) ||
      !Number.isFinite(humidity) ||
      !Number.isFinite(lightLevel) ||
      !Number.isFinite(people)
    ) {
      return res.status(400).json({
        success: false,
        error: "All sensor values must be valid numbers"
      });
    }

    if (
      temperature < 0 || temperature > 100 ||
      humidity < 0 || humidity > 100 ||
      lightLevel < 0 ||
      people < 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Sensor values are outside the accepted range"
      });
    }

    const sensorColumns = db
      .prepare("PRAGMA table_info(sensor_readings)")
      .all()
      .map(column => column.name);

    const readingValues = {
      temperature,
      humidity,
      light_level: lightLevel,
      people,
      motion_detected: motionDetected ? 1 : 0
    };

    const insertColumns = Object.keys(readingValues).filter(column =>
      sensorColumns.includes(column)
    );

    for (const required of [
      "temperature",
      "humidity",
      "light_level"
    ]) {
      if (!insertColumns.includes(required)) {
        throw new Error(`sensor_readings is missing ${required}`);
      }
    }

    const sql = `
      INSERT INTO sensor_readings (${insertColumns.join(", ")})
      VALUES (${insertColumns.map(() => "?").join(", ")})
    `;

    const result = db.prepare(sql).run(
      ...insertColumns.map(column => readingValues[column])
    );

    const reading = db.prepare(`
      SELECT *
      FROM sensor_readings
      WHERE id = ?
    `).get(result.lastInsertRowid);

    logAction(
      `Sensor reading saved: ${temperature}°C, ${humidity}% humidity`,
      "lights",
      "reading_saved"
    );

    res.status(201).json({
      success: true,
      reading
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/readings", (req, res, next) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);

    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 500))
      : 100;

    const readings = db.prepare(`
      SELECT *
      FROM sensor_readings
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);

    res.json({
      success: true,
      readings
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/readings/latest", (req, res, next) => {
  try {
    const reading = db.prepare(`
      SELECT *
      FROM sensor_readings
      ORDER BY id DESC
      LIMIT 1
    `).get();

    res.json({
      success: true,
      reading: reading || null
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// Devices
// --------------------------------------------------
app.get("/api/devices", (req, res, next) => {
  try {
    const devices = db.prepare(`
      SELECT *
      FROM device_states
      ORDER BY device
    `).all();

    res.json({
      success: true,
      devices
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/devices/:device", (req, res, next) => {
  try {
    const device = req.params.device;

    if (!["lights", "fan", "ac"].includes(device)) {
      return res.status(400).json({
        success: false,
        error: "Device must be lights, fan or ac"
      });
    }

    const isOn = req.body?.is_on;

    if (![true, false, 0, 1].includes(isOn)) {
      return res.status(400).json({
        success: false,
        error: "is_on must be true, false, 1 or 0"
      });
    }

    db.prepare(`
      UPDATE device_states
      SET is_on = ?,
          updated_at = datetime('now', 'localtime')
      WHERE device = ?
    `).run(isOn ? 1 : 0, device);

    const updatedDevice = db.prepare(`
      SELECT *
      FROM device_states
      WHERE device = ?
    `).get(device);

    logAction(
      `${device} turned ${isOn ? "ON" : "OFF"}`,
      device,
      isOn ? "turned_on" : "turned_off"
    );

    res.json({
      success: true,
      device: updatedDevice
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// Activity logs
// --------------------------------------------------
app.get("/api/activity", (req, res, next) => {
  try {
    const activity = db.prepare(`
      SELECT *
      FROM control_logs
      ORDER BY id DESC
      LIMIT 100
    `).all();

    res.json({
      success: true,
      activity,
      logs: activity
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/activity", (req, res, next) => {
  try {
    db.prepare("DELETE FROM control_logs").run();

    res.json({
      success: true,
      message: "Activity log cleared"
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// Dashboard fallback
// --------------------------------------------------
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------------------------------------
// Error handler
// --------------------------------------------------
app.use((error, req, res, next) => {
  console.error("API error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    error: error.message || "An internal server error occurred"
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`SmartClass running on port ${PORT}`);
});
```
