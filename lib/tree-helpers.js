"use strict";

const assert = require('assert');

function findChildNamed(node, name) {
	const children = node.childrenForFieldName(name);
	if (children.length) return children[0];
	return null;
}

function ensureKind(node, type) {
	if (node.type !== type) return null;
	return node;
}

function getSelfOrPrevSignificantSibling(node) {
	while (node && (node.type === 'Comment' || node.type === 'NewLine')) {
		node = node.nextNamedSibling;
	}

	return node || null;
}

function getSelfOrNextSignificantSibling(node) {
	while (node && (node.type === 'Comment' || node.type === 'NewLine')) {
		node = node.nextNamedSibling;
	}

	return node || null;
}

function getPrevOfType(node, type) {
	do {
		node = node.prevNamedSibling;
	} while (node && node.type === type);

	return node || null;
}

function getNextOfType(node, type) {
	do {
		node = node.nextNamedSibling;
	} while (node && node.type === type);

	return node || null;
}

function getFirstSignificantChild(node) {
	return getSelfOrNextSignificantSibling(node.firstNamedChild);
}

function getLastSignificantChild(node) {
	return getSelfOrPrevSignificantSibling(node.lastNamedChild);
}

function getPrevSignificantSibling(node) {
	do {
		node = node.prevNamedSibling;
	} while (node && (node.type === 'Comment' || node.type === 'NewLine'));

	return node || null;
}

function getNextSignificantSibling(node) {
	do {
		node = node.nextNamedSibling;
	} while (node && (node.type === 'Comment' || node.type === 'NewLine'));

	return node || null;
}

function* getSignificantSiblingsBefore(node) {
	// eslint-disable-next-line no-cond-assign
	while (node = getPrevSignificantSibling(node)) {
		yield node;
	}
}

function* getSignificantSiblingsAfter(node) {
	// eslint-disable-next-line no-cond-assign
	while (node = getNextSignificantSibling(node)) {
		yield node;
	}
}

function* getChildren(node) {
	if (!node.namedChildCount) return;
	let child = node.firstNamedChild;
	do {
		yield child;
	// eslint-disable-next-line no-cond-assign
	} while (child = child.nextNamedSibling);
}

function getInsideParens(node) {
	while (node.type === 'ParenthesizedExpression') {
		node = node.firstNamedChild;
	}
	return node;
}

function getInsideAndParens(node) {
	node = node.firstNamedChild;
	while (node.type === 'ParenthesizedExpression') {
		node = node.firstNamedChild;
	}
	return node;
}

function getOutsideParens(node) {
	while (node.type === 'ParenthesizedExpression') {
		node = node.parent;
	}
	return node;
}

function getOutsideAndParens(node) {
	node = node.firstNamedChild;
	while (node.type === 'ParenthesizedExpression') {
		node = node.parent;
	}
	return node;
}

function isFirstSignificantSibling(node) {
	return getPrevSignificantSibling(node) === null;
}

function isLastSignificantSibling(node) {
	return getNextSignificantSibling(node) === null;
}

function getClosestAnyRL(node, type) {
	do {
		node = node.parent;
	} while (node && node.type.slice(1) !== type);

	return node || null;
}

function isNodeType(node, type) {
	return (node.type === type);
}

function isNodeTypeAnyRL(node, type) {
	try {
		return (node.type.length === type.length + 1) && (node.type.slice(1) === type);
	} catch (err) {
		throw new Error(`Invalid node ${typeof node} ${node.constructor} ${node.type}`, {cause: err});
	}
}

function assertNodeType(node, type) {
	assert.strictEqual(node.type, type);
}

function assertNodeTypeAnyRL(node, type) {
	assert.strictEqual(node.type.slice(1), type);
}

module.exports = {
	findChildNamed,
	ensureKind,
	getSelfOrPrevSignificantSibling,
	getSelfOrNextSignificantSibling,
	getPrevOfType,
	getNextOfType,
	getFirstSignificantChild,
	getLastSignificantChild,
	getPrevSignificantSibling,
	getNextSignificantSibling,
	getSignificantSiblingsBefore,
	getSignificantSiblingsAfter,
	getChildren,
	getInsideParens, getInsideAndParens,
	getOutsideParens, getOutsideAndParens,
	isFirstSignificantSibling,
	isLastSignificantSibling,
	getClosestAnyRL,
	isNodeType,
	isNodeTypeAnyRL,
	assertNodeType,
	assertNodeTypeAnyRL,
};
