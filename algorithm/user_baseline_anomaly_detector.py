import logging
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timedelta
from algorithm.anomaly_detector_interface import AnomalyDetectorInterface
from backend.health_parameters import HealthParameters
import psycopg2

logger = logging.getLogger(__name__)

class UserBaselineAnomalyDetector(AnomalyDetectorInterface):
    
    def __init__(self, db_pool=None, min_samples=5, learning_rate=0.1, z_threshold=2.5):
        self.db_pool = db_pool
        self.min_samples = min_samples  # Minimum samples needed to establish baseline
        self.learning_rate = learning_rate  # Rate at which new data affects baseline
        self.z_threshold = z_threshold  # Z-score threshold for anomaly detection
        self.user_id = "default"
    def set_db_pool(self, db_pool):
        self.db_pool = db_pool
    
    def set_user_id(self, user_id):
        self.user_id = user_id
    
    def detect_anomalies(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not self.db_pool:
            logger.error("Database connection required for user baseline detection")
            return []
            
        anomalies = []
        activity_value = data.get("activity", 0)
        activity_level = HealthParameters.get_activity_level(activity_value)
        
        parameters = [
            "heart_rate", 
            "blood_pressure_systolic", 
            "blood_pressure_diastolic", 
            "temperature", 
            "oxygen_saturation"
        ]
        
        baselines = self._get_user_baselines(activity_level)
        
        for param in parameters:
            if param in data and data[param] is not None:
                value = data[param]
                
                if param in baselines:
                    baseline = baselines[param]
                    mean = baseline.get("mean")
                    std_dev = baseline.get("std_dev")
                    
                    # Skip if we don't have enough data yet
                    if mean is None or std_dev is None or std_dev == 0:
                        continue
                    
                    # Calculate z-score
                    if std_dev is None or std_dev == 0:
                        logger.debug(f"Skipping z-score calculation for {param} due to zero or None std_dev ({std_dev})")
                        continue # Cannot calculate z-score if std_dev is zero
                    
                    z_score = abs(value - mean) / std_dev
                    
                    if z_score > self.z_threshold:
                        # Determine severity based on z-score
                        if z_score > 4.0:
                            severity = "high"
                        elif z_score > 3.0:
                            severity = "medium"
                        else:
                            severity = "low"
                        
                        # Calculate deviation as percentage of typical variation
                        deviation_percent = round(z_score * 100 / 3, 2)  # Normalize to make 3 sigma = 100%
                        
                        # Calculate normal range as mean ± 2 std_dev
                        normal_range = (round(mean - 2 * std_dev, 2), round(mean + 2 * std_dev, 2))
                        
                        anomalies.append({
                            "parameter": param,
                            "value": value,
                            "normal_range": normal_range,
                            "activity_level": activity_level,
                            "deviation_percent": deviation_percent,
                            "severity": severity,
                            "timestamp": data.get("timestamp", datetime.now().isoformat()),
                            "evidence": f"Z-score: {z_score:.2f}, User baseline: {mean:.2f} ± {std_dev:.2f}"
                        })
                else:
                    # Fall back to population normal ranges if no baseline exists or baseline is invalid
                    logger.debug(f"Using population baseline for {param} (user baseline not available or invalid)")
                    try:
                        normal_range = HealthParameters.get_normal_range(param, activity_level)
                        
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
                            
                            anomalies.append({
                                "parameter": param,
                                "value": value,
                                "normal_range": normal_range,
                                "activity_level": activity_level,
                                "deviation_percent": round(deviation, 2),
                                "severity": severity,
                                "timestamp": data.get("timestamp", datetime.now().isoformat()),
                                "evidence": "Using population baseline (insufficient user data or invalid baseline)"
                            })
                    except Exception as e:
                        logger.error(f"Error in fallback anomaly check for {param}: {e}")
        
        # Update user baselines with the new data only if no anomalies were detected for that parameter
        anomalous_params = {a['parameter'] for a in anomalies}
        self._update_user_baselines(data, activity_level, anomalous_params)
            
        return anomalies
    
    def _get_user_baselines(self, activity_level: str) -> Dict[str, Dict[str, float]]:
        baselines = {}
        conn = None
        
        try:
            conn = self.db_pool.getconn()
            with conn.cursor() as cur:
                sql = """
                    SELECT parameter, mean_value, std_deviation, sample_count
                    FROM user_health_baselines
                    WHERE user_id = %s AND activity_level = %s
                """
                cur.execute(sql, (self.user_id, activity_level))
                rows = cur.fetchall()
                
                for row in rows:
                    parameter, mean, std_dev, count = row
                    baselines[parameter] = {
                        "mean": mean,
                        "std_dev": std_dev if std_dev is not None else 0.0, # Ensure std_dev is not None
                        "count": count
                    }
                    
        except Exception as e:
            logger.error(f"Error retrieving user baselines: {e}")
        finally:
            if conn:
                self.db_pool.putconn(conn)
                
        return baselines
    
    def _update_user_baselines(self, data: Dict[str, Any], activity_level: str, anomalous_params: set):
        if not self.db_pool:
            return
            
        conn = None
        parameters = [
            "heart_rate", 
            "blood_pressure_systolic", 
            "blood_pressure_diastolic", 
            "temperature", 
            "oxygen_saturation"
        ]
        
        try:
            conn = self.db_pool.getconn()
            with conn.cursor() as cur:
                for param in parameters:
                    # Skip update if this parameter was anomalous in the current record
                    if param in anomalous_params:
                        logger.debug(f"Skipping baseline update for anomalous parameter: {param}")
                        continue
                        
                    if param in data and data[param] is not None:
                        value = float(data[param])
                        
                        # Check if baseline exists
                        cur.execute("""
                            SELECT mean_value, std_deviation, sample_count 
                            FROM user_health_baselines
                            WHERE user_id = %s AND activity_level = %s AND parameter = %s
                        """, (self.user_id, activity_level, param))
                        
                        row = cur.fetchone()
                        
                        if row:
                            # Update existing baseline using incremental learning
                            mean, std_dev, count = row
                            std_dev = float(std_dev) if std_dev is not None else 0.0
                            count = int(count)
                            mean = float(mean)
                            
                            new_count = count + 1
                            
                            new_mean = mean + (value - mean) / new_count
                            
                            if count == 0:
                                new_std_dev = 0.0
                                m2 = 0.0
                            elif count == 1:
                                # Calculate first variance
                                m2 = (value - mean) ** 2
                                new_std_dev = np.sqrt(m2)
                            else:
                                # Welford's algorithm update for variance (M2)
                                delta = value - mean
                                delta2 = value - new_mean
                                m2 = ((count - 1) * (std_dev ** 2)) + delta * delta2 
                                new_std_dev = np.sqrt(m2 / count) if count > 0 else 0.0
                                
                            db_mean = float(new_mean)
                            db_std_dev = float(new_std_dev)
                            
                            cur.execute("""
                                UPDATE user_health_baselines
                                SET mean_value = %s, std_deviation = %s, sample_count = %s, 
                                    last_updated = NOW()
                                WHERE user_id = %s AND activity_level = %s AND parameter = %s
                            """, (db_mean, db_std_dev, new_count, self.user_id, activity_level, param))
                            
                        else:
                            # Insert new baseline (first data point for this user/param/activity)
                            db_mean = float(value)
                            db_std_dev = 0.0
                            new_count = 1
                            
                            cur.execute("""
                                INSERT INTO user_health_baselines
                                (user_id, parameter, activity_level, mean_value, std_deviation, 
                                 sample_count, last_updated)
                                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                            """, (self.user_id, param, activity_level, db_mean, db_std_dev, new_count))
                
                conn.commit()
                
        except psycopg2.Error as db_err:
             logger.error(f"Database error updating user baselines: {db_err}")
             if conn: conn.rollback()
        except Exception as e:
            logger.error(f"Error updating user baselines: {e}", exc_info=True)
            if conn:
                conn.rollback()
        finally:
            if conn:
                self.db_pool.putconn(conn)
    
    def get_learning_statistics(self) -> Dict[str, Any]:
        """Get statistics about the learning process."""
        stats = {
            "user_id": self.user_id,
            "activity_levels": {}
        }
        
        if not self.db_pool:
            return stats
            
        conn = None
        try:
            conn = self.db_pool.getconn()
            with conn.cursor() as cur:
                # Get stats per activity level
                cur.execute("""
                    SELECT activity_level, parameter, mean_value, std_deviation, sample_count
                    FROM user_health_baselines
                    WHERE user_id = %s
                    ORDER BY activity_level, parameter
                """, (self.user_id,))
                
                rows = cur.fetchall()
                
                for row in rows:
                    activity_level, param, mean, std_dev, count = row
                    
                    if activity_level not in stats["activity_levels"]:
                        stats["activity_levels"][activity_level] = {
                            "parameters": {},
                            "total_samples": 0
                        }
                        
                    stats["activity_levels"][activity_level]["parameters"][param] = {
                        "mean": round(mean, 2),
                        "std_dev": round(std_dev, 2),
                        "count": count
                    }
                    
                    stats["activity_levels"][activity_level]["total_samples"] += count
                    
        except Exception as e:
            logger.error(f"Error retrieving learning statistics: {e}")
        finally:
            if conn:
                self.db_pool.putconn(conn)
                
        return stats
    
    def reset_user_baselines(self, user_id=None):
        """Reset user baselines."""
        if not self.db_pool:
            return False
            
        user_id = user_id or self.user_id
        conn = None
        
        try:
            conn = self.db_pool.getconn()
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM user_health_baselines
                    WHERE user_id = %s
                """, (user_id,))
                conn.commit()
                return True
                
        except Exception as e:
            logger.error(f"Error resetting user baselines: {e}")
            if conn:
                conn.rollback()
            return False
        finally:
            if conn:
                self.db_pool.putconn(conn) 