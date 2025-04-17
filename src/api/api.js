import {
  connectMqtt,
  disconnectMqtt,
  onVitalsUpdate,
  onAlertsUpdate,
  onStatusChange,
  onError,
  getCurrentVitals,
  getAlerts,
} from "./mqtt";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:5001/api";

export const MQTT_CONFIG = {
  brokerUrl: process.env.REACT_APP_MQTT_BROKER_URL || "ws://localhost:9001",
  topics: {
    VITALS: process.env.REACT_APP_MQTT_VITALS_TOPIC || "health/vitals",
    ALERTS: process.env.REACT_APP_MQTT_ALERTS_TOPIC || "health/alerts",
    CONFIG: process.env.REACT_APP_MQTT_CONFIG_TOPIC || "health/config",
  },
};

export const DETECTOR_TYPES = {
  RANGE_BASED: "range_based",
  USER_BASELINE: "user_baseline",
};

let mqttInitialized = false;
let initializationPromise = null;

/**
 * Initialize MQTT connection
 * @returns {Promise} Promise that resolves when connected
 */
export const initializeMqtt = async () => {
  if (mqttInitialized) {
    return Promise.resolve(true);
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("MQTT connection timeout"));
    }, 10000);

    connectMqtt(MQTT_CONFIG)
      .then((success) => {
        clearTimeout(timeoutId);
        if (success) {
          mqttInitialized = true;
          resolve(true);
        } else {
          reject(new Error("Failed to connect to MQTT broker"));
        }
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });

  return initializationPromise;
};

/**
 * Fetch current vitals data
 * @param {number} count - Number of records to return
 * @returns {Promise} Promise that resolves to vitals data
 */
export const fetchCurrentVitals = async (count = 1) => {
  try {
    await initializeMqtt();
    return getCurrentVitals(count);
  } catch (error) {
    console.error("Error fetching current vitals:", error);
    throw error;
  }
};

/**
 * Fetch vitals history
 * @param {number} count - Number of records to return
 * @returns {Promise} Promise that resolves to vitals history data
 */
export const fetchVitalsHistory = async (count = 100) => {
  try {
    await initializeMqtt();

    return getCurrentVitals(count);
  } catch (error) {
    console.error("Error fetching vitals history:", error);
    throw error;
  }
};

/**
 * Fetch alerts
 * @param {number} count - Number of alerts to return
 * @returns {Promise} Promise that resolves to alerts data
 */
export const fetchAlerts = async (count = 10) => {
  try {
    await initializeMqtt();
    return getAlerts(count);
  } catch (error) {
    console.error("Error fetching alerts:", error);
    throw error;
  }
};

/**
 * Fetch alerts history via HTTP API
 * @param {number} count - Number of alerts to fetch
 * @param {string} userId - User ID to fetch alerts for
 * @returns {Promise} Promise that resolves to historical alerts data
 */
export const fetchAlertsHistory = async (count = 50, userId = "default") => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/alerts/history?limit=${count}&user_id=${userId}`
    );
    if (!response.ok) {
      let errorMsg = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (parseError) {}
      throw new Error(errorMsg);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching alerts history:", error);
    throw error;
  }
};

/**
 * Fetch trends data via HTTP API
 * @returns {Promise} Promise that resolves to trends data
 */
export const fetchTrendsData = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/trends`);
    if (!response.ok) {
      let errorMsg = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (parseError) {}
      throw new Error(errorMsg);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching trends data:", error);
    throw error;
  }
};

/**
 * Get current detector configuration
 * @returns {Promise} Promise that resolves to detector configuration
 */
export const getCurrentDetector = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/detector/current`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error getting current detector:", error);
    throw error;
  }
};

/**
 * Set detector type and user ID
 * @param {string} detectorType - Detector type to use
 * @param {string} userId - User ID for personalized baseline
 * @returns {Promise} Promise that resolves to success response
 */
export const setDetector = async (detectorType, userId = "default") => {
  try {
    if (!Object.values(DETECTOR_TYPES).includes(detectorType)) {
      throw new Error(`Invalid detector type: ${detectorType}`);
    }

    const response = await fetch(`${API_BASE_URL}/detector/set`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        detector_type: detectorType,
        user_id: userId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Failed to set detector: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Error setting detector:", error);
    throw error;
  }
};

/**
 * Get user baseline statistics
 * @param {string} userId - User ID to get statistics for
 * @returns {Promise} Promise that resolves to baseline statistics
 */
export const getUserBaselines = async (userId = "default") => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/user/baselines?user_id=${userId}`
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error getting user baselines:", error);
    throw error;
  }
};

/**
 * Reset user baselines
 * @param {string} userId - User ID to reset baselines for
 * @returns {Promise} Promise that resolves to success response
 */
export const resetUserBaselines = async (userId = "default") => {
  try {
    const response = await fetch(`${API_BASE_URL}/user/reset_baselines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Failed to reset user baselines: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Error resetting user baselines:", error);
    throw error;
  }
};

/**
 * Fetch trends
 * @param {string} type - Type of trends to return
 * @returns {Promise} Promise that resolves to trends data
 */
export const fetchTrends = async (type = "short_term") => {
  try {
    const data = await fetchTrendsData();

    return data;
  } catch (error) {
    console.error("Error fetching trends:", error);
    throw error;
  }
};

/**
 * Subscribe to vitals updates
 * @param {Function} callback - Function to call on vitals update
 * @returns {Function} Unsubscribe function
 */
export const subscribeToVitals = async (callback) => {
  try {
    await initializeMqtt();
    return onVitalsUpdate(callback);
  } catch (error) {
    console.error("Error subscribing to vitals updates:", error);
    throw error;
  }
};

/**
 * Subscribe to alerts updates
 * @param {Function} callback - Function to call on alerts update
 * @returns {Function} Unsubscribe function
 */
export const subscribeToAlerts = async (callback) => {
  try {
    await initializeMqtt();
    return onAlertsUpdate(callback);
  } catch (error) {
    console.error("Error subscribing to alerts updates:", error);
    throw error;
  }
};

/**
 * Subscribe to MQTT errors
 * @param {Function} callback - Function to call on error
 * @returns {Function} Unsubscribe function
 */
export const subscribeToErrors = async (callback) => {
  try {
    await initializeMqtt();
    return onError(callback);
  } catch (error) {
    console.error("Error subscribing to error updates:", error);
    throw error;
  }
};

/**
 * Subscribe to connection status updates
 * @param {Function} callback - Function to call on status change
 * @returns {Function} Unsubscribe function
 */
export const subscribeToConnectionStatus = async (callback) => {
  try {
    await initializeMqtt();
    return onStatusChange(callback);
  } catch (error) {
    console.error("Error subscribing to connection status updates:", error);

    callback(false);
    return () => {};
  }
};

/**
 * Cleanup MQTT connection
 */
export const cleanup = () => {
  disconnectMqtt();
  mqttInitialized = false;
  initializationPromise = null;
};

/**
 * Fetch LLM trend analysis
 * @param {Object} params - { parameter, time_scale, unit, timestamps, values }
 * @returns {Promise<{markdown: string}>}
 */
export async function fetchTrendLLMAnalysis(params) {
  const response = await fetch(`${API_BASE_URL}/trends/llm_analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch LLM trend analysis");
  }
  return response.json();
}
