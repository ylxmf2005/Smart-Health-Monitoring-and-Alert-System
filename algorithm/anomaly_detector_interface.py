from abc import ABC, abstractmethod
from typing import List, Dict, Any


class AnomalyDetectorInterface(ABC):

    @abstractmethod
    def detect_anomalies(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Detect anomalies in the given health data.

        Args:
            data (Dict[str, Any]): A dictionary representing a single health data record. Must contain a timestamp and relevant health parameters. Example: {'timestamp': '...', 'heart_rate': 75, ...}

        Returns:
            List[Dict[str, Any]]: A list of detected anomalies. Each anomaly is represented as a dictionary. An empty list if no anomalies found. Example: [{'parameter': 'heart_rate', 'value': 55, ...}]
        """
        pass
