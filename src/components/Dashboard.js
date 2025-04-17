import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Grid, 
  Typography, 
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Chip
} from '@mui/material';
import { 
  Favorite as HeartIcon,
  DeviceThermostat as TempIcon,
  Speed as BPIcon,
  Air as OxygenIcon,
  DirectionsRun as ActivityIcon
} from '@mui/icons-material';
import { getCurrentDetector, getUserBaselines, DETECTOR_TYPES } from '../api/api';


const POPULATION_RANGES = {
  low: {
    heart_rate: [60, 80],
    blood_pressure_systolic: [110, 120],
    blood_pressure_diastolic: [70, 80],
    temperature: [36.1, 37.2],
    oxygen_saturation: [95, 100]
  },
  medium: {
    heart_rate: [80, 100],
    blood_pressure_systolic: [120, 140],
    blood_pressure_diastolic: [80, 90],
    temperature: [36.5, 37.5],
    oxygen_saturation: [94, 99]
  },
  high: {
    heart_rate: [100, 160],
    blood_pressure_systolic: [140, 160],
    blood_pressure_diastolic: [90, 100],
    temperature: [37.0, 38.0],
    oxygen_saturation: [92, 98]
  }
};


const getActivityLevelString = (activityValue) => {
  if (activityValue > 100) return "high";
  if (activityValue > 50) return "medium";
  return "low";
};


const VitalGauge = ({ title, value, unit, icon, color, normalRange, loading }) => {
  
  const isNormal = normalRange && value >= normalRange[0] && value <= normalRange[1];
  const rangeLabel = normalRange ? `${normalRange[0]}-${normalRange[1]}` : 'N/A';
  
  return (
    <Card 
      elevation={3} 
      sx={{ 
        height: '100%',
        borderLeft: normalRange ? (isNormal ? '4px solid green' : '4px solid red') : '4px solid grey',
        transition: 'all 0.3s ease'
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box sx={{ 
            backgroundColor: color, 
            borderRadius: '50%', 
            p: 1, 
            mr: 2,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            {icon}
          </Box>
          <Typography variant="h6" component="div">
            {title}
          </Typography>
        </Box>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={40} />
          </Box>
        ) : (
          <>
            <Typography variant="h3" component="div" sx={{ textAlign: 'center', my: 2 }}>
              {value ?? 'N/A'}
              {value != null && (
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  {unit}
                </Typography>
              )}
            </Typography>
            
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Chip 
                label={`Normal: ${rangeLabel} ${unit}`}
                color={!normalRange ? "default" : isNormal ? "success" : "error"}
                variant="outlined"
              />
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
};


const ActivityLevel = ({ value, loading }) => {
  let level = "Low";
  let color = "#4caf50";
  
  if (value > 100) {
    level = "High";
    color = "#f44336";
  } else if (value > 50) {
    level = "Medium";
    color = "#ff9800";
  }
  
  return (
    <Card elevation={3} sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box sx={{ 
            backgroundColor: '#3f51b5', 
            borderRadius: '50%', 
            p: 1, 
            mr: 2,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <ActivityIcon sx={{ color: 'white' }} />
          </Box>
          <Typography variant="h6" component="div">
            Activity Level
          </Typography>
        </Box>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={40} />
          </Box>
        ) : (
          <>
            <Typography variant="h3" component="div" sx={{ textAlign: 'center', my: 2 }}>
              {value ?? 'N/A'}
              {value != null && (
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  steps/min
                </Typography>
              )}
            </Typography>
            
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Chip 
                label={`${level} Activity`}
                sx={{ backgroundColor: color, color: 'white' }}
              />
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
};


const Dashboard = ({ vitalsData, loading, error }) => {
  const [detectorConfig, setDetectorConfig] = useState({ type: DETECTOR_TYPES.RANGE_BASED, userId: 'default' });
  const [userBaselines, setUserBaselines] = useState(null);
  const [baselinesLoading, setBaselinesLoading] = useState(false);

  
  const latestVitals = vitalsData && vitalsData.length > 0 ? vitalsData[0] : null;

  
  useEffect(() => {
    const fetchConfigAndBaselines = async () => {
      try {
        setBaselinesLoading(true);
        const config = await getCurrentDetector();
        setDetectorConfig({ type: config.detector_type, userId: config.user_id });
        
        if (config.detector_type === DETECTOR_TYPES.USER_BASELINE) {
          const stats = await getUserBaselines(config.user_id);
          setUserBaselines(stats);
        } else {
          setUserBaselines(null); 
        }
      } catch (err) {
        console.error("Error fetching dashboard config/baselines:", err);
        
        setUserBaselines(null);
      } finally {
        setBaselinesLoading(false);
      }
    };

    fetchConfigAndBaselines();
    
    

  }, []); 
  
  
  const getDynamicNormalRange = (parameter, activityValue) => {
    const activityLevel = getActivityLevelString(activityValue);
    
    
    if (
      detectorConfig.type === DETECTOR_TYPES.USER_BASELINE && 
      userBaselines && 
      userBaselines.activity_levels &&
      userBaselines.activity_levels[activityLevel] &&
      userBaselines.activity_levels[activityLevel].parameters[parameter]
    ) {
      const baselineStats = userBaselines.activity_levels[activityLevel].parameters[parameter];
      
      if (baselineStats.mean != null && baselineStats.std_dev != null) {
        const mean = baselineStats.mean;
        const stdDev = baselineStats.std_dev;
        
        return [Math.round((mean - 2 * stdDev) * 10) / 10, Math.round((mean + 2 * stdDev) * 10) / 10];
      }
    }
    
    
    return POPULATION_RANGES[activityLevel]?.[parameter] || [null, null];
  };
  
  const displayLoading = loading || baselinesLoading;
  
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Health Dashboard
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      <Grid container spacing={3}>
        {/* Activity Level */}
        <Grid item xs={12} md={6}>
          <ActivityLevel 
            value={latestVitals ? latestVitals.activity : null}
            loading={displayLoading}
          />
        </Grid>
        
        {/* Heart Rate */}
        <Grid item xs={12} sm={6} md={6}>
          <VitalGauge 
            title="Heart Rate"
            value={latestVitals ? latestVitals.heart_rate : null}
            unit="bpm"
            icon={<HeartIcon sx={{ color: 'white' }} />}
            color="#f44336"
            normalRange={latestVitals ? getDynamicNormalRange('heart_rate', latestVitals.activity) : null}
            loading={displayLoading}
          />
        </Grid>
        
        {/* Blood Pressure */}
        <Grid item xs={12} sm={6} md={6}>
          <VitalGauge 
            title="Blood Pressure (Systolic)"
            value={latestVitals ? latestVitals.blood_pressure_systolic : null}
            unit="mmHg"
            icon={<BPIcon sx={{ color: 'white' }} />}
            color="#2196f3"
            normalRange={latestVitals ? getDynamicNormalRange('blood_pressure_systolic', latestVitals.activity) : null}
            loading={displayLoading}
          />
        </Grid>
        
        {/* Temperature */}
        <Grid item xs={12} sm={6} md={6}>
          <VitalGauge 
            title="Body Temperature"
            value={latestVitals ? latestVitals.temperature : null}
            unit="°C"
            icon={<TempIcon sx={{ color: 'white' }} />}
            color="#ff9800"
            normalRange={latestVitals ? getDynamicNormalRange('temperature', latestVitals.activity) : null}
            loading={displayLoading}
          />
        </Grid>
        
        {/* Oxygen Saturation */}
        <Grid item xs={12} sm={6} md={6}>
          <VitalGauge 
            title="Oxygen Saturation"
            value={latestVitals ? latestVitals.oxygen_saturation : null}
            unit="%"
            icon={<OxygenIcon sx={{ color: 'white' }} />}
            color="#4caf50"
            normalRange={latestVitals ? getDynamicNormalRange('oxygen_saturation', latestVitals.activity) : null}
            loading={displayLoading}
          />
        </Grid>
      </Grid>
      
      <Box sx={{ mt: 4 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Last updated: {latestVitals ? new Date(latestVitals.timestamp).toLocaleString() : 'N/A'}
          {' | '} Detector: {detectorConfig.type === DETECTOR_TYPES.USER_BASELINE ? `User Baseline (${detectorConfig.userId})` : 'Range-Based'}
        </Typography>
      </Box>
    </Box>
  );
};

export default Dashboard;
