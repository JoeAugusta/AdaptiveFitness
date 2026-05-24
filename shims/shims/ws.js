'use strict';
// React Native has WebSocket built in — no Node ws package needed
const W = typeof WebSocket !== 'undefined' ? WebSocket : null;
module.exports = W;
module.exports.default = W;