import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  CircularProgress,
  Alert,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button
} from '@mui/material';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { fetchTrendsData, fetchTrendLLMAnalysis } from '../api/api';
import ReactMarkdown from 'react-markdown';


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
    case 'activity':
      return 'Activity Level';
    default:
      return param;
  }
};


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
    case 'activity':
      return 'steps/min';
    default:
      return '';
  }
};


const getParameterColor = (param) => {
  switch (param) {
    case 'heart_rate':
      return '#f44336';
    case 'blood_pressure_systolic':
      return '#2196f3';
    case 'blood_pressure_diastolic':
      return '#3f51b5';
    case 'temperature':
      return '#ff9800';
    case 'oxygen_saturation':
      return '#4caf50';
    case 'activity':
      return '#9c27b0';
    default:
      return '#000000';
  }
};


const getTimeScaleDescription = (scale) => {
  switch (scale) {
    case '1min': return 'Showing 5-second averages for the last minute';
    case '30min': return 'Showing 1-minute averages for the last 30 minutes';
    case '1h': return 'Showing 5-minute averages for the last hour';
    case '1day': return 'Showing hourly averages for the last 24 hours';
    case '7day': return 'Showing daily averages for the last 7 days';
    default: return '';
  }
};


const Trends = ({ loading, error }) => {
  const [selectedParameter, setSelectedParameter] = useState('heart_rate');
  const [timeScale, setTimeScale] = useState('1h'); 
  const [chartData, setChartData] = useState([]);
  const [trendsData, setTrendsData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [llmMarkdown, setLlmMarkdown] = useState('');
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);
  
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const result = await fetchTrendsData();
        if (result && result.trends) {
          setTrendsData(result.trends);
        }
        setFetchError(null);
      } catch (err) {
        console.error('Error fetching trends data:', err);
        setFetchError(err.message || 'Failed to fetch trends data');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
    
    
    const intervalId = setInterval(fetchData, 30000); 
    
    return () => clearInterval(intervalId);
  }, []); 
  
  
  useEffect(() => {
    
    if (trendsData && trendsData[timeScale]) {
        const scaleData = trendsData[timeScale];
        
        if (scaleData[selectedParameter] && 
            scaleData[selectedParameter].times && 
            scaleData[selectedParameter].values && 
            scaleData[selectedParameter].times.length > 0) 
        {
            const trend = scaleData[selectedParameter];
            
            const formattedData = trend.times.map((time, index) => ({
                time: time, 
                [selectedParameter]: trend.values[index]
            }));
            setChartData(formattedData);
        } else {
            
            setChartData([]);
        }
    } else {
      
      setChartData([]);
    }
  }, [trendsData, selectedParameter, timeScale]); 
  
  
  const handleLLMAnalysis = async () => {
    setLlmLoading(true);
    setLlmError(null);
    setLlmMarkdown('');
    try {
      
      const times = chartData.map(d => d.time);
      const values = chartData.map(d => d[selectedParameter]);
      const params = {
        parameter: selectedParameter,
        time_scale: timeScale,
        unit: getParameterUnit(selectedParameter),
        timestamps: times,
        values: values,
      };
      const result = await fetchTrendLLMAnalysis(params);
      setLlmMarkdown(result.markdown);
    } catch (e) {
      setLlmError(e.message || 'LLM analysis failed');
    } finally {
      setLlmLoading(false);
    }
  };
  
  
  const showLoading = loading || isLoading;
  
  const showError = error || fetchError;
  
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Health Trends
      </Typography>
      
      {showError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {showError}
        </Alert>
      )}
      
      {/* Time Scale, Parameter Selectors, and LLM Button */}
      <Grid container spacing={3} alignItems="center" sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <FormControl fullWidth>
            <InputLabel id="timescale-select-label">Time Scale</InputLabel>
            <Select
              labelId="timescale-select-label"
              id="timescale-select"
              value={timeScale}
              label="Time Scale"
              onChange={(e) => setTimeScale(e.target.value)}
            >
              <MenuItem value="1min">1 Minute</MenuItem>
              <MenuItem value="30min">30 Minutes</MenuItem>
              <MenuItem value="1h">1 Hour</MenuItem>
              <MenuItem value="1day">1 Day</MenuItem>
              <MenuItem value="7day">7 Days</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <FormControl fullWidth>
            <InputLabel id="parameter-select-label">Parameter</InputLabel>
            <Select
              labelId="parameter-select-label"
              id="parameter-select"
              value={selectedParameter}
              label="Parameter"
              onChange={(e) => setSelectedParameter(e.target.value)}
            >
              <MenuItem value="heart_rate">Heart Rate</MenuItem>
              <MenuItem value="blood_pressure_systolic">Blood Pressure (Systolic)</MenuItem>
              <MenuItem value="blood_pressure_diastolic">Blood Pressure (Diastolic)</MenuItem>
              <MenuItem value="temperature">Body Temperature</MenuItem>
              <MenuItem value="oxygen_saturation">Oxygen Saturation</MenuItem>
              <MenuItem value="activity">Activity Level</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleLLMAnalysis}
              disabled={showLoading || chartData.length === 0 || llmLoading}
              sx={{ height: '56px', width: '100%' }} 
            >
              {llmLoading ? <CircularProgress size={24} color="inherit" /> : 'Analyze Trend'}
            </Button>
          </Box>
        </Grid>
        <Grid item xs={12} >
           <Typography variant="body2" color="text.secondary">
             {getTimeScaleDescription(timeScale)}
           </Typography>
         </Grid>
      </Grid>
      
      {/* LLM Markdown Result */}
      {llmError && (
        <Alert severity="error" sx={{ mb: 2 }}>{llmError}</Alert>
      )}
      {llmMarkdown && (
        <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>LLM Analysis Result</Typography>
          <ReactMarkdown children={llmMarkdown} />
        </Paper>
      )}
      
      {/* Chart Area */} 
      <Grid container spacing={3}>
        <Grid item xs={12}>
          {showLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : chartData.length === 0 ? (
            <Alert severity="info">
              No trend data available for the selected parameter and time scale. Waiting for data...
            </Alert>
          ) : (
            <Paper elevation={3} sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {formatParameter(selectedParameter)} Trend ({timeScale})
              </Typography>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={chartData}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 50, 
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    angle={-45} 
                    textAnchor="end"
                    height={70} 
                    interval="preserveStartEnd" 
                    tick={{ fontSize: 10 }} 
                  />
                  <YAxis 
                    label={{ 
                      value: getParameterUnit(selectedParameter), 
                      angle: -90, 
                      position: 'insideLeft', 
                      offset: -10 
                    }} 
                    tick={{ fontSize: 12 }}
                    domain={['auto', 'auto']} 
                  />
                  <Tooltip 
                    formatter={(value) => [`${value} ${getParameterUnit(selectedParameter)}`, formatParameter(selectedParameter)]}
                    labelFormatter={(label) => `Time: ${label}`}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Line
                    type="monotone"
                    dataKey={selectedParameter}
                    name={formatParameter(selectedParameter)}
                    stroke={getParameterColor(selectedParameter)}
                    activeDot={{ r: 6 }}
                    strokeWidth={2}
                    dot={false} 
                    connectNulls={false} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default Trends;
