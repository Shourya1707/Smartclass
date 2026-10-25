const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "smartclass.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sensor_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    light_level INTEGER NOT NULL,
    people INTEGER NOT NULL DEFAULT 0,
    motion_detected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS device_states (
    device TEXT PRIMARY KEY,
    is_on INTEGER NOT NULL DEFAULT 0,
    speed INTEGER,
    brightness INTEGER,
    target_temperature INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS control_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

function columnsOf(table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all()
    .map(column => column.name);
}

// Preserve the existing settings table if its schema is incompatible.
const settingsColumns = columnsOf("app_settings");

if (
  settingsColumns.length &&
  (!settingsColumns.includes("key") ||
   !settingsColumns.includes("value"))
) {
  let backupName = "app_settings_legacy";
  let suffix = 1;

  while (columnsOf(backupName).length) {
    backupName = `app_settings_legacy_${suffix++}`;
  }

  db.exec(`ALTER TABLE app_settings RENAME TO "${backupName}"`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const getSettingStmt = db.prepare(
  "SELECT value FROM app_settings WHERE key = ?"
);

const setSettingStmt = db.prepare(`
  INSERT INTO app_settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const defaults = {
  manual_mode: true,
  temperature_threshold: 30,
  light_threshold: 1000,
  automation_enabled: true,
  classroom_name: "B.Tech CSE — Section A",
  manual_temperature: 28,
  manual_humidity: 58,
  manual_light_level: 1800,
  manual_people: 0,
  manual_class_size: 40
};

function getSetting(key, fallback = null) {
  const row = getSettingStmt.get(key);

  if (!row) return fallback;

  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(key, value) {
  setSettingStmt.run(key, JSON.stringify(value));
}

for (const [key, value] of Object.entries(defaults)) {
  if (getSettingStmt.get(key) === undefined) {
    setSetting(key, value);
  }
}

const insertDevice = db.prepare(`
  INSERT OR IGNORE INTO device_states
    (device, is_on, speed, brightness, target_temperature)
  VALUES (?, ?, ?, ?, ?)
`);

insertDevice.run("lights", 0, null, 70, null);
insertDevice.run("fan", 0, 60, null, null);
insertDevice.run("ac", 0, null, null, 24);

function getManualReadings() {
  return {
    temperature: Number(getSetting("manual_temperature", 28)),
    humidity: Number(getSetting("manual_humidity", 58)),
    lightLevel: Number(getSetting("manual_light_level", 1800)),
    people: Number(getSetting("manual_people", 0)),
    classSize: Number(getSetting("manual_class_size", 40))
  };
}

function getSettings() {
  return {
    manualMode: Boolean(getSetting("manual_mode", true)),
    temperatureThreshold: Number(getSetting("temperature_threshold", 30)),
    lightThreshold: Number(getSetting("light_threshold", 1000)),
    automationEnabled: Boolean(getSetting("automation_enabled", true)),
    classroomName: String(
      getSetting("classroom_name", "B.Tech CSE — Section A")
    ),
    manualReadings: getManualReadings()
  };
}

function saveSettings(body) {
  const mapping = {
    manualMode: "manual_mode",
    temperatureThreshold: "temperature_threshold",
    lightThreshold: "light_threshold",
    automationEnabled: "automation_enabled",
    classroomName: "classroom_name",
    manualTemperature: "manual_temperature",
    manualHumidity: "manual_humidity",
    manualLightLevel: "manual_light_level",
    manualPeople: "manual_people",
    manualClassSize: "manual_class_size"
  };

  for (const [input, key] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(body, input)) {
      setSetting(key, body[input]);
    }
  }

  return getSettings();
}

module.exports = {
  db,
  getSetting,
  setSetting,
  getManualReadings,
  getSettings,
  saveSettings
};