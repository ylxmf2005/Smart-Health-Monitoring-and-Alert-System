import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Grid,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Alert,
  CircularProgress
} from '@mui/material';
import { 
  Info as InfoIcon,
  SignalWifi4Bar as ConnectedIcon,
  SignalWifiOff as DisconnectedIcon,
  Cloud as BrokerIcon,
  Topic as TopicIcon,
  Psychology as AiIcon,
  Timeline,
  RestartAlt as ResetIcon
} from '@mui/icons-material';
import { 
  MQTT_CONFIG, 
  DETECTOR_TYPES,
  getCurrentDetector,
  setDetector,
  getUserBaselines,
  resetUserBaselines
} from '../api/api';

/**
 * Settings component
 * @param {Object} props - Component props
 * @param {boolean} props.darkMode - Dark mode state
 * @param {Function} props.toggleDarkMode - Toggle dark mode function
 * @param {boolean} props.connected - MQTT connection status
 */
const Settings = ({ darkMode, toggleDarkMode, connected }) => {
  const [detectorType, setDetectorType] = useState(DETECTOR_TYPES.RANGE_BASED);
  const [userId, setUserId] = useState('default');
  const [baselines, setBaselines] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  
  useEffect(() => {
    const fetchDetector = async () => {
      try {
        setLoading(true);
        const config = await getCurrentDetector();
        setDetectorType(config.detector_type);
        setUserId(config.user_id);
        
        
        if (config.detector_type === DETECTOR_TYPES.USER_BASELINE) {
          const stats = await getUserBaselines(config.user_id);
          setBaselines(stats);
        }
      } catch (err) {
        setError('Failed to fetch detector configuration');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetector();
  }, []);

  
  const handleDetectorChange = async (e) => {
    const newDetectorType = e.target.value;
    try {
      setLoading(true);
      setError(null);
      
      await setDetector(newDetectorType, userId);
      setDetectorType(newDetectorType);
      
      setSuccess(`Anomaly detector changed to ${newDetectorType === DETECTOR_TYPES.RANGE_BASED ? 'Range-Based' : 'User Baseline'}`);
      
      
      if (newDetectorType === DETECTOR_TYPES.USER_BASELINE) {
        const stats = await getUserBaselines(userId);
        setBaselines(stats);
      } else {
        setBaselines(null);
      }
    } catch (err) {
      setError('Failed to change detector type');
      console.error(err);
    } finally {
      setLoading(false);
      
      if (success) setTimeout(() => setSuccess(null), 3000);
    }
  };

  
  const handleUserIdChange = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await setDetector(detectorType, userId);
      
      setSuccess(`User ID changed to ${userId}`);
      
      
      if (detectorType === DETECTOR_TYPES.USER_BASELINE) {
        const stats = await getUserBaselines(userId);
        setBaselines(stats);
      }
    } catch (err) {
      setError('Failed to change user ID');
      console.error(err);
    } finally {
      setLoading(false);
      
      if (success) setTimeout(() => setSuccess(null), 3000);
    }
  };

  
  const handleResetBaselines = async () => {
    if (!window.confirm('Are you sure you want to reset user baselines? This action cannot be undone.')) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      await resetUserBaselines(userId);
      
      setSuccess(`Baselines reset for user ${userId}`);
      
      
      const stats = await getUserBaselines(userId);
      setBaselines(stats);
    } catch (err) {
      setError('Failed to reset baselines');
      console.error(err);
    } finally {
      setLoading(false);
      
      if (success) setTimeout(() => setSuccess(null), 3000);
    }
  };

  
  const renderBaselinesInfo = () => {
    if (!baselines) return null;
    
    if (Object.keys(baselines.activity_levels).length === 0) {
      return (
        <Alert severity="info" sx={{ mt: 2 }}>
          No baseline data available yet. The system will learn from your normal health data over time.
        </Alert>
      );
    }
    
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Baseline Statistics
        </Typography>
        
        {Object.entries(baselines.activity_levels).map(([activity, data]) => (
          <Box key={activity} sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="bold">
              Activity Level: {activity} ({data.total_samples} samples)
            </Typography>
            
            <Grid container spacing={1} sx={{ mt: 1 }}>
              {Object.entries(data.parameters).map(([param, stats]) => (
                <Grid item xs={12} sm={6} md={4} key={param}>
                  <Chip
                    label={`${param}: ${stats.mean} ± ${stats.std_dev}`}
                    variant="outlined"
                    size="small"
                    sx={{ width: '100%' }}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Settings
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Display Settings
        </Typography>
        
        <FormControlLabel
          control={
            <Switch
              checked={darkMode}
              onChange={toggleDarkMode}
              color="primary"
            />
          }
          label="Dark Mode"
        />
      </Paper>

      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Anomaly Detection Settings
        </Typography>
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel id="detector-type-label">Detector Type</InputLabel>
              <Select
                labelId="detector-type-label"
                id="detector-type"
                value={detectorType}
                label="Detector Type"
                onChange={handleDetectorChange}
                disabled={loading}
              >
                <MenuItem value={DETECTOR_TYPES.RANGE_BASED}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Timeline sx={{ mr: 1 }} />
                    Range-Based (Population)
                  </Box>
                </MenuItem>
                <MenuItem value={DETECTOR_TYPES.USER_BASELINE}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <AiIcon sx={{ mr: 1 }} />
                    User Baseline (Personalized)
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <TextField
                label="User ID"
                variant="outlined"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                fullWidth
                disabled={loading}
              />
              <Button 
                variant="contained" 
                sx={{ ml: 1, height: '56px' }}
                onClick={handleUserIdChange}
                disabled={loading}
              >
                Set
              </Button>
            </Box>
          </Grid>
        </Grid>
        
        {detectorType === DETECTOR_TYPES.USER_BASELINE && (
          <>
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                User Baseline Management
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                The system learns your normal health patterns at different activity levels. 
                Anomalies are detected when your vital signs deviate significantly from your personal baseline.
              </Typography>
              
              <Button
                variant="outlined"
                color="error"
                startIcon={<ResetIcon />}
                onClick={handleResetBaselines}
                disabled={loading}
                sx={{ mt: 1 }}
              >
                Reset Baselines
              </Button>
            </Box>
            
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              renderBaselinesInfo()
            )}
          </>
        )}
      </Paper>

      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Connection Status
        </Typography>
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <Box display="flex" alignItems="center">
              {connected ? (
                <Chip 
                  icon={<ConnectedIcon />} 
                  label="Connected" 
                  color="success" 
                  variant="outlined" 
                  sx={{ fontSize: '1rem', p: 0.5 }}
                />
              ) : (
                <Chip 
                  icon={<DisconnectedIcon />} 
                  label="Disconnected" 
                  color="error" 
                  variant="outlined" 
                  sx={{ fontSize: '1rem', p: 0.5 }}
                />
              )}
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />
        
        <Typography variant="subtitle1" gutterBottom>
          MQTT Broker Configuration
        </Typography>
        
        <List dense>
          <ListItem>
            <ListItemIcon>
              <BrokerIcon />
            </ListItemIcon>
            <ListItemText
              primary="Broker URL"
              secondary={MQTT_CONFIG.brokerUrl}
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <TopicIcon />
            </ListItemIcon>
            <ListItemText
              primary="Vitals Topic"
              secondary={MQTT_CONFIG.topics.VITALS}
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <TopicIcon />
            </ListItemIcon>
            <ListItemText
              primary="Alerts Topic"
              secondary={MQTT_CONFIG.topics.ALERTS}
            />
          </ListItem>
          
          <ListItem>
            <ListItemIcon>
              <TopicIcon />
            </ListItemIcon>
            <ListItemText
              primary="Config Topic"
              secondary={MQTT_CONFIG.topics.CONFIG}
            />
          </ListItem>
        </List>
      </Paper>
      
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          About
        </Typography>        
        <List>
            <ListItemText
              primary="Smart Health Monitoring System"
              secondary="Version 0.0.1"
            />
            <ListItemText
              primary="Author"
              secondary="Ethan Lee"
            />
            <ListItemText
              primary="License"
              secondary="MIT"
            />
        </List>
      </Paper>
    </Box>
  );
};

export default Settings;
