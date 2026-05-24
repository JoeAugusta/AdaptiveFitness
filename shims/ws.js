'use strict';
const W = typeof WebSocket !== 'undefined' ? WebSocket : null;
module.exports = W;
module.exports.default = W;