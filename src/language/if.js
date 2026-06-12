"use strict";

const assert = require('assert/strict');

const {
	isNodeTypeAnyRL,
	assertNodeTypeAnyRL,
	assertNodeType,
} = require('./../../lib/tree-helpers');

function hasElseStatement(node) {
	assertNodeTypeAnyRL(node, 'IfStatement');
	return isNodeTypeAnyRL(node.lastNamedChild, 'ElseStatement');
}

function getNthTestNode(node, n) {
	assertNodeTypeAnyRL(node, 'IfStatement');
	const hasElse = hasElseStatement(node);
	node = node.firstNamedChild;
	if (n === 0) {
		assert.equal(node.type, 'Test');
		return node;
	}

	if (n > node.namedChildCount - (hasElse ? 2 : 1)) {
		return null;
	}

	n++; // Add +1 because Consequent is in the same level
	while (n > 0) {
		node = node.nextNamedSibling;
		n--;
	}
	return node.firstNamedChild;
}

function* getTestNodes(node, n) {
	assertNodeTypeAnyRL(node, 'IfStatement');
	const hasElse = hasElseStatement(node);
	node = node.firstNamedChild;
	if (n > node.namedChildCount - (hasElse ? 2 : 1)) {
		n = node.namedChildCount - (hasElse ? 2 : 1);
	}
	if (n === 0) {
		assert.equal(node.type, 'Test');
		yield node;
	}
	n++; // Add +1 because Consequent is in the same level
	while (n > 0) {
		node = node.nextNamedSibling;
		assertNodeType(node.firstNamedChild, 'Test');
		yield node.firstNamedChild;
		n--;
	}
}

function* getAllTestNodes(node) {
	yield* getTestNodes(node, node.namedChildCount /* just a big enough number */);
}

module.exports = {
	hasElseStatement,
	getNthTestNode,
	getTestNodes,
	getAllTestNodes,
};
