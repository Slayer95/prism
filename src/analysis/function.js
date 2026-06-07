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
		} while (node = node.nextNamedSibling)
		return list;
	}
}

function extractReturnType(node /* None | TypeReference */) {
	if (node.type === 'None') {
		return null;
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

module.exports = {
	extractParameters,
	extractReturnType,
	extractNthArgument,
	isFunctionArgument,
};
