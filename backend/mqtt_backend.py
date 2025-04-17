import os
import sys
import json
import logging
import threading
import time
import paho.mqtt.client as mqtt  # type: ignore
from datetime import datetime
import numpy as np
import signal
import psycopg2  # type: ignore
from psycopg2 import pool  # type: ignore
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from pydantic import ValidationError
import openai

from algorithm.range_based_anomaly_detector import RangeBasedAnomalyDetector
from algorithm.user_baseline_anomaly_detector import UserBaselineAnomalyDetector
from backend.trend_analyzer import TrendAnalyzer
from backend.data_models import HealthDataRecord, AnomalyRecord, DetectorType

load_dotenv()

# Configuration
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_NAME = os.environ.get("DB_NAME", "health_monitoring")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "password")

DEFAULT_MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost")
DEFAULT_MQTT_PORT = int(os.environ.get("MQTT_PORT", 1883))
DEFAULT_MQTT_RAW_TOPIC = os.environ.get("MQTT_RAW_TOPIC", "health/raw_vitals")
DEFAULT_MQTT_VITALS_TOPIC = os.environ.get("MQTT_VITALS_TOPIC", "health/vitals")
DEFAULT_MQTT_ALERTS_TOPIC = os.environ.get("MQTT_ALERTS_TOPIC", "health/alerts")
DEFAULT_MQTT_TRENDS_TOPIC = os.environ.get("MQTT_TRENDS_TOPIC", "health/trends")
DEFAULT_MQTT_CONFIG_TOPIC = os.environ.get("MQTT_CONFIG_TOPIC", "health/config")

LLM_CONFIG = {
    "base_url": os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/v1"),
    "api_key": os.environ.get("LLM_API_KEY", ""),
    "model": os.environ.get("LLM_MODEL", "deepseek-chat"),
    "temperature": float(os.environ.get("LLM_TEMPERATURE", 1.0)),
}

openai_client = openai.OpenAI(
    api_key=LLM_CONFIG["api_key"], base_url=LLM_CONFIG["base_url"]
)

PROMPT_PATH = os.path.join(
    os.path.dirname(__file__), "trend_prompts", "trend_analysis_en.md"
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("mqtt_backend")

# Setup
flask_app = Flask(__name__)
CORS(flask_app)
db_pool = None

# Initialize detectors
detectors = {
    DetectorType.RANGE_BASED: RangeBasedAnomalyDetector(),
    DetectorType.USER_BASELINE: UserBaselineAnomalyDetector(),
}

# Current detector configuration
current_detector_type = DetectorType.RANGE_BASED
current_user_id = "default"


@flask_app.route("/api/alerts/history", methods=["GET"])
def get_alerts_history():
    """API endpoint to retrieve historical alerts from the database."""
    db_pool = flask_app.config.get("DB_POOL")
    if not db_pool:
        return jsonify({"error": "Database connection not available"}), 503

    limit = request.args.get("limit", default=50, type=int)
    limit = max(1, min(limit, 1000))

    user_id = request.args.get("user_id", default=current_user_id)

    conn = None
    try:
        conn = db_pool.getconn()
        with conn.cursor() as cur:
            sql = """
                SELECT timestamp, parameter, value, severity, activity_level, 
                       normal_range_min, normal_range_max, deviation_percent, evidence
                FROM alerts
                WHERE user_id = %s
                ORDER BY timestamp DESC
                LIMIT %s
            """
            cur.execute(sql, (user_id, limit))
            rows = cur.fetchall()

            alerts_history = []
            column_names = [desc[0] for desc in cur.description]
            for row in rows:
                alert = dict(zip(column_names, row))
                if isinstance(alert.get("timestamp"), datetime):
                    alert["timestamp"] = alert["timestamp"].isoformat()
                if "normal_range_min" in alert and "normal_range_max" in alert:
                    alert["normal_range"] = (
                        alert.pop("normal_range_min"),
                        alert.pop("normal_range_max"),
                    )
                alerts_history.append(alert)

        return jsonify(alerts_history)

    except psycopg2.Error as db_err:
        logger.error(f"Database error fetching alerts history: {db_err}")
        return jsonify({"error": "Database error"}), 500
    except Exception as e:
        logger.error(f"Error fetching alerts history: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if conn:
            db_pool.putconn(conn)


@flask_app.route("/api/trends", methods=["GET"])
def get_trends():
    """API endpoint to retrieve trend data."""
    db_pool = flask_app.config.get("DB_POOL")
    if not db_pool:
        return jsonify({"error": "Database connection not available"}), 503

    try:
        trends = TrendAnalyzer.analyze_trends(db_pool)
        return jsonify({"trends": trends})
    except Exception as e:
        logger.error(f"Error analyzing trends: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@flask_app.route("/api/detector/current", methods=["GET"])
def get_current_detector():
    """API endpoint to get current detector configuration."""
    return jsonify({"detector_type": current_detector_type, "user_id": current_user_id})


@flask_app.route("/api/detector/set", methods=["POST"])
def set_detector():
    """API endpoint to set the current detector."""
    global current_detector_type, current_user_id

    data = request.json
    detector_type = data.get("detector_type")
    user_id = data.get("user_id", current_user_id)

    if detector_type not in [DetectorType.RANGE_BASED, DetectorType.USER_BASELINE]:
        return jsonify({"error": "Invalid detector type"}), 400

    current_detector_type = detector_type
    current_user_id = user_id

    # If using user baseline detector, set the user ID
    if current_detector_type == DetectorType.USER_BASELINE:
        user_baseline_detector = detectors[DetectorType.USER_BASELINE]
        user_baseline_detector.set_user_id(current_user_id)

    # Publish configuration change
    mqtt_client = flask_app.config.get("MQTT_CLIENT")
    if mqtt_client:
        config_topic = DEFAULT_MQTT_CONFIG_TOPIC
        config_payload = json.dumps(
            {"detector_type": current_detector_type, "user_id": current_user_id}
        )
        mqtt_client.publish(config_topic, config_payload)

    return jsonify(
        {
            "success": True,
            "detector_type": current_detector_type,
            "user_id": current_user_id,
        }
    )


@flask_app.route("/api/user/baselines", methods=["GET"])
def get_user_baselines():
    """API endpoint to get user baseline statistics."""
    user_id = request.args.get("user_id", default=current_user_id)

    if current_detector_type != DetectorType.USER_BASELINE:
        return jsonify({"error": "User baseline detector not active"}), 400

    detector = detectors[DetectorType.USER_BASELINE]
    detector.set_user_id(user_id)

    stats = detector.get_learning_statistics()
    return jsonify(stats)


@flask_app.route("/api/user/reset_baselines", methods=["POST"])
def reset_user_baselines():
    """API endpoint to reset user baselines."""
    data = request.json
    user_id = data.get("user_id", current_user_id)

    if current_detector_type != DetectorType.USER_BASELINE:
        return jsonify({"error": "User baseline detector not active"}), 400

    detector = detectors[DetectorType.USER_BASELINE]
    success = detector.reset_user_baselines(user_id)

    if success:
        return jsonify(
            {"success": True, "message": "User baselines reset successfully"}
        )
    else:
        return jsonify({"error": "Failed to reset user baselines"}), 500


@flask_app.route("/api/trends/llm_analysis", methods=["POST"])
def llm_trend_analysis():
    """API endpoint: Analyze trend data with LLM and return markdown advice."""
    data = request.json
    required_fields = ["parameter", "time_scale", "unit", "timestamps", "values"]
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400
    try:
        with open(PROMPT_PATH, "r", encoding="utf-8") as f:
            prompt_template = f.read()
    except Exception as e:
        return jsonify({"error": f"Prompt file error: {e}"}), 500
    prompt = prompt_template.format(
        parameter=data["parameter"],
        time_scale=data["time_scale"],
        unit=data["unit"],
        timestamps=", ".join(map(str, data["timestamps"])),
        values=", ".join(map(str, data["values"])),
    )
    try:
        response = openai_client.chat.completions.create(
            model=LLM_CONFIG["model"],
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional health data analyst.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=LLM_CONFIG["temperature"],
        )
        markdown = response.choices[0].message.content
        return jsonify({"markdown": markdown})
    except Exception as e:
        return jsonify({"error": f"LLM API error: {e}"}), 500


def init_db(conn_pool: pool.SimpleConnectionPool):
    """Initializes the database schema."""
    conn = None
    try:
        conn = conn_pool.getconn()
        with conn.cursor() as cur:
            # Vitals Table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS vitals (
                    timestamp TIMESTAMPTZ NOT NULL,
                    heart_rate REAL,
                    blood_pressure_systolic REAL,
                    blood_pressure_diastolic REAL,
                    temperature REAL,
                    oxygen_saturation REAL,
                    activity INTEGER,
                    user_id TEXT DEFAULT 'default'
                );            
            """
            )
            logger.info("Checked/created 'vitals' table.")

            # TimescaleDB Hypertable
            try:
                cur.execute(
                    "SELECT create_hypertable('vitals', 'timestamp', if_not_exists => TRUE);"
                )
                logger.info("Ensured 'vitals' is a TimescaleDB hypertable.")
            except psycopg2.Error as ts_err:
                if "already a hypertable" in str(ts_err) or "already exists" in str(
                    ts_err
                ):
                    logger.info("'vitals' is already a hypertable.")
                else:
                    raise ts_err

            # Alerts Table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS alerts (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMPTZ NOT NULL,
                    parameter TEXT,
                    value REAL,
                    severity TEXT,
                    activity_level TEXT,
                    normal_range_min REAL,
                    normal_range_max REAL,
                    deviation_percent REAL,
                    evidence TEXT,
                    user_id TEXT DEFAULT 'default'
                );
            """
            )
            logger.info("Checked/created 'alerts' table.")

            # User Health Baselines Table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_health_baselines (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    parameter TEXT NOT NULL,
                    activity_level TEXT NOT NULL,
                    mean_value REAL NOT NULL,
                    std_deviation REAL NOT NULL,
                    sample_count INTEGER NOT NULL,
                    last_updated TIMESTAMPTZ NOT NULL,
                    UNIQUE (user_id, parameter, activity_level)
                );
            """
            )
            logger.info("Checked/created 'user_health_baselines' table.")

            # System Configuration Table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS system_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                );
            """
            )
            logger.info("Checked/created 'system_config' table.")

            # Set default configuration
            cur.execute(
                """
                INSERT INTO system_config (key, value, updated_at)
                VALUES ('detector_type', %s, NOW())
                ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value, updated_at = NOW();
            """,
                (DetectorType.RANGE_BASED,),
            )

            conn.commit()
            logger.info("Database initialization complete.")

    except psycopg2.DatabaseError as e:
        logger.error(f"Database initialization error: {e}")
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        logger.error(f"An unexpected error occurred during DB init: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn_pool.putconn(conn)


def on_connect(client, userdata, flags, rc):
    """Callback when client connects to broker."""
    if rc == 0:
        logger.info("Connected to MQTT Broker!")
        raw_topic = userdata.get("raw_topic", DEFAULT_MQTT_RAW_TOPIC)
        config_topic = userdata.get("config_topic", DEFAULT_MQTT_CONFIG_TOPIC)
        client.subscribe(raw_topic)
        client.subscribe(config_topic)
        logger.info(f"Subscribed to topics: {raw_topic}, {config_topic}")
    else:
        logger.error(f"Failed to connect to MQTT Broker, return code: {rc}")


def on_message(client, userdata, msg):
    """Processes received MQTT messages."""
    topic = msg.topic
    logger.debug(f"Received message on topic: {topic}")

    db_pool = userdata.get("db_pool")
    raw_topic = userdata.get("raw_topic")
    vitals_topic = userdata.get("vitals_topic")
    alerts_topic = userdata.get("alerts_topic")
    config_topic = userdata.get("config_topic")
    mqtt_client = userdata.get("client")

    if not db_pool:
        logger.error("Database connection pool not found in MQTT userdata!")
        return

    # Initialize user baseline detector with DB pool if not already done
    if db_pool and DetectorType.USER_BASELINE in detectors:
        user_baseline_detector = detectors[DetectorType.USER_BASELINE]
        if not user_baseline_detector.db_pool:
            user_baseline_detector.set_db_pool(db_pool)

    # Handle configuration messages
    if topic == config_topic:
        try:
            config_payload = json.loads(msg.payload.decode("utf-8"))
            global current_detector_type, current_user_id

            detector_type = config_payload.get("detector_type")
            user_id = config_payload.get("user_id")

            if detector_type and detector_type in [
                DetectorType.RANGE_BASED,
                DetectorType.USER_BASELINE,
            ]:
                current_detector_type = detector_type
                logger.info(f"Detector type changed to: {current_detector_type}")

            if user_id:
                current_user_id = user_id
                if current_detector_type == DetectorType.USER_BASELINE:
                    user_baseline_detector = detectors[DetectorType.USER_BASELINE]
                    user_baseline_detector.set_user_id(current_user_id)
                logger.info(f"User ID set to: {current_user_id}")

            # Store config in database
            conn = None
            try:
                conn = db_pool.getconn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO system_config (key, value, updated_at)
                        VALUES ('detector_type', %s, NOW()), ('current_user_id', %s, NOW())
                        ON CONFLICT (key) DO UPDATE
                        SET value = EXCLUDED.value, updated_at = NOW();
                    """,
                        (current_detector_type, current_user_id),
                    )
                    conn.commit()
            except Exception as e:
                logger.error(f"Error storing config: {e}")
                if conn:
                    conn.rollback()
            finally:
                if conn:
                    db_pool.putconn(conn)

            return
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in config message: {msg.payload}")
            return
        except Exception as e:
            logger.error(f"Error processing config message: {e}")
            return

    conn = None
    try:
        # Parse and validate data using Pydantic model
        payload_str = msg.payload.decode("utf-8")
        raw_data = json.loads(payload_str)

        # Add user_id to raw data if not present
        if "user_id" not in raw_data:
            raw_data["user_id"] = current_user_id

        try:
            health_record = HealthDataRecord.model_validate(raw_data)
        except ValidationError as e:
            logger.warning(f"Received invalid data format: {e}. Payload: {payload_str}")
            return
        except Exception as e:
            logger.error(
                f"Error validating data: {e}. Payload: {payload_str}", exc_info=True
            )
            return

        if topic == raw_topic:
            conn = db_pool.getconn()
            with conn.cursor() as cur:
                # Store vitals in database
                sql = """
                    INSERT INTO vitals (timestamp, heart_rate, blood_pressure_systolic, 
                                        blood_pressure_diastolic, temperature, oxygen_saturation, activity, user_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """
                cur.execute(
                    sql,
                    (
                        health_record.timestamp,
                        health_record.heart_rate,
                        health_record.blood_pressure_systolic,
                        health_record.blood_pressure_diastolic,
                        health_record.temperature,
                        health_record.oxygen_saturation,
                        health_record.activity,
                        health_record.user_id,
                    ),
                )
                logger.debug(
                    f"Inserted vitals data into database for timestamp {health_record.timestamp}"
                )
            conn.commit()

            # Publish processed vitals
            if vitals_topic and mqtt_client:
                try:
                    vitals_payload = health_record.model_dump_json()
                    mqtt_client.publish(vitals_topic, vitals_payload)
                    logger.debug(f"Published processed vitals to {vitals_topic}")
                except Exception as e:
                    logger.error(f"Error publishing vitals: {e}")

            # Get current detector
            anomaly_detector = detectors[current_detector_type]

            # Set user ID for user baseline detector
            if current_detector_type == DetectorType.USER_BASELINE:
                user_baseline_detector = detectors[DetectorType.USER_BASELINE]
                user_baseline_detector.set_user_id(health_record.user_id)

            # Detect anomalies
            raw_anomalies = anomaly_detector.detect_anomalies(
                health_record.model_dump()
            )

            # Process and store alerts
            if raw_anomalies:
                processed_anomalies: list[AnomalyRecord] = []
                try:
                    for anomaly_dict in raw_anomalies:
                        try:
                            processed_anomalies.append(
                                AnomalyRecord.model_validate(anomaly_dict)
                            )
                        except ValidationError as e:
                            logger.warning(f"Skipping invalid anomaly: {e}")
                            continue
                except Exception as e:
                    logger.error(f"Error processing anomalies list: {e}", exc_info=True)

                if processed_anomalies:
                    if not conn:
                        conn = db_pool.getconn()
                    with conn.cursor() as cur:
                        for anomaly_record in processed_anomalies:
                            # Store alert in database
                            alert_sql = """
                                INSERT INTO alerts (timestamp, parameter, value, severity, activity_level, 
                                                    normal_range_min, normal_range_max, deviation_percent, evidence, user_id)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """
                            try:
                                cur.execute(
                                    alert_sql,
                                    (
                                        anomaly_record.timestamp,
                                        anomaly_record.parameter,
                                        anomaly_record.value,
                                        anomaly_record.severity,
                                        anomaly_record.activity_level,
                                        anomaly_record.normal_range[0],
                                        anomaly_record.normal_range[1],
                                        anomaly_record.deviation_percent,
                                        anomaly_record.evidence,
                                        health_record.user_id,
                                    ),
                                )
                                logger.debug(
                                    f"Inserted alert for {anomaly_record.parameter} into database"
                                )
                            except Exception as insert_err:
                                logger.error(f"Failed to insert alert: {insert_err}")
                                conn.rollback()
                                continue

                            # Publish alert
                            if alerts_topic and mqtt_client:
                                try:
                                    alert_payload = anomaly_record.model_dump_json()
                                    mqtt_client.publish(alerts_topic, alert_payload)
                                    logger.info(f"Published alert to {alerts_topic}")
                                except Exception as e:
                                    logger.error(f"Error publishing alert: {e}")
                    conn.commit()
                    logger.info(f"Processed {len(processed_anomalies)} anomalies")

    except json.JSONDecodeError:
        logger.error(
            f"Failed to decode JSON payload: {msg.payload.decode('utf-8', errors='ignore')}"
        )
    except psycopg2.Error as db_err:
        logger.error(f"Database error: {db_err}")
        if conn:
            conn.rollback()
    except Exception as e:
        logger.error(f"Error in on_message: {e}", exc_info=True)
        if conn:
            conn.rollback()
    finally:
        if conn:
            db_pool.putconn(conn)


def on_disconnect(client, userdata, rc):
    """Callback when client disconnects."""
    if rc != 0:
        logger.warning(f"Unexpected disconnection from MQTT Broker, return code: {rc}")
    else:
        logger.info("Disconnected from MQTT Broker")


def main():
    # Database setup
    global db_pool
    try:
        logger.info(f"Connecting to database {DB_NAME} at {DB_HOST}:{DB_PORT}...")
        db_pool = psycopg2.pool.SimpleConnectionPool(
            minconn=1,
            maxconn=5,
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
        )
        init_db(db_pool)
        logger.info("Database initialized")

        # Set database pool for user baseline detector
        user_baseline_detector = detectors[DetectorType.USER_BASELINE]
        user_baseline_detector.set_db_pool(db_pool)

        # Load detector configuration from database
        conn = None
        try:
            conn = db_pool.getconn()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT key, value FROM system_config WHERE key IN ('detector_type', 'current_user_id')"
                )
                rows = cur.fetchall()

                for key, value in rows:
                    if key == "detector_type" and value in [
                        DetectorType.RANGE_BASED,
                        DetectorType.USER_BASELINE,
                    ]:
                        global current_detector_type
                        current_detector_type = value
                    elif key == "current_user_id":
                        global current_user_id
                        current_user_id = value
        except Exception as e:
            logger.error(f"Error loading detector configuration: {e}")
        finally:
            if conn:
                db_pool.putconn(conn)

        logger.info(
            f"Using detector: {current_detector_type}, User ID: {current_user_id}"
        )

        # Update user ID in user baseline detector
        if current_detector_type == DetectorType.USER_BASELINE:
            user_baseline_detector.set_user_id(current_user_id)

    except (psycopg2.OperationalError, psycopg2.DatabaseError) as e:
        logger.error(f"FATAL: Database connection error: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"FATAL: Database setup error: {e}", exc_info=True)
        sys.exit(1)

    stop_event = threading.Event()

    # MQTT client setup
    client_id = f"backend-{os.getpid()}-{time.time_ns()}"
    client = mqtt.Client(client_id=client_id)

    userdata = {
        "db_pool": db_pool,
        "raw_topic": DEFAULT_MQTT_RAW_TOPIC,
        "vitals_topic": DEFAULT_MQTT_VITALS_TOPIC,
        "alerts_topic": DEFAULT_MQTT_ALERTS_TOPIC,
        "config_topic": DEFAULT_MQTT_CONFIG_TOPIC,
        "client": client,
    }
    client.user_data_set(userdata)

    flask_app.config["DB_POOL"] = db_pool
    flask_app.config["MQTT_CLIENT"] = client

    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    # Signal handler for shutdown
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}, shutting down...")
        stop_event.set()
        client.loop_stop()
        client.disconnect()
        logger.info("MQTT client disconnected")
        if db_pool:
            db_pool.closeall()
            logger.info("Database connection closed")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Start Flask API server
    flask_port = int(os.environ.get("FLASK_PORT", 5001))
    logger.info(f"Starting Flask API server on port {flask_port}...")
    flask_thread = threading.Thread(
        target=lambda: flask_app.run(
            host="0.0.0.0", port=flask_port, debug=False, use_reloader=False
        ),
        daemon=True,
        name="FlaskAPIServerThread",
    )
    flask_thread.start()

    # Connect to MQTT broker
    try:
        logger.info(
            f"Connecting to MQTT broker at {DEFAULT_MQTT_BROKER}:{DEFAULT_MQTT_PORT}..."
        )
        client.connect(DEFAULT_MQTT_BROKER, DEFAULT_MQTT_PORT, 60)
    except Exception as e:
        logger.error(f"Failed to connect to MQTT broker: {e}")
        stop_event.set()
        if db_pool:
            db_pool.closeall()
        sys.exit(1)

    # Start MQTT client loop
    logger.info("Starting MQTT client loop...")
    try:
        client.loop_forever()
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received, stopping...")
    except Exception as e:
        logger.error(f"Critical error in MQTT loop: {e}", exc_info=True)
        signal_handler(signal.SIGTERM, None)
    finally:
        logger.info("MQTT loop finished")
        if not stop_event.is_set():
            stop_event.set()

    logger.info("Backend service stopped")
    return 0


if __name__ == "__main__":
    main()
