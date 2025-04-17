import logging
import psycopg2  # type: ignore
from datetime import datetime, timedelta
from typing import Dict, List

logger = logging.getLogger(__name__)


class TrendAnalyzer:

    @staticmethod
    def analyze_trends(db_pool):
        trends = {"1min": {}, "30min": {}, "1h": {}, "1day": {}, "7day": {}}

        now = datetime.now()
        parameters = [
            "heart_rate",
            "blood_pressure_systolic",
            "blood_pressure_diastolic",
            "temperature",
            "oxygen_saturation",
            "activity",
        ]

        conn = None
        try:
            conn = db_pool.getconn()
            with conn.cursor() as cur:
                for param in parameters:
                    base_query = f"SELECT timestamp, {param} FROM vitals WHERE {param} IS NOT NULL AND timestamp >= %s ORDER BY timestamp"
                    param_trends = TrendAnalyzer._calculate_trends_for_parameter(
                        cur, param, base_query, now
                    )

                    for time_range, trend_data in param_trends.items():
                        if (
                            time_range in trends
                        ):  # Ensure time range exists in the main dict
                            trends[time_range][param] = trend_data
                        else:
                            logger.warning(
                                f"Calculated trend for unknown time range '{time_range}' for parameter '{param}'"
                            )

        except psycopg2.Error as db_err:
            logger.error(f"Database error during trend analysis: {db_err}")
            # Return empty trends on DB error
            return {"1min": {}, "30min": {}, "1h": {}, "1day": {}, "7day": {}}
        except Exception as e:
            logger.error(f"Unexpected error during trend analysis: {e}", exc_info=True)
            return {"1min": {}, "30min": {}, "1h": {}, "1day": {}, "7day": {}}
        finally:
            if conn:
                db_pool.putconn(conn)

        logger.info("Trends calculated from database")
        return trends

    @staticmethod
    def _calculate_trends_for_parameter(
        cursor, parameter: str, base_query: str, now: datetime
    ) -> Dict[str, Dict[str, List]]:
        trends = {}

        # Define time ranges and their sampling intervals
        time_ranges = {
            "1min": {"interval": "5 seconds", "lookback": timedelta(minutes=1)},
            "30min": {"interval": "1 minute", "lookback": timedelta(minutes=30)},
            "1h": {"interval": "5 minutes", "lookback": timedelta(hours=1)},
            "1day": {"interval": "1 hour", "lookback": timedelta(days=1)},
            "7day": {"interval": "1 day", "lookback": timedelta(days=7)},
        }

        for time_range, config in time_ranges.items():
            interval = config["interval"]
            lookback = config["lookback"]
            start_time = now - lookback

            try:
                # Use TimescaleDB time_bucket for efficient time-series aggregation
                time_bucket_query = f"""
                    SELECT time_bucket('{interval}', timestamp) AS bucket_time, 
                           AVG({parameter}) AS avg_value
                    FROM vitals 
                    WHERE {parameter} IS NOT NULL AND timestamp >= %s
                    GROUP BY bucket_time
                    ORDER BY bucket_time
                """

                cursor.execute(time_bucket_query, (start_time,))
                rows = cursor.fetchall()

                times = []
                values = []

                for row in rows:
                    bucket_time, avg_value = row
                    # Format time based on the time range for better readability
                    if time_range in ["1min", "30min", "1h"]:
                        formatted_time = bucket_time.strftime("%H:%M:%S")
                    elif time_range == "1day":
                        formatted_time = bucket_time.strftime("%H:%M")
                    else:  # 7day
                        formatted_time = bucket_time.strftime("%m-%d")

                    times.append(formatted_time)
                    values.append(
                        round(float(avg_value), 2) if avg_value is not None else None
                    )

                trends[time_range] = {"times": times, "values": values}

            except Exception as e:
                logger.error(
                    f"Error calculating trends for {parameter} at {time_range} range: {e}"
                )
                # Return empty data for this time range
                trends[time_range] = {"times": [], "values": []}

        return trends
