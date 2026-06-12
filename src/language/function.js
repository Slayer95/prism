"use strict";

const assert = require('assert');

const {
	getOutsideParens,
	getInsideParens,
} = require('./../../lib/tree-helpers');

const NodeToNode = require('./n2n');

function extractNthArgument(node /* FunctionArgumentList */, n /* index, zero-based */) {
	const arg = NodeToNode.FunctionArgumentList.extractNthArgument(node, n);
	if (!arg) return null;
	return getInsideParens(arg.firstNamedChild);
}

function getCallExpressionForFunctionArgument(node) {
	assert.equal(node.parent.type, 'FunctionArgumentList');
	return node.parent.parent;
}

function getCallExpressionForFunctionArgumentOrWrapped(node) {
	if (node.type === 'FunctionArgument') return getCallExpressionForFunctionArgument(node);
	const ancestor = getOutsideParens(node.parent);
	if (ancestor.type === 'FunctionArgument') return getCallExpressionForFunctionArgument(ancestor);
	return null;
}

function getIsConstantFunctionOrNativeDeclaration(node /* FunctionDeclaration | NativeDeclaration */) {
	return node.firstNamedChild.type === 'ConstantAttribute';
}

function getReturnedSymbolName(node /* ReturnStatement */) {
	const returnedNode = node.namedChildCount > 0 ? getInsideParens(node.lastNamedChild) : null;
	if (!returnedNode || returnedNode.type !== 'VariableReference') return '';
	return returnedNode.text;
}

module.exports = {
	extractNthArgument,
	getCallExpressionForFunctionArgument,
	getCallExpressionForFunctionArgumentOrWrapped,
	getIsConstantFunctionOrNativeDeclaration,
	getReturnedSymbolName,
};
