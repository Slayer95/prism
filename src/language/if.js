"use strict";

const assert = require('assert/strict');

const NodeToNode = require('./n2n');

const {
	isNodeTypeAnyRL,
	assertNodeTypeAnyRL,
	assertNodeType,
	getFirstSignificantChild,
	getLastSignificantChild,
	getNextSignificantSibling,
} = require('./../../lib/tree-helpers');

function hasElseStatement(node) {
	assertNodeTypeAnyRL(node, 'IfStatement');
	return isNodeTypeAnyRL(getLastSignificantChild(node), 'ElseStatement');
}

function getNthTestNode(node, n) {
	assertNodeTypeAnyRL(node, 'IfStatement');
	const hasElse = hasElseStatement(node);
	node = getFirstSignificantChild(node);
	if (n === 0) {
		assert.equal(node.type, 'Test');
		return node;
	}

	/*
	// This is not an accurate upper bound, because
	// named children may include comments.
	// Instead, check whether there is still a next significant node in the while loop.
	if (n > node.namedChildCount - (hasElse ? 2 : 1)) {
		return null;
	}
	*/

	n++; // Add +1 because Consequent is in the same level
	while (node && n > 0) {
		node = getNextSignificantSibling(node);
		n--;
	}

	return node.firstNamedChild;
}

function* getTestNodes(node, n) {
	assertNodeTypeAnyRL(node, 'IfStatement');
	const hasElse = hasElseStatement(node);
	node = getFirstSignificantChild(node);
	/*
	// This is not an accurate upper bound, because
	// named children may include comments.
	// Instead, check whether there is still a next significant node in the while loop.
	if (n > node.namedChildCount - (hasElse ? 2 : 1)) {
		n = node.namedChildCount - (hasElse ? 2 : 1);
	}
	*/
	if (n === 0) {
		assert.equal(node.type, 'Test');
		yield node;
	}
	n++; // Add +1 because Consequent is in the same level
	while (node && n > 0) {
		node = getNextSignificantSibling(node);
		assertNodeType(node.firstNamedChild, 'Test');
		yield node.firstNamedChild;
		n--;
	}
}

function* getAllTestNodes(node) {
	yield* getTestNodes(node, node.namedChildCount /* just a big enough number */);
}

function isIfNode(node) {
	return isNodeTypeAnyRL(node, 'IfStatement');
}

module.exports = {
	isIfNode,
	hasElseStatement,
	getNthTestNode,
	getTestNodes,
	getAllTestNodes,
};
