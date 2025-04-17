from typing import Optional, Tuple, Any
from datetime import datetime
from pydantic import BaseModel, field_validator

class HealthDataRecord(BaseModel):
    timestamp: datetime
    activity: int
    heart_rate: Optional[float] = None
    blood_pressure_systolic: Optional[float] = None
    blood_pressure_diastolic: Optional[float] = None
    temperature: Optional[float] = None
    oxygen_saturation: Optional[float] = None
    user_id: str = "default"

    @field_validator('timestamp', mode='before')
    @classmethod
    def parse_timestamp(cls, value: Any) -> datetime:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            except ValueError as e:
                raise ValueError(f"Invalid timestamp format: {value}") from e
        raise ValueError(f"Unexpected type for timestamp: {type(value)}")


class AnomalyRecord(BaseModel):
    parameter: str
    value: float
    normal_range: Tuple[Optional[float], Optional[float]]
    activity_level: str
    deviation_percent: Optional[float] = None
    severity: str
    timestamp: datetime
    evidence: Optional[str] = None

    @field_validator('timestamp', mode='before')
    @classmethod
    def parse_timestamp(cls, value: Any) -> datetime:
        return HealthDataRecord.parse_timestamp(value)

    @field_validator('normal_range', mode='before')
    @classmethod
    def parse_normal_range(cls, value: Any) -> Tuple[Optional[float], Optional[float]]:
        if isinstance(value, (list, tuple)) and len(value) == 2:
            return (float(value[0]) if value[0] is not None else None, 
                    float(value[1]) if value[1] is not None else None)
        raise ValueError(f"Invalid format for normal_range: {value}")
    
class DetectorType:
    """Detector types available in the system."""
    RANGE_BASED = "range_based"
    USER_BASELINE = "user_baseline" 