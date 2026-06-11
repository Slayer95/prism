"use strict";

const assert = require('assert');

const {
	getUnwrapParensAncestor,
	getUnwrapParensDescendant,
	findChildNamed,
} = require('./../../lib/tree-helpers');

function extractParameters(node /* FunctionParameterList | Empty */) {
	if (node.type === 'Empty') {
		return [];
	} else {
		assert.equal(node.type, 'FunctionParameterList');
		const list = [];
		node = node.firstChild;
		do {
			assert.equal(node.type, 'FunctionParameter');
			list.push([
				findChildNamed(node, 'type').text,
				findChildNamed(node, 'name').text,
			]);
		// eslint-disable-next-line no-cond-assign
		} while (node = node.nextNamedSibling)
		return list;
	}
}

function extractReturnType(node /* None | TypeReference */) {
	if (node.type === 'None') {
		return '';
	}
	assert.equal(node.type, 'TypeReference');
	return node.text;
}

function extractNthArgument(node /* FunctionArgumentList */, n /* index, zero-based */) {
	if (n >= node.namedChildCount) return null;
	let fnArgument = node.firstNamedChild;
	while (n > 0) {
		fnArgument = fnArgument.nextNamedSibling;
		n--;
	}
	return getUnwrapParensDescendant(fnArgument.firstNamedChild);
}

function isFunctionArgument(node) {
	if (node.type === 'FunctionArgument') return true;
	return getUnwrapParensAncestor(node.parent).type === 'FunctionArgument';
}

function getCallExpressionName(node) {
	return node.firstNamedChild.text;
}

function getCallExpressionForFunctionArgument(node) {
	assert.equal(node.parent.type, 'FunctionArgumentList');
	return node.parent.parent;
}

function getCallExpressionForFunctionArgumentOrWrapped(node) {
	if (node.type === 'FunctionArgument') return getCallExpressionForFunctionArgument(node);
	const ancestor = getUnwrapParensAncestor(node.parent);
	if (ancestor.type === 'FunctionArgument') return getCallExpressionForFunctionArgument(ancestor);
	return null;
}

function getCalleeNameIfFunctionArgument(node) {
	const calleeNode = getCalleeIfFunctionArgument(node);
}

module.exports = {
	extractParameters,
	extractReturnType,
	extractNthArgument,
	isFunctionArgument,
	getCallExpressionName,
	getCallExpressionForFunctionArgument,
	getCallExpressionForFunctionArgumentOrWrapped,
	getCalleeNameIfFunctionArgument,
};
