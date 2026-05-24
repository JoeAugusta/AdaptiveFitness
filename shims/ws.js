// React Native uses its own WebSocket implementation
// This shim prevents the Node.js ws package from bundling
module.exports = WebSocket;