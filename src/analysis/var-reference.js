"use strict";

const assert = require('assert');

function isVariableReferenceAssignment(node /* VariableReference */) {
	return node.parent.type === 'SetStatement' && node.parent.firstNamedChild === node;
}

module.exports = {
	isVariableReferenceAssignment,
};
