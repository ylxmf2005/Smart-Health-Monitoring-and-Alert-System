import mqtt from "mqtt";

const DEFAULT_BROKER_URL = "ws://localhost:9001";
const DEFAULT_CLIENT_ID = `web_client_${Math.random()
  .toString(16)
  .slice(2, 8)}`;
const DEFAULT_TOPICS = {
  VITALS: "health/vitals",
  ALERTS: "health/alerts",
  CONFIG: "health/config",
};

const dataStore = {
  vitals: [],
  alerts: [],
};

const callbackHandlers = {
  onConnect: [],
  onVitalsUpdate: [],
  onAlertsUpdate: [],
  onStatusChange: [],
  onError: [],
  onConfigChange: [],
};

let client = null;
let isConnected = false;
let options = {};

/**
 * Initialize and connect to the MQTT broker
 * @param {Object} config - Configuration options
 */
export const connectMqtt = async (config = {}) => {
  if (client) {
    console.log("MQTT client already initialized");
    return;
  }

  options = {
    brokerUrl: config.brokerUrl || DEFAULT_BROKER_URL,
    clientId: config.clientId || DEFAULT_CLIENT_ID,
    username: config.username || undefined,
    password: config.password || undefined,
    topics: {
      ...DEFAULT_TOPICS,
      ...(config.topics || {}),
    },
  };

  try {
    client = mqtt.connect(options.brokerUrl, {
      clientId: options.clientId,
      username: options.username,
      password: options.password,
      clean: true,
      reconnectPeriod: 3000,
      keepalive: 60,
    });

    client.on("connect", () => {
      console.log("Connected to MQTT broker");
      isConnected = true;
      notifyStatusChange(true);

      client.subscribe(options.topics.VITALS);
      client.subscribe(options.topics.ALERTS);
      client.subscribe(options.topics.CONFIG);

      callbackHandlers.onConnect.forEach((callback) => callback());
    });

    client.on("message", (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());

        if (topic === options.topics.VITALS) {
          handleVitalsMessage(payload);
        } else if (topic === options.topics.ALERTS) {
          handleAlertsMessage(payload);
        } else if (topic === options.topics.CONFIG) {
          handleConfigMessage(payload);
        }
      } catch (error) {
        console.error("Error processing MQTT message:", error);
        notifyError("Failed to process message from broker");
      }
    });

    client.on("error", (error) => {
      console.error("MQTT client error:", error);
      notifyStatusChange(false);
      notifyError("MQTT connection error");
    });

    client.on("close", () => {
      console.log("MQTT connection closed");
      isConnected = false;
      notifyStatusChange(false);
    });

    client.on("offline", () => {
      console.log("MQTT client offline");
      isConnected = false;
      notifyStatusChange(false);
    });

    client.on("reconnect", () => {
      console.log("Attempting to reconnect to MQTT broker");
    });

    return true;
  } catch (error) {
    console.error("Failed to connect to MQTT broker:", error);
    notifyStatusChange(false);
    notifyError("Failed to connect to MQTT broker");
    return false;
  }
};

/**
 * Disconnect from the MQTT broker
 */
export const disconnectMqtt = () => {
  if (client && isConnected) {
    client.end();
    isConnected = false;
    client = null;
    console.log("Disconnected from MQTT broker");
  }
};

/**
 * Handle vitals message from MQTT broker
 * @param {Object} data - Vitals data from broker
 */
const handleVitalsMessage = (data) => {
  dataStore.vitals = [data, ...dataStore.vitals].slice(0, 20);

  callbackHandlers.onVitalsUpdate.forEach((callback) =>
    callback(dataStore.vitals)
  );
};

/**
 * Handle alerts message from MQTT broker
 * @param {Object} data - Alert data from broker
 */
const handleAlertsMessage = (data) => {
  callbackHandlers.onAlertsUpdate.forEach((callback) => callback(data));
};

/**
 * Handle configuration message from MQTT broker
 * @param {Object} data - Configuration data from broker
 */
const handleConfigMessage = (data) => {
  console.log("Received detector configuration update:", data);

  callbackHandlers.onConfigChange.forEach((callback) => callback(data));
};

/**
 * Notify error subscribers
 * @param {string} message - Error message
 */
const notifyError = (message) => {
  callbackHandlers.onError.forEach((callback) => callback(message));
};

/**
 * Notify status change subscribers
 * @param {boolean} isConnected - Connection status
 */
const notifyStatusChange = (isConnected) => {
  callbackHandlers.onStatusChange.forEach((callback) => callback(isConnected));
};

/**
 * Publish configuration change
 * @param {Object} config - Configuration to publish
 */
export const publishConfig = (config) => {
  if (!client || !isConnected) {
    console.error("Cannot publish configuration: MQTT client not connected");
    return false;
  }

  try {
    const topic = options.topics.CONFIG;
    const payload = JSON.stringify(config);
    client.publish(topic, payload);
    return true;
  } catch (error) {
    console.error("Error publishing configuration:", error);
    return false;
  }
};

/* Subscription methods */

/**
 * Subscribe to connection events
 * @param {Function} callback - Function to call on connection
 * @returns {Function} Unsubscribe function
 */
export const onConnect = (callback) => {
  callbackHandlers.onConnect.push(callback);
  return () => {
    callbackHandlers.onConnect = callbackHandlers.onConnect.filter(
      (cb) => cb !== callback
    );
  };
};

/**
 * Subscribe to vitals updates
 * @param {Function} callback - Function to call on vitals update
 * @returns {Function} Unsubscribe function
 */
export const onVitalsUpdate = (callback) => {
  callbackHandlers.onVitalsUpdate.push(callback);

  if (dataStore.vitals.length > 0) {
    callback(dataStore.vitals);
  }
  return () => {
    callbackHandlers.onVitalsUpdate = callbackHandlers.onVitalsUpdate.filter(
      (cb) => cb !== callback
    );
  };
};

/**
 * Subscribe to alerts updates
 * @param {Function} callback - Function to call on alerts update
 * @returns {Function} Unsubscribe function
 */
export const onAlertsUpdate = (callback) => {
  callbackHandlers.onAlertsUpdate.push(callback);

  if (dataStore.alerts.length > 0) {
    callback(dataStore.alerts);
  }
  return () => {
    callbackHandlers.onAlertsUpdate = callbackHandlers.onAlertsUpdate.filter(
      (cb) => cb !== callback
    );
  };
};

/**
 * Subscribe to configuration updates
 * @param {Function} callback - Function to call on configuration update
 * @returns {Function} Unsubscribe function
 */
export const onConfigChange = (callback) => {
  callbackHandlers.onConfigChange.push(callback);
  return () => {
    callbackHandlers.onConfigChange = callbackHandlers.onConfigChange.filter(
      (cb) => cb !== callback
    );
  };
};

/**
 * Subscribe to error events
 * @param {Function} callback - Function to call on error
 * @returns {Function} Unsubscribe function
 */
export const onError = (callback) => {
  callbackHandlers.onError.push(callback);
  return () => {
    callbackHandlers.onError = callbackHandlers.onError.filter(
      (cb) => cb !== callback
    );
  };
};

/**
 * Subscribe to status change events
 * @param {Function} callback - Function to call on status change
 * @returns {Function} Unsubscribe function
 */
export const onStatusChange = (callback) => {
  callbackHandlers.onStatusChange.push(callback);
  return () => {
    callbackHandlers.onStatusChange = callbackHandlers.onStatusChange.filter(
      (cb) => cb !== callback
    );
  };
};

/* Data access methods */

/**
 * Get current vitals data
 * @param {number} count - Number of records to return
 * @returns {Array} Vitals data
 */
export const getCurrentVitals = (count = 1) => {
  return dataStore.vitals.slice(0, count);
};

/**
 * Get alerts data
 * @param {number} count - Number of alerts to return
 * @returns {Array} Alerts data
 */
export const getAlerts = (count = 10) => {
  return dataStore.alerts.slice(0, count);
};
