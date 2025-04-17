import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Paper,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid
} from '@mui/material';
import { 
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from '@mui/icons-material';

// Alert severity icon mapping
const getSeverityIcon = (severity) => {
  switch (String(severity).toLowerCase()) {
    case 'high':
      return <ErrorIcon color="error" />;
    case 'medium':
      return <WarningIcon color="warning" />;
    case 'low':
      return <InfoIcon color="info" />;
    default:
      return <InfoIcon />;
  }
};

// Alert severity color mapping
const getSeverityColor = (severity) => {
  switch (String(severity).toLowerCase()) {
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'default';
  }
};

// Format parameter name for display
const formatParameter = (param) => {
  switch (param) {
    case 'heart_rate':
      return 'Heart Rate';
    case 'blood_pressure_systolic':
      return 'Blood Pressure (Systolic)';
    case 'blood_pressure_diastolic':
      return 'Blood Pressure (Diastolic)';
    case 'temperature':
      return 'Body Temperature';
    case 'oxygen_saturation':
      return 'Oxygen Saturation';
    default:
      return param || 'N/A';
  }
};

// Get unit for parameter
const getParameterUnit = (param) => {
  switch (param) {
    case 'heart_rate':
      return 'bpm';
    case 'blood_pressure_systolic':
    case 'blood_pressure_diastolic':
      return 'mmHg';
    case 'temperature':
      return '°C';
    case 'oxygen_saturation':
      return '%';
    default:
      return '';
  }
};

// Main Alerts component
const Alerts = ({ alertsData, loading, error }) => {
  const [filter, setFilter] = useState('all');
  
  // Filter alerts by severity
  const filteredAlerts = alertsData.filter(alert => {
    if (!alert) return false;
    if (filter === 'all') return true;
    return String(alert.severity).toLowerCase() === filter;
  });

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Health Alerts
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      <Grid container spacing={2} sx={{ mb: 3 }} alignItems="center">
        <Grid item xs={12} sm={6}>
          <Typography variant="body1">
            {loading ? 'Loading alerts...' : `Showing ${filteredAlerts.length} alerts`}
          </Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel id="severity-filter-label">Severity</InputLabel>
              <Select
                labelId="severity-filter-label"
                id="severity-filter"
                value={filter}
                label="Severity"
                onChange={(e) => setFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
        </Grid>
      </Grid>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : filteredAlerts.length === 0 ? (
        <Alert severity="info">
          No {filter === 'all' ? '' : filter} severity alerts found.
        </Alert>
      ) : (
        <Paper elevation={3}>
          <List sx={{ p: 0 }}>
            {filteredAlerts.map((alert, index) => {
              const severity = alert.severity ? String(alert.severity).toLowerCase() : 'unknown';
              const activityLevel = alert.activity_level ? String(alert.activity_level) : 'unknown';
              const normalRange = Array.isArray(alert.normal_range) && alert.normal_range.length === 2 ? alert.normal_range : ['N/A', 'N/A'];
              const deviation = typeof alert.deviation_percent === 'number' ? Math.round(alert.deviation_percent) : 'N/A';
              const timestamp = alert.timestamp ? new Date(alert.timestamp).toLocaleString() : 'Invalid Date';

              return (
                <React.Fragment key={alert.id || index}>
                  {index > 0 && <Divider variant="middle" component="li" />}
                  <ListItem alignItems="flex-start" sx={{ py: 2 }}>
                    <ListItemIcon sx={{ mt: 0.5, minWidth: 40 }}>
                      {getSeverityIcon(severity)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Typography variant="body1" component="span" sx={{ fontWeight: 'bold' }}>
                            {formatParameter(alert.parameter)}
                          </Typography>
                          <Chip 
                            label={severity.toUpperCase()}
                            color={getSeverityColor(severity)} 
                            size="small" 
                            sx={{ ml: 2, height: 'auto', lineHeight: 1.4 }}
                          />
                        </Box>
                      }
                      secondary={
                        <Box component="span">
                          <Typography variant="body2" component="div" color="text.primary">
                            Value: {alert.value ?? 'N/A'} {getParameterUnit(alert.parameter)} 
                            {' '}(Normal: {normalRange[0]}-{normalRange[1]} {getParameterUnit(alert.parameter)})
                          </Typography>
                          <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
                            Activity: {activityLevel.charAt(0).toUpperCase() + activityLevel.slice(1)}
                          </Typography>
                          <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
                            Deviation: {deviation}%
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {timestamp}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                </React.Fragment>
              )
            })}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default Alerts;
