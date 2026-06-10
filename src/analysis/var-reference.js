"use strict";

//const assert = require('assert');

function isVariableReferenceArray(node /* VariableReference */) {
	return node.parent.type === 'ArrayElement' && (node === node.parent.firstNamedChild);
}

function isVariableReferenceAssignment(node /* VariableReference */) {
	if (isVariableReferenceArray(node)) node = node.parent;
	return node.parent.type === 'SetStatement' && node.parent.firstNamedChild === node;
}

module.exports = {
	isVariableReferenceArray,
	isVariableReferenceAssignment,
};
