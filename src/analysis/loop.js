"use strict";

//const assert = require('assert');

function isLoopNode(node) {
	return node.type === 'LoopStatement';
}

module.exports = {
	isLoopNode,
};
