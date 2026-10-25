(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    history: [],
    devices: {
      lights: { is_on: false, brightness: 70 },
      fan: { is_on: false, speed: 60 },
      ac: { is_on: false, target_temperature: 24 }
    },
    present: 26,
    sessionId: "",
    saveTimer: null
  };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(data.error || `${url} failed (${response.status})`);
    }

    return data;
  }

  function showStatus(text, online) {
    const el = $("connectionStatus");
    el.textContent = text;
    el.classList.toggle("online", Boolean(online));
    el.classList.toggle("offline", !online);
  }

  function log(message) {
    const container = $("activityLog");
    const entry = document.createElement("div");

    entry.className = "activity-entry";
    entry.textContent = `${new Date().toLocaleTimeString()} — ${message}`;

    container.prepend(entry);

    while (container.children.length > 30) {
      container.lastElementChild.remove();
    }
  }

  function sensorPayload() {
    return {
      temperature: Number($("temperatureSlider").value),
      humidity: Number($("humiditySlider").value),
      lightLevel: Number($("lightSlider").value),
      people: Number($("peopleSlider").value),
      motionDetected: Number($("peopleSlider").value) > 0
    };
  }

  function paintSliderLabels() {
    $("temperatureSliderLabel").textContent =
      `${$("temperatureSlider").value}°C`;

    $("humiditySliderLabel").textContent =
      `${$("humiditySlider").value}%`;

    $("lightSliderLabel").textContent =
      `${$("lightSlider").value} lux`;

    $("peopleSliderLabel").textContent =
      $("peopleSlider").value;
  }

  function setBadge(id, text, kind) {
    const element = $(id);
    element.textContent = text;
    element.className = `badge ${kind}`;
  }

  function updateDashboard() {
    const s = sensorPayload();

    const temperatureThreshold =
      Number($("temperatureThreshold").value || 30);

    const lightThreshold =
      Number($("lightThreshold").value || 1000);

    const enabled = $("automationEnabled").checked;

    $("temperatureValue").textContent = `${s.temperature}°C`;
    $("humidityValue").textContent = `${s.humidity}%`;
    $("lightValue").textContent = s.lightLevel;
    $("occupancyValue").textContent = s.people;
    $("peopleSummary").textContent = `${s.people} people`;

    paintSliderLabels();

    const hot = s.temperature >= temperatureThreshold;
    const dark = s.lightLevel < lightThreshold;
    const crowded = s.people >= 35;

    $("environmentDescription").textContent = hot
      ? "Temperature is above the configured threshold."
      : "Temperature is within the configured range.";

    setBadge(
      "environmentBadge",
      hot ? "Warm" : "Comfortable",
      hot ? "warning" : "good"
    );

    $("occupancyDescription").textContent = crowded
      ? "High occupancy detected."
      : `${s.people} people currently in the classroom.`;

    setBadge(
      "occupancyBadge",
      crowded ? "Busy" : "Normal",
      crowded ? "warning" : "good"
    );

    $("lightingDescription").textContent = dark
      ? "Light level is below the configured threshold."
      : "Light level is sufficient.";

    setBadge(
      "lightingBadge",
      dark ? "Low light" : "Sufficient",
      dark ? "warning" : "good"
    );

    let rule = "No active rule";
    let recommendation = "Classroom conditions are looking good.";

    if (!enabled) {
      recommendation = "Automation recommendations are disabled.";
    } else if (hot) {
      rule = "Temperature rule";
      recommendation = "Recommendation: turn on the AC to cool the classroom.";
    } else if (dark) {
      rule = "Lighting rule";
      recommendation = "Recommendation: turn on the lights to improve visibility.";
    } else if (crowded) {
      rule = "Occupancy rule";
      recommendation = "High occupancy: check classroom capacity and ventilation.";
    }

    $("activeRule").textContent = rule;
    $("ruleDescription").textContent = recommendation;
  }

  async function saveSettings() {
    return api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        manualMode: true,
        temperatureThreshold: Number($("temperatureThreshold").value),
        lightThreshold: Number($("lightThreshold").value),
        automationEnabled: $("automationEnabled").checked,
        classroomName: $("classroomSelect").value,
        manualTemperature: Number($("temperatureSlider").value),
        manualHumidity: Number($("humiditySlider").value),
        manualLightLevel: Number($("lightSlider").value),
        manualPeople: Number($("peopleSlider").value),
        manualClassSize: Number($("classSize").value || 40)
      })
    });
  }

  async function saveReading() {
    try {
      await saveSettings();

      await api("/api/readings", {
        method: "POST",
        body: JSON.stringify(sensorPayload())
      });

      $("sensorMessage").textContent = "Reading saved successfully.";

      await loadHistory();
    } catch (error) {
      $("sensorMessage").textContent =
        `Could not save reading: ${error.message}`;

      console.error(error);
    }
  }

  function scheduleSave() {
    updateDashboard();

    clearTimeout(state.saveTimer);

    state.saveTimer = setTimeout(saveReading, 350);
  }

  async function loadSettings() {
    const settings = await api("/api/settings");

    $("temperatureThreshold").value =
      settings.temperatureThreshold;

    $("lightThreshold").value =
      settings.lightThreshold;

    $("automationEnabled").checked =
      Boolean(settings.automationEnabled);

    $("classroomSelect").value =
      settings.classroomName;

    const readings = settings.manualReadings;

    if (readings) {
      $("temperatureSlider").value = readings.temperature;
      $("humiditySlider").value = readings.humidity;
      $("lightSlider").value = readings.lightLevel;
      $("peopleSlider").value = readings.people;
      $("classSize").value = readings.classSize;
    }

    updateDashboard();
  }

  async function loadHistory() {
    const response = await api("/api/readings?limit=100");

    state.history = response.readings || [];

    drawChart();
  }

  function drawChart() {
    const canvas = $("environmentChart");

    if (!canvas) return;

    const width = Math.max(280, canvas.clientWidth || 600);
    const height = 220;
    const scale = window.devicePixelRatio || 1;

    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = "12px system-ui";

    const readings = [...state.history].reverse().slice(-20);

    if (readings.length < 2) {
      ctx.fillStyle = "#9aabc4";
      ctx.fillText(
        "Save a few readings to see the temperature trend.",
        12,
        28
      );
      return;
    }

    const values = readings.map(r => Number(r.temperature));
    const min = Math.min(...values) - 2;
    const max = Math.max(...values) + 2;
    const padding = 25;

    ctx.strokeStyle = "#26364f";
    ctx.lineWidth = 1;

    for (let i = 0; i < 4; i++) {
      const y = padding + i * (height - 2 * padding) / 3;

      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#58d5e8";
    ctx.lineWidth = 3;
    ctx.beginPath();

    values.forEach((value, index) => {
      const x = padding +
        index * (width - 2 * padding) / (values.length - 1);

      const y = height - padding -
        ((value - min) / (max - min || 1)) *
        (height - 2 * padding);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    ctx.fillStyle = "#edf4ff";
    ctx.fillText(
      `Temperature (°C): ${values[values.length - 1]}`,
      padding,
      16
    );
  }

  async function loadDevices() {
    const response = await api("/api/devices");

    for (const device of response.devices || []) {
      state.devices[device.device] = device;
    }

    renderDevices();
  }

  function renderDevices() {
    $("lightsToggle").checked =
      Boolean(state.devices.lights?.is_on);

    $("fanToggle").checked =
      Boolean(state.devices.fan?.is_on);

    $("acToggle").checked =
      Boolean(state.devices.ac?.is_on);

    $("fanSpeed").value =
      state.devices.fan?.speed ?? 60;

    $("fanSpeedLabel").textContent =
      `${$("fanSpeed").value}%`;

    $("acTemperature").value =
      state.devices.ac?.target_temperature ?? 24;

    $("acTemperatureLabel").textContent =
      `${$("acTemperature").value}°C`;

    $("fanDescription").textContent =
      state.devices.fan?.is_on ? "Fan is on." : "Fan is off.";
  }

  async function setDevice(device, values) {
    try {
      await api(`/api/devices/${device}`, {
        method: "POST",
        body: JSON.stringify(values)
      });

      await loadDevices();

      $("deviceMessage").textContent =
        `${device.toUpperCase()} updated. These are virtual devices.`;

      log(`${device.toUpperCase()} updated`);
    } catch (error) {
      $("deviceMessage").textContent =
        `Device update failed: ${error.message}`;

      console.error(error);
    }
  }

  function updateAttendance() {
    const total = Math.max(1, Number($("classSize").value || 40));

    state.present = Math.min(
      total,
      Math.max(0, Number(state.present))
    );

    $("presentCount").textContent = state.present;
    $("absentCount").textContent = total - state.present;
    $("attendanceTotal").textContent = total;
    $("attendanceFraction").textContent = `${state.present}/${total}`;

    $("presentSlider").max = total;
    $("presentSlider").value = Math.min(
      Number($("presentSlider").value || state.present),
      total
    );
  }

  function newSessionId() {
    return "SC-" +
      Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function renderQR() {
    const element = $("qrcode");
    element.innerHTML = "";

    const className = $("attendanceClass").value;

    const payload = JSON.stringify({
      project: "SmartClass",
      className,
      sessionId: state.sessionId
    });

    if (window.QRCode) {
      new QRCode(element, {
        text: payload,
        width: 128,
        height: 128,
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      element.textContent =
        "QR library unavailable. Check your internet connection.";
    }

    $("selectedClass").textContent = className;
    $("sessionId").textContent = state.sessionId;
  }

  function exportReport() {
    const total = Number($("classSize").value || 40);

    const report = {
      project: "SmartClass",
      exportedAt: new Date().toISOString(),
      classroom: $("classroomSelect").value,
      attendance: {
        present: state.present,
        total,
        absent: total - state.present
      },
      latestSensors: sensorPayload(),
      history: state.history
    };

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json"
      })
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "smartclass-report.json";
    link.click();

    URL.revokeObjectURL(url);

    log("Report exported");
  }

  function setupEvents() {
    [
      "temperatureSlider",
      "humiditySlider",
      "lightSlider",
      "peopleSlider"
    ].forEach(id => {
      $(id).addEventListener("input", scheduleSave);
    });

    [
      "temperatureThreshold",
      "lightThreshold",
      "automationEnabled",
      "classroomSelect"
    ].forEach(id => {
      $(id).addEventListener("change", async () => {
        updateDashboard();

        try {
          await saveSettings();
        } catch (error) {
          console.error(error);
        }
      });
    });

    const scenarios = {
      normal: {
        temperature: 26,
        humidity: 55,
        lightLevel: 1800,
        people: 25
      },
      hot: {
        temperature: 36,
        humidity: 65,
        lightLevel: 1500,
        people: 30
      },
      dark: {
        temperature: 27,
        humidity: 55,
        lightLevel: 250,
        people: 20
      },
      class: {
        temperature: 29,
        humidity: 60,
        lightLevel: 1200,
        people: 45
      }
    };

    document.querySelectorAll(".scenario").forEach(button => {
      button.addEventListener("click", () => {
        const scenario = scenarios[button.dataset.scenario];

        if (!scenario) return;

        $("temperatureSlider").value = scenario.temperature;
        $("humiditySlider").value = scenario.humidity;
        $("lightSlider").value = scenario.lightLevel;
        $("peopleSlider").value = scenario.people;

        scheduleSave();
        log(`Scenario selected: ${button.textContent}`);
      });
    });

    $("lightsToggle").addEventListener("change", event => {
      setDevice("lights", {
        is_on: event.target.checked,
        brightness: 70
      });
    });

    $("fanToggle").addEventListener("change", event => {
      setDevice("fan", {
        is_on: event.target.checked,
        speed: Number($("fanSpeed").value)
      });
    });

    $("acToggle").addEventListener("change", event => {
      setDevice("ac", {
        is_on: event.target.checked,
        target_temperature: Number($("acTemperature").value)
      });
    });

    $("fanSpeed").addEventListener("input", () => {
      $("fanSpeedLabel").textContent = `${$("fanSpeed").value}%`;
    });

    $("acTemperature").addEventListener("input", () => {
      $("acTemperatureLabel").textContent =
        `${$("acTemperature").value}°C`;
    });

    $("applyFan").addEventListener("click", () => {
      setDevice("fan", {
        is_on: $("fanToggle").checked,
        speed: Number($("fanSpeed").value)
      });
    });

    $("applyAc").addEventListener("click", () => {
      setDevice("ac", {
        is_on: $("acToggle").checked,
        target_temperature: Number($("acTemperature").value)
      });
    });

    $("alertToggle").addEventListener("change", event => {
      log(event.target.checked
        ? "Demo alerts enabled"
        : "Demo alerts disabled");
    });

    $("presentSlider").addEventListener("input", () => {
      state.present = Number($("presentSlider").value);
      updateAttendance();
    });

    $("markPresent").addEventListener("click", () => {
      state.present = Math.min(
        state.present + 1,
        Number($("classSize").value || 40)
      );

      $("presentSlider").value = state.present;
      updateAttendance();
      log("Attendance marked");
    });

    $("clearAttendance").addEventListener("click", () => {
      state.present = 0;
      $("presentSlider").value = 0;
      updateAttendance();
      log("Attendance cleared");
    });

    $("saveQr").addEventListener("click", renderQR);

    $("newSession").addEventListener("click", () => {
      state.sessionId = newSessionId();
      renderQR();
      log("New attendance session created");
    });

    $("attendanceClass").addEventListener("change", renderQR);

    $("clearLog").addEventListener("click", async () => {
      $("activityLog").innerHTML = "";

      try {
        await api("/api/activity", { method: "DELETE" });
      } catch (error) {
        console.error(error);
      }
    });

    $("refreshHistory").addEventListener("click", () => {
      loadHistory().catch(console.error);
    });

    $("exportReport").addEventListener("click", exportReport);

    $("resetDemo").addEventListener("click", async () => {
      $("temperatureSlider").value = 28;
      $("humiditySlider").value = 58;
      $("lightSlider").value = 1800;
      $("peopleSlider").value = 0;
      $("temperatureThreshold").value = 30;
      $("lightThreshold").value = 1000;
      $("automationEnabled").checked = true;
      $("classSize").value = 40;

      state.present = 26;
      $("presentSlider").value = 26;

      updateDashboard();
      updateAttendance();

      try {
        await saveSettings();

        await api("/api/readings", {
          method: "POST",
          body: JSON.stringify(sensorPayload())
        });

        await loadHistory();

        log("Demo reset to default values");
        $("sensorMessage").textContent = "Demo reset successfully.";
      } catch (error) {
        $("sensorMessage").textContent =
          `Reset failed: ${error.message}`;
      }
    });

    window.addEventListener("resize", drawChart);
  }

  async function initialize() {
    showStatus("Connecting…", false);
    setupEvents();

    state.sessionId = newSessionId();

    try {
      await api("/api/health");
      await loadSettings();
      await loadHistory();
      await loadDevices();

      updateAttendance();
      renderQR();

      showStatus("Connected", true);
      log("SmartClass dashboard connected");
    } catch (error) {
      showStatus("Disconnected", false);

      $("sensorMessage").textContent =
        `Could not connect to the backend: ${error.message}`;

      console.error("SmartClass initialization failed:", error);
    }
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();