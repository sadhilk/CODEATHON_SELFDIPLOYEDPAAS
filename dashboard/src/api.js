import axios from 'axios';
import BACKEND_URL from './socket';

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 25000,
});

export default api;

// Projects
export const getProjects = () => api.get('/api/projects');
export const getProject = (name) => api.get(`/api/projects/${name}`);
export const createProject = (data) => api.post('/api/projects', data);
export const updateProject = (name, data) => api.put(`/api/projects/${name}`, data);
export const deployProject = (name) => api.post(`/api/projects/${name}/deploy`);
export const stopProject = (name) => api.post(`/api/projects/${name}/stop`);
export const deleteProject = (name) => api.delete(`/api/projects/${name}`);
export const getProjectStats = (name) => api.get(`/api/projects/${name}/stats`);
export const getProjectEvents = (name, limit = 50) => api.get(`/api/projects/${name}/events?limit=${limit}`);

// Instances
export const getInstances = (projectName) => api.get(`/api/projects/${projectName}/instances`);
export const killInstance = (projectName, instanceId) => api.post(`/api/projects/${projectName}/instances/${instanceId}/kill`);
export const reviveInstance = (projectName, instanceId) => api.post(`/api/projects/${projectName}/instances/${instanceId}/revive`);
export const drainInstance = (projectName, instanceId) => api.post(`/api/projects/${projectName}/instances/${instanceId}/drain`);
export const cleanupInstances = (projectName) => api.post(`/api/projects/${projectName}/cleanup`);

// Gateway
export const getRateLimitConfig = () => api.get('/api/gateway/config');
export const updateRateLimitConfig = (config) => api.put('/api/gateway/config', config);
export const startLoadGenerator = (projectName, rps) => api.post('/api/gateway/load-generator/start', { projectName, rps });
export const stopLoadGenerator = (projectName) => api.post('/api/gateway/load-generator/stop', { projectName });
export const getLoadGeneratorStatus = (projectName) => api.get(`/api/gateway/load-generator/status/${projectName}`);
export const resetStats = (projectName) => api.post(`/api/gateway/reset-stats/${projectName}`);

// System health & network
export const getSystemHealth = () => api.get('/api/health');
export const getNetworkInfo = () => api.get('/api/system/network');

// Database management & cloud backup
export const getDatabaseStats = () => api.get('/api/database/stats');
export const getCollectionDocuments = (name, page = 1, limit = 20) => api.get(`/api/database/collections/${name}/documents?page=${page}&limit=${limit}`);
export const getBackupStatus = () => api.get('/api/database/backup/status');
export const configureCloudBackup = (uri) => api.post('/api/database/backup/configure', { uri });
export const syncCloudBackup = () => api.post('/api/database/backup/sync');
export const disconnectCloudBackup = () => api.post('/api/database/backup/disconnect');
