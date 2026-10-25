
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

let trafficCollection;

// Calculate congestion using vehicle count and queue count.
function calculateStatus(vehicles, queue, sensorOnline) {
    if (!sensorOnline) return "Unknown";

    if (queue >= 15 || vehicles >= 70) return "High";
    if (queue >= 7 || vehicles >= 35) return "Medium";

    return "Low";
}

// Check backend status.
app.get("/", (req, res) => {
    res.send("Smart Campus Traffic Management API is running!");
});

// Get the latest traffic reading.
app.get("/api/traffic", async (req, res) => {
    try {
        const latest = await trafficCollection.findOne(
            {},
            { sort: { updatedAt: -1 } }
        );

        res.json(
            latest || {
                vehicles: 0,
                queue: 0,
                status: "Low",
                sensorOnline: true,
                simulated: true,
                message: "No readings saved yet. Waiting for traffic data.",
            }
        );
    } catch (error) {
        console.error("Could not retrieve traffic:", error.message);

        res.status(500).json({
            message: "Could not retrieve traffic data.",
        });
    }
});

// Save a traffic reading to MongoDB.
app.post("/api/traffic", async (req, res) => {
    try {
        const {
            vehicles,
            queue,
            sensorOnline,
            simulated
        } = req.body;

        // Validate incoming traffic data.
        if (
            !Number.isFinite(vehicles) ||
            !Number.isFinite(queue) ||
            vehicles < 0 ||
            queue < 0 ||
            typeof sensorOnline !== "boolean" ||
            (simulated !== undefined &&
                typeof simulated !== "boolean")
        ) {
            return res.status(400).json({
                message:
                    "Provide valid non-negative vehicle and queue counts, " +
                    "a boolean sensorOnline value, and an optional boolean simulated value.",
            });
        }

        // If simulated is omitted, treat the reading as simulated
        // to preserve compatibility with existing demo buttons.
        const isSimulated = simulated !== false;

        const reading = {
            vehicles,
            queue,
            sensorOnline,
            status: calculateStatus(
                vehicles,
                queue,
                sensorOnline
            ),
            simulated: isSimulated,
            updatedAt: new Date(),
        };

        const result = await trafficCollection.insertOne(reading);

        res.status(201).json({
            message: "Traffic reading saved successfully.",
            data: {
                ...reading,
                _id: result.insertedId,
            },
        });
    } catch (error) {
        console.error("Could not save traffic:", error.message);

        res.status(500).json({
            message: "Could not save traffic data.",
        });
    }
});

// Get the 50 most recent traffic readings.
app.get("/api/traffic/history", async (req, res) => {
    try {
        const history = await trafficCollection
            .find({})
            .sort({ updatedAt: -1 })
            .limit(50)
            .toArray();

        res.json(history);
    } catch (error) {
        console.error("Could not retrieve history:", error.message);

        res.status(500).json({
            message: "Could not retrieve traffic history.",
        });
    }
});

// Connect to MongoDB before starting the server.
async function startServer() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error(
                "MONGODB_URI is missing from backend/.env"
            );
        }

        await client.connect();

        const database = client.db("smart_campus_traffic");
        trafficCollection = database.collection("traffic_readings");

        await trafficCollection.createIndex({ updatedAt: -1 });

        console.log("MongoDB Atlas connected successfully!");

        app.listen(PORT, () => {
            console.log(
                `Traffic API running at http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error(
            "Server startup failed:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
