/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from "react";
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  Box,
  Container,
  Typography,
  AppBar,
  Toolbar,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  useMediaQuery,
  Snackbar,
  Alert as MuiAlert,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Notifications as NotificationsIcon,
  Timeline as TimelineIcon,
  Settings as SettingsIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  SignalWifi4Bar as ConnectedIcon,
  SignalWifiOff as DisconnectedIcon,
} from "@mui/icons-material";
import Dashboard from "./components/Dashboard";
import Alerts from "./components/Alerts";
import Trends from "./components/Trends";
import Settings from "./components/Settings";
import {
  subscribeToVitals,
  subscribeToAlerts,
  subscribeToErrors,
  subscribeToConnectionStatus,
  initializeMqtt,
  cleanup,
  fetchAlertsHistory,
} from "./api/api";

/**
 * Alert component for notifications
 */
const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [vitalsData, setVitalsData] = useState(null);
  const [alertsData, setAlertsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notification, setNotification] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  const isMobile = useMediaQuery("(max-width:600px)");

  const theme = createTheme({
    palette: {
      mode: darkMode ? "dark" : "light",
      primary: {
        main: "#2196f3",
      },
      secondary: {
        main: "#f50057",
      },
      background: {
        default: darkMode ? "#121212" : "#f5f5f5",
        paper: darkMode ? "#1e1e1e" : "#ffffff",
      },
    },
  });

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  const showNotification = (message, severity = "info") => {
    setNotification({
      open: true,
      message,
      severity,
    });
  };

  const handleNotificationClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setNotification({ ...notification, open: false });
  };

  useEffect(() => {
    let vitalsUnsubscribe = null;
    let alertsUnsubscribe = null;
    let errorsUnsubscribe = null;
    let statusUnsubscribe = null;

    const setupMqtt = async () => {
      try {
        setLoading(true);

        await initializeMqtt();

        vitalsUnsubscribe = await subscribeToVitals((data) => {
          setVitalsData(data);
          if (loading) {
            setLoading(false);
          }
        });

        alertsUnsubscribe = await subscribeToAlerts((newAlert) => {
          setAlertsData((prevAlerts) => [newAlert, ...prevAlerts]);

          if (
            newAlert &&
            newAlert.parameter &&
            newAlert.value &&
            newAlert.severity
          ) {
            showNotification(
              `Alert: ${newAlert.parameter} (${newAlert.value}) - ${newAlert.severity} severity`,
              "warning"
            );
          } else {
            console.warn("Received incomplete alert via MQTT:", newAlert);
          }
        });

        errorsUnsubscribe = await subscribeToErrors((errorMessage) => {
          if (!connected) {
            setError(errorMessage);
          }
          showNotification(errorMessage, "error");
        });

        statusUnsubscribe = await subscribeToConnectionStatus((isConnected) => {
          setConnected(isConnected);
          if (isConnected) {
            console.log("MQTT Connection Established/Re-established.");
            setError(null);
            showNotification(
              "Connection to health system established.",
              "success"
            );

            fetchInitialHistory();
          } else {
            console.log("MQTT Connection Lost.");
          }
        });
      } catch (err) {
        console.error("Error setting up MQTT:", err);
        const errorMsg =
          err.message || "Failed to connect to health monitoring system";
        setError(errorMsg);
        setConnected(false);
        setLoading(false);
        showNotification("Initial connection error: " + errorMsg, "error");
      }
    };

    const fetchInitialHistory = async () => {
      try {
        const history = await fetchAlertsHistory(1000);
        setAlertsData(history);
        console.log(`Fetched initial alerts history (limit: 1000).`);
      } catch (histError) {
        console.error("Error fetching initial history:", histError);

        showNotification(
          `Failed to load history: ${histError.message}`,
          "error"
        );
      }
    };

    setupMqtt();

    return () => {
      if (vitalsUnsubscribe) vitalsUnsubscribe();
      if (alertsUnsubscribe) alertsUnsubscribe();
      if (errorsUnsubscribe) errorsUnsubscribe();
      if (statusUnsubscribe) statusUnsubscribe();

      cleanup();
    };
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard vitalsData={vitalsData} loading={loading} error={error} />
        );
      case "alerts":
        return (
          <Alerts alertsData={alertsData} loading={loading} error={error} />
        );
      case "trends":
        return <Trends loading={loading} error={error} />;
      case "settings":
        return (
          <Settings
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            connected={connected}
          />
        );
      default:
        return (
          <Dashboard vitalsData={vitalsData} loading={loading} error={error} />
        );
    }
  };

  const drawerContent = (
    <Box sx={{ width: 250 }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" component="div">
          Health Monitor
        </Typography>
      </Box>
      <Divider />
      <List>
        <ListItem
          button
          onClick={() => handlePageChange("dashboard")}
          selected={currentPage === "dashboard"}
        >
          <ListItemIcon>
            <DashboardIcon
              color={currentPage === "dashboard" ? "primary" : "inherit"}
            />
          </ListItemIcon>
          <ListItemText primary="Dashboard" />
        </ListItem>
        <ListItem
          button
          onClick={() => handlePageChange("alerts")}
          selected={currentPage === "alerts"}
        >
          <ListItemIcon>
            <NotificationsIcon
              color={currentPage === "alerts" ? "primary" : "inherit"}
            />
          </ListItemIcon>
          <ListItemText primary="Alerts" />
        </ListItem>
        <ListItem
          button
          onClick={() => handlePageChange("trends")}
          selected={currentPage === "trends"}
        >
          <ListItemIcon>
            <TimelineIcon
              color={currentPage === "trends" ? "primary" : "inherit"}
            />
          </ListItemIcon>
          <ListItemText primary="Trends" />
        </ListItem>
        <ListItem
          button
          onClick={() => handlePageChange("settings")}
          selected={currentPage === "settings"}
        >
          <ListItemIcon>
            <SettingsIcon
              color={currentPage === "settings" ? "primary" : "inherit"}
            />
          </ListItemIcon>
          <ListItemText primary="Settings" />
        </ListItem>
      </List>
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <AppBar position="fixed">
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={toggleDrawer}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Smart Health Monitoring System
            </Typography>
            <IconButton color="inherit" sx={{ mr: 1 }}>
              {connected ? (
                <ConnectedIcon sx={{ color: "#4caf50" }} />
              ) : (
                <DisconnectedIcon sx={{ color: "#f44336" }} />
              )}
            </IconButton>
            <IconButton color="inherit" onClick={toggleDarkMode}>
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Toolbar>
        </AppBar>

        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={toggleDrawer}
          variant="temporary"
          sx={{
            width: 250,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: 250,
            },
          }}
        >
          {drawerContent}
        </Drawer>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            mt: 8,
            transition: theme.transitions.create(["margin", "width"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          }}
        >
          <Container maxWidth="lg">{renderPage()}</Container>
        </Box>

        {/* Notification snackbar */}
        <Snackbar
          open={notification.open}
          autoHideDuration={6000}
          onClose={handleNotificationClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            onClose={handleNotificationClose}
            severity={notification.severity}
          >
            {notification.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default App;
