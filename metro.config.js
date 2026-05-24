const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ws: path.resolve(__dirname, 'shims/ws.js'),
  stream: require.resolve('stream-browserify'),
  events: require.resolve('events'),
};

module.exports = config;