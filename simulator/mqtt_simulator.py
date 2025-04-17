import json
import random
import time
import paho.mqtt.client as mqtt  # type: ignore
from datetime import datetime
import sys
import os
from dotenv import load_dotenv
from loguru import logger
from backend.health_parameters import HealthParameters

load_dotenv()

DEFAULT_MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost")
DEFAULT_MQTT_PORT = int(os.environ.get("MQTT_PORT", 1883))
DEFAULT_MQTT_TOPIC = os.environ.get("MQTT_RAW_TOPIC", "health/raw_vitals")
DEFAULT_SIMULATOR_INTERVAL = int(os.environ.get("SIMULATOR_INTERVAL", 5))
DEFAULT_SIMULATOR_ANOMALY_RATE = float(os.environ.get("SIMULATOR_ANOMALY_RATE", 0.05))


class HealthDataSimulator:
    """Simulates health data and publishes to MQTT broker"""

    def __init__(
        self, broker_address, broker_port, topic, anomaly_rate=0.05, interval=5
    ):
        self.broker_address = broker_address
        self.broker_port = broker_port
        self.topic = topic
        self.anomaly_rate = anomaly_rate
        self.interval = interval
        self.client = mqtt.Client(client_id=f"simulator-{random.randint(1000, 9999)}")
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("Connected to MQTT Broker!")
        else:
            logger.error(f"Failed to connect, return code {rc}\n")

    def on_disconnect(self, client, userdata, rc):
        logger.error("Disconnected from MQTT Broker")

    def generate_activity_level(self):
        weights = [0.6, 0.3, 0.1]  # 60% low, 30% medium, 10% high
        activity_ranges = [(0, 50), (51, 100), (101, 200)]

        selected_range = random.choices(activity_ranges, weights=weights)[0]
        return random.randint(selected_range[0], selected_range[1])

    def generate_normal_value(self, parameter, activity_level):
        min_val, max_val = HealthParameters.get_normal_range(parameter, activity_level)
        return round(random.uniform(min_val, max_val), 1)

    def generate_anomalous_value(self, parameter, activity_level):
        min_val, max_val = HealthParameters.get_normal_range(parameter, activity_level)

        if random.choice([True, False]):
            # Below normal range
            new_max = min_val - 0.1
            new_min = new_max - (max_val - min_val) * 1.5
            return round(random.uniform(new_min, new_max), 1)
        else:
            # Above normal range
            new_min = max_val + 0.1
            new_max = new_min + (max_val - min_val) * 1.5
            return round(random.uniform(new_min, new_max), 1)

    def generate_health_data(self):
        # Generate activity level first as it affects other parameters
        activity_value = self.generate_activity_level()
        activity_level = HealthParameters.get_activity_level(activity_value)

        data = {"timestamp": datetime.now().isoformat(), "activity": activity_value}

        parameters = [
            "heart_rate",
            "blood_pressure_systolic",
            "blood_pressure_diastolic",
            "temperature",
            "oxygen_saturation",
        ]

        # Decide which parameters (if any) will have anomalous values
        anomalous_params = []
        if random.random() < self.anomaly_rate:
            # Select 1-2 parameters to be anomalous
            num_anomalies = random.randint(1, 2)
            anomalous_params = random.sample(parameters, num_anomalies)

        # Generate values for each parameter
        for param in parameters:
            if param in anomalous_params:
                data[param] = self.generate_anomalous_value(param, activity_level)
            else:
                data[param] = self.generate_normal_value(param, activity_level)

        return data

    def publish_data(self, data):
        try:
            payload = json.dumps(data)
            result = self.client.publish(self.topic, payload)
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.info(f"Data published successfully: {payload}")
                return True
            else:
                logger.error(f"Failed to publish data: {mqtt.error_string(result.rc)}")
                return False
        except Exception as e:
            logger.error(f"Error publishing data: {e}")
            return False

    def run(self):
        try:
            logger.info(
                f"Connecting to MQTT broker at {self.broker_address}:{self.broker_port}..."
            )
            self.client.connect(self.broker_address, self.broker_port, 60)
        except Exception as e:
            logger.error(f"Could not connect to MQTT broker: {e}")
            sys.exit(1)

        self.client.loop_start()

        logger.info("Starting health data simulation...")

        try:
            while True:
                if self.client.is_connected():
                    data = self.generate_health_data()
                    self.publish_data(data)
                else:
                    logger.info("MQTT client disconnected. Waiting to reconnect...")
                time.sleep(self.interval)

        except KeyboardInterrupt:
            logger.info("Simulator stopped by user")
        finally:
            logger.info("Disconnecting MQTT client...")
            self.client.loop_stop()
            self.client.disconnect()


if __name__ == "__main__":
    simulator = HealthDataSimulator(
        broker_address=DEFAULT_MQTT_BROKER,
        broker_port=DEFAULT_MQTT_PORT,
        topic=DEFAULT_MQTT_TOPIC,
        interval=DEFAULT_SIMULATOR_INTERVAL,
        anomaly_rate=DEFAULT_SIMULATOR_ANOMALY_RATE,
    )

    simulator.run()
