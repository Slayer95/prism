"use strict";

//const assert = require('assert');

function isLoopNode(node) {
	return node.type === 'LoopStatement';
}

function isExitWhenNode(node) {
	return node.type === 'ExitWhenStatement';
}

module.exports = {
	isLoopNode,
	isExitWhenNode,
};
