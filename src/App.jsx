
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api/traffic";
const HISTORY_URL = "http://localhost:5000/api/traffic/history";

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function TrafficChart({ history }) {
  const records = history
    .filter(
      (item) =>
        item.sensorOnline === true &&
        item.updatedAt &&
        Number.isFinite(item.vehicles) &&
        Number.isFinite(item.queue)
    )
    .slice(0, 10)
    .reverse();

  if (records.length === 0) {
    return (
      <div className="chart-empty">
        <p>No traffic readings available yet.</p>
        <p>Click Low, Medium, or High to create demo readings.</p>
      </div>
    );
  }

  const width = 700;
  const height = 280;
  const left = 55;
  const right = 25;
  const top = 25;
  const bottom = 45;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const maxValue = Math.max(
    100,
    ...records.map((item) => item.vehicles),
    ...records.map((item) => item.queue)
  );

  const x = (index) =>
    records.length === 1
      ? left + chartWidth / 2
      : left + (index / (records.length - 1)) * chartWidth;

  const y = (value) =>
    top + chartHeight - (value / maxValue) * chartHeight;

  const vehiclePoints = records
    .map((item, index) => `${x(index)},${y(item.vehicles)}`)
    .join(" ");

  const queuePoints = records
    .map((item, index) => `${x(index)},${y(item.queue)}`)
    .join(" ");

  return (
    <div className="chart-container">
      <div className="chart-legend">
        <span>
          <span className="legend-dot vehicle-dot" />
          Vehicles
        </span>
        <span>
          <span className="legend-dot queue-dot" />
          Queue length
        </span>
      </div>

      <svg
        className="traffic-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Chart of saved vehicle counts and queue lengths"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = Math.round(maxValue * fraction);
          const gridY = y(value);

          return (
            <g key={fraction}>
              <line
                x1={left}
                y1={gridY}
                x2={width - right}
                y2={gridY}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
              />
              <text
                x={left - 10}
                y={gridY + 4}
                textAnchor="end"
                fontSize="11"
                fill="#64748b"
              >
                {value}
              </text>
            </g>
          );
        })}

        <polyline
          points={vehiclePoints}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <polyline
          points={queuePoints}
          fill="none"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {records.map((item, index) => (
          <g key={item._id || `${item.updatedAt}-${index}`}>
            <circle
              cx={x(index)}
              cy={y(item.vehicles)}
              r="4"
              fill="#2563eb"
            >
              <title>{`Vehicles: ${item.vehicles}`}</title>
            </circle>

            <circle
              cx={x(index)}
              cy={y(item.queue)}
              r="4"
              fill="#f97316"
            >
              <title>{`Queue length: ${item.queue}`}</title>
            </circle>

            {(records.length <= 6 ||
              index === 0 ||
              index === records.length - 1 ||
              index === Math.floor((records.length - 1) / 2)) && (
                <text
                  x={x(index)}
                  y={height - 15}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#64748b"
                >
                  {new Date(item.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </text>
              )}
          </g>
        ))}
      </svg>

      <p className="chart-note">
        Showing up to 10 recent online-sensor readings. These are simulated
        demo readings, not live road measurements.
      </p>
    </div>
  );
}

function App() {
  const [traffic, setTraffic] = useState({
    vehicles: 0,
    queue: 0,
    status: "Unknown",
    sensorOnline: true,
    simulated: true,
  });

  const [history, setHistory] = useState([]);
  const [apiConnected, setApiConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadTraffic = useCallback(async () => {
    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error("Could not load traffic data.");
      }

      const data = await response.json();

      setTraffic({
        vehicles: Number(data.vehicles) || 0,
        queue: Number(data.queue) || 0,
        status: data.status || "Unknown",
        sensorOnline: data.sensorOnline === true,
        simulated: data.simulated !== false,
      });

      setApiConnected(true);
      return true;
    } catch {
      setApiConnected(false);
      setError(
        "Cannot connect to the backend. Make sure your Node.js server is running on port 5000."
      );
      return false;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(HISTORY_URL);

      if (!response.ok) {
        throw new Error("Could not load traffic history.");
      }

      const data = await response.json();
      setHistory(Array.isArray(data) ? data : []);
      setApiConnected(true);
      return true;
    } catch {
      setApiConnected(false);
      return false;
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    const results = await Promise.all([loadTraffic(), loadHistory()]);

    if (results.every(Boolean)) {
      setMessage("Dashboard refreshed successfully.");
    }

    setLoading(false);
  }, [loadTraffic, loadHistory]);

  // Automatically retrieve saved traffic data every 10 seconds.
  useEffect(() => {
    refreshDashboard();

    const intervalId = setInterval(() => {
      loadTraffic();
      loadHistory();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [refreshDashboard, loadTraffic, loadHistory]);

  async function saveReading(vehicles, queue, sensorOnline) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vehicles,
          queue,
          sensorOnline,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Could not save traffic reading.");
      }

      setTraffic(result.data);
      setApiConnected(true);
      setMessage(result.message || "Traffic reading saved successfully.");

      const historyResponse = await fetch(HISTORY_URL);

      if (historyResponse.ok) {
        const data = await historyResponse.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(
        err.message ||
        "Could not save the reading. Check your backend and database connection."
      );
    } finally {
      setLoading(false);
    }
  }

  function simulate(level) {
    const demoReadings = {
      Low: { vehicles: 18, queue: 3 },
      Medium: { vehicles: 42, queue: 8 },
      High: { vehicles: 82, queue: 19 },
    };

    const reading = demoReadings[level];
    if (!reading) return;

    saveReading(reading.vehicles, reading.queue, true);
  }

  function toggleSensor() {
    const nextSensorState = traffic.sensorOnline !== true;

    saveReading(
      traffic.vehicles,
      traffic.queue,
      nextSensorState
    );
  }

  function exportHistoryCSV() {
    if (history.length === 0) {
      setError("There is no traffic history to export yet.");
      setMessage("");
      return;
    }

    const columns = [
      "Time",
      "Vehicles",
      "Queue Length",
      "Congestion Level",
      "Sensor Status",
      "Data Type",
    ];

    const rows = history.map((item) => [
      formatTime(item.updatedAt),
      item.vehicles ?? "",
      item.queue ?? "",
      item.status || "Unknown",
      item.sensorOnline ? "Online" : "Offline",
      item.simulated === false ? "Real" : "Simulated",
    ]);

    const escapeCSV = (value) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csvContent = [columns, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "smart-campus-traffic-history.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setError("");
    setMessage("Traffic history exported to CSV.");
  }

  const statusClass = String(traffic.status || "unknown").toLowerCase();

  const alertDetails = {
    Low: {
      icon: "🟢",
      title: "Traffic Flowing Normally",
      description:
        "Traffic congestion is low. Continue routine monitoring.",
    },
    Medium: {
      icon: "🟡",
      title: "Moderate Traffic Detected",
      description:
        "Traffic is increasing. Campus personnel should monitor the gate.",
    },
    High: {
      icon: "🔴",
      title: "High Congestion Alert",
      description:
        "Heavy congestion is indicated by the demo readings. Notify authorized campus personnel to assess the situation.",
    },
    Unknown: {
      icon: "⚪",
      title: "Traffic Status Unknown",
      description:
        "The sensor is offline or traffic status is unavailable. Current traffic conditions cannot be confirmed.",
    },
  };

  const currentAlert =
    alertDetails[traffic.status] || alertDetails.Unknown;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">SMART CAMPUS TRAFFIC MANAGEMENT</p>
          <h1>Traffic Monitoring Dashboard</h1>
          <p className="subtitle">
            Monitor congestion near the campus gate and review saved demo
            readings.
          </p>
        </div>

        <div
          className={`connection-badge ${apiConnected ? "connected" : "disconnected"
            }`}
        >
          <span className="connection-dot" />
          {apiConnected ? "Backend Connected" : "Backend Disconnected"}
        </div>
      </header>

      <main className="dashboard">
        <section className={`alert-panel alert-${statusClass}`}>
          <div className="alert-icon">{currentAlert.icon}</div>
          <div>
            <h3>{currentAlert.title}</h3>
            <p>{currentAlert.description}</p>
          </div>
        </section>

        <div className="demo-notice">
          <strong>Demo mode:</strong> Traffic readings are simulated using
          dashboard buttons. This prototype does not yet receive data from
          physical sensors or measure live road traffic.
        </div>

        {error && (
          <div className="notice error-notice" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="notice success-notice" role="status">
            {message}
          </div>
        )}

        <section className="stats">
          <article className="stat-card">
            <div className="stat-icon vehicle-icon">🚗</div>
            <p className="stat-label">Vehicle Count</p>
            <h2>{traffic.vehicles}</h2>
            <p className="stat-description">Vehicles in the demo reading</p>
          </article>

          <article className="stat-card">
            <div className="stat-icon queue-icon">🚦</div>
            <p className="stat-label">Queue Length</p>
            <h2>{traffic.queue}</h2>
            <p className="stat-description">Vehicles waiting in the demo</p>
          </article>

          <article className="stat-card">
            <div className="stat-icon status-icon">📊</div>
            <p className="stat-label">Congestion Level</p>
            <h2 className={`status-value status-${statusClass}`}>
              {traffic.status}
            </h2>
            <p className="stat-description">
              Calculated by backend threshold rules
            </p>
          </article>

          <article className="stat-card">
            <div className="stat-icon sensor-icon">📡</div>
            <p className="stat-label">Sensor Status</p>
            <h2
              className={
                traffic.sensorOnline ? "sensor-online" : "sensor-offline"
              }
            >
              {traffic.sensorOnline ? "Online" : "Offline"}
            </h2>
            <p className="stat-description">Simulated sensor state</p>
          </article>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Traffic Analytics</h3>
              <p>
                Compare vehicle counts and queue lengths from saved readings.
              </p>
            </div>
          </div>

          <TrafficChart history={history} />
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Traffic Simulation</h3>
              <p>
                Select a traffic level to save a demo reading in MongoDB.
              </p>
            </div>
          </div>

          <div className="simulation-buttons">
            <button
              className="simulation-button low-button"
              onClick={() => simulate("Low")}
              disabled={loading || !apiConnected}
            >
              <span>🟢</span> Simulate Low Traffic
            </button>

            <button
              className="simulation-button medium-button"
              onClick={() => simulate("Medium")}
              disabled={loading || !apiConnected}
            >
              <span>🟡</span> Simulate Medium Traffic
            </button>

            <button
              className="simulation-button high-button"
              onClick={() => simulate("High")}
              disabled={loading || !apiConnected}
            >
              <span>🔴</span> Simulate High Traffic
            </button>
          </div>

          <div className="sensor-control">
            <div>
              <h4>Sensor Failure Test</h4>
              <p>
                Simulate a sensor going offline or coming back online. This
                does not control physical hardware.
              </p>
            </div>

            <button
              className="secondary-button"
              onClick={toggleSensor}
              disabled={loading || !apiConnected}
            >
              {traffic.sensorOnline
                ? "Simulate Sensor Offline"
                : "Simulate Sensor Online"}
            </button>
          </div>

          {loading && <p className="loading-text">Processing request...</p>}
        </section>

        <section className="panel">
          <div className="panel-heading history-heading">
            <div>
              <h3>Traffic History</h3>
              <p>
                Recent readings retrieved from the MongoDB database.
              </p>
            </div>

            <div className="history-actions">
              <button
                className="secondary-button"
                onClick={refreshDashboard}
                disabled={loading}
              >
                ↻ Refresh
              </button>

              <button
                className="primary-button"
                onClick={exportHistoryCSV}
                disabled={history.length === 0}
              >
                ↓ Export CSV
              </button>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="empty-history">
              <p>No saved traffic readings yet.</p>
              <p>Choose a traffic simulation above to get started.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Vehicles</th>
                    <th>Queue</th>
                    <th>Congestion</th>
                    <th>Sensor</th>
                    <th>Data Type</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((item, index) => (
                    <tr key={item._id || `${item.updatedAt}-${index}`}>
                      <td>{formatTime(item.updatedAt)}</td>
                      <td>{item.vehicles ?? "—"}</td>
                      <td>{item.queue ?? "—"}</td>
                      <td>
                        <span
                          className={`table-status status-${String(
                            item.status || "unknown"
                          ).toLowerCase()}`}
                        >
                          {item.status || "Unknown"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            item.sensorOnline
                              ? "sensor-online"
                              : "sensor-offline"
                          }
                        >
                          {item.sensorOnline ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td>
                        {item.simulated === false ? "Real" : "Simulated"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="table-footnote">
            The dashboard displays up to 50 recent records from the backend.
            Data refreshes automatically every 10 seconds.
          </p>
        </section>

        <footer className="app-footer">
          <p>
            Smart Campus Traffic Monitoring and Congestion Management System
          </p>
          <p>Academic prototype · Simulated traffic data</p>
        </footer>
      </main>
    </div>
  );
}

export default App;
