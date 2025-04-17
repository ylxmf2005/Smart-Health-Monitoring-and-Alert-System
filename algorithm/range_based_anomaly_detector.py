import logging
from typing import List, Dict, Any
from datetime import datetime
from backend.health_parameters import HealthParameters
from algorithm.anomaly_detector_interface import AnomalyDetectorInterface

logger = logging.getLogger(__name__)


class RangeBasedAnomalyDetector(AnomalyDetectorInterface):

    def detect_anomalies(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        anomalies = []

        activity_value = data.get("activity", 0)
        activity_level = HealthParameters.get_activity_level(activity_value)

        parameters = [
            "heart_rate",
            "blood_pressure_systolic",
            "blood_pressure_diastolic",
            "temperature",
            "oxygen_saturation",
        ]

        for param in parameters:
            if param in data:
                value = data[param]
                if value is None:
                    continue
                try:
                    normal_range = HealthParameters.get_normal_range(
                        param, activity_level
                    )

                    if not (normal_range[0] <= value <= normal_range[1]):
                        range_width = normal_range[1] - normal_range[0]
                        if range_width == 0:
                            deviation = 100 if value != normal_range[0] else 0
                        elif value < normal_range[0]:
                            deviation = abs(normal_range[0] - value) / range_width * 100
                        else:
                            deviation = abs(value - normal_range[1]) / range_width * 100

                        if deviation > 30:
                            severity = "high"
                        elif deviation > 15:
                            severity = "medium"
                        else:
                            severity = "low"

                        anomalies.append(
                            {
                                "parameter": param,
                                "value": value,
                                "normal_range": normal_range,
                                "activity_level": activity_level,
                                "deviation_percent": round(deviation, 2),
                                "severity": severity,
                                "timestamp": data.get(
                                    "timestamp", datetime.now().isoformat()
                                ),
                            }
                        )
                except (
                    KeyError
                ):  # Handle cases where parameter might not be defined for an activity level
                    logger.warning(
                        f"Normal range not defined for parameter '{param}' at activity level '{activity_level}'. Skipping anomaly check."
                    )
                except ZeroDivisionError:  # Handle zero range width explicitly
                    logger.warning(
                        f"Normal range width is zero for parameter '{param}' at activity level '{activity_level}'. Deviation calculation skipped."
                    )
                    if value != normal_range[0]:
                        anomalies.append(
                            {
                                "parameter": param,
                                "value": value,
                                "normal_range": normal_range,
                                "activity_level": activity_level,
                                "deviation_percent": 100.0,  # Assign max deviation
                                "severity": "high",  # Consider it high severity
                                "timestamp": data.get(
                                    "timestamp", datetime.now().isoformat()
                                ),
                            }
                        )
                except Exception as e:
                    logger.error(
                        f"Error checking anomaly for parameter {param} with value {value}: {e}",
                        exc_info=False,
                    )

        return anomalies
