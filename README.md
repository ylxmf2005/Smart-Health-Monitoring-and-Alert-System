# Smart Health Monitoring and Alert System

A real-time health monitoring system that provides personalized vital sign monitoring, activity-based anomaly detection, and trend analysis visualization enhanced by LLM insights. The system uses MQTT, TimescaleDB, React, Flask, and Python.

## Overview

This system is crucial for early detection of health risks, enhancing preventive care and improving outcomes in personalized and remote healthcare. It employs:

- Real-time personalized vital sign monitoring
- Activity-based immediate anomaly detection using multiple algorithms
- Trend analysis visualization with LLM-enhanced insights
- MQTT for reliable real-time data transmission
- Time-series database for efficient data storage and trend analysis

![System Architecture](https://s2.loli.net/2025/04/18/ap6EOzDlFoxM8kY.png)

## Results

![Results](https://s2.loli.net/2025/04/18/zZchPaD6eGHkmYs.png)

## Setup

1.  **Environment Variables**: Copy the example environment file `.env.example` to `.env` and fill in the required values.

    ```bash
    cp .env.example .env
    # Edit .env with your specific values
    ```

2.  **Dependencies**: Install frontend dependencies.

    ```bash
    npm install
    ```

    Install backend and simulator dependencies:

    Option 1: Using [uv](https://github.com/astral-sh/uv) (Recommended):
    ```bash
    uv sync
    ```
    
    Option 2: Using requirements.txt (Not tested):
    ```bash
    pip install -r requirements.txt
    ```

## Running the System

1.  **Start Infrastructure Services**: Use Docker Compose to start the MQTT broker and TimescaleDB database.

    Before starting, ensure the required ports are available on your system:
    * Port 1883 (TCP) and 9001 (WebSockets) for MQTT broker
    * Port 5432 for TimescaleDB
    
    You can check if ports are in use with:
    ```bash
    # For Linux/macOS
    lsof -i :1883
    lsof -i :9001
    lsof -i :5432
    
    # For Windows
    netstat -ano | findstr :1883
    netstat -ano | findstr :9001
    netstat -ano | findstr :5432
    ```

    Once ports are confirmed available, start the services:
    ```bash
    docker-compose up -d
    ```
    *   MQTT broker runs on port `1883` (TCP) and `9001` (WebSockets).
    *   TimescaleDB runs on port `5432`.

2.  **Run the Backend Service**: The backend connects to MQTT, processes data, stores it in the database, detects anomalies, and provides an API.

    ```bash
    python backend/mqtt_backend.py
    ```
    *   The backend Flask API will run on port `5001` (or as configured in `.env`).

3.  **Run the Simulator**: This script generates sample health data and publishes it to the MQTT broker.

    ```bash
    python simulator/mqtt_simulator.py
    ```
    *   Publishes to the `health/raw_vitals` topic by default.

4.  **Run the Frontend Application**: Start the React development server.

    ```bash
    npm start
    ```
    *   The frontend will be accessible at `http://localhost:3000` (or the port specified by React Scripts).

## Stopping and Resetting

*   To stop the infrastructure services (MQTT, DB):
    ```bash
    docker-compose down
    ```
*   To stop and remove all data volumes (use with caution):
    ```bash
    docker-compose down -v
    ```
*   Stop the backend, simulator, and frontend using `Ctrl+C` in their respective terminals.