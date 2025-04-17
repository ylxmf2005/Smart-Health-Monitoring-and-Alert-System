class HealthParameters:
    
    ACTIVITY_LOW = "low"
    ACTIVITY_MEDIUM = "medium"
    ACTIVITY_HIGH = "high"

    NORMAL_RANGES = {
        ACTIVITY_LOW: {
            "heart_rate": (60, 80),
            "blood_pressure_systolic": (110, 120),
            "blood_pressure_diastolic": (70, 80),
            "temperature": (36.1, 37.2),
            "oxygen_saturation": (95, 100),
        },
        ACTIVITY_MEDIUM: {
            "heart_rate": (80, 100),
            "blood_pressure_systolic": (120, 140),
            "blood_pressure_diastolic": (80, 90),
            "temperature": (36.5, 37.5),
            "oxygen_saturation": (94, 99),
        },
        ACTIVITY_HIGH: {
            "heart_rate": (100, 160),
            "blood_pressure_systolic": (140, 160),
            "blood_pressure_diastolic": (90, 100),
            "temperature": (37.0, 38.0),
            "oxygen_saturation": (92, 98),
        },
    }

    @staticmethod
    def get_activity_level(activity_value):
        if 0 <= activity_value <= 50:
            return HealthParameters.ACTIVITY_LOW
        elif 51 <= activity_value <= 100:
            return HealthParameters.ACTIVITY_MEDIUM
        else:
            return HealthParameters.ACTIVITY_HIGH

    @staticmethod
    def get_normal_range(parameter, activity_level):
        return HealthParameters.NORMAL_RANGES[activity_level][parameter]
