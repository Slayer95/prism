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
	while (node = getPrevSignificantSibling(node)) {
		yield node;
	}
}

function* getSignificantSiblingsAfter(node) {
	while (node = getNextSignificantSibling(node)) {
		yield node;
	}
}

function getUnwrapParensDescendant(node) {
	while (node.type === 'ParenthesizedExpression') {
		node = node.firstNamedChild;
	}
	return node;
}

function getUnwrapParensAncestor(node) {
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

function isNodeTypeAnyRL(node, type) {
	return (node.type.length === type.length + 1) && (node.type.slice(1) === type);
}

function assertNodeTypeAnyRL(node, type) {
	assert.strictEqual(node.type.slice(1), type);
}

module.exports = {
	findChildNamed,
	ensureKind,
	getSelfOrNextSignificantSibling,
	getPrevOfType,
	getNextOfType,
	getPrevSignificantSibling,
	getNextSignificantSibling,
	getSignificantSiblingsBefore,
	getSignificantSiblingsAfter,
	getUnwrapParensDescendant,
	getUnwrapParensAncestor,
	isFirstSignificantSibling,
	isLastSignificantSibling,
	getClosestAnyRL,
	isNodeTypeAnyRL,
	assertNodeTypeAnyRL,
};
