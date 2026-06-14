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
		node = node.previousNamedSibling;
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
		node = node.previousNamedSibling;
	} while (node && node.type !== type);

	return node || null;
}

function getNextOfType(node, type) {
	do {
		node = node.nextNamedSibling;
	} while (node && node.type !== type);

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
		node = node.previousNamedSibling;
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

function* getSignificantChildren(node) {
	if (!node.namedChildCount) return;
	let child = getFirstSignificantChild(node);
	do {
		yield child;
	// eslint-disable-next-line no-cond-assign
	} while (child = getNextSignificantSibling(child));
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

function getClosest(node, type) {
	do {
		node = node.parent;
	} while (node && node.type !== type);

	return node || null;
}

function getClosestAnyRL(node, type) {
	do {
		node = node.parent;
	} while (node && node.type.slice(1) !== type);

	return node || null;
}

function getClosestStatement(node) {
	do {
		node = node.parent;
	} while (node && !node.type.endsWith('Statement'));

	return node || null;
}

function isNodeType(node, type) {
	return (node.type === type);
}

function isNodeTypeAnyRL(node, type) {
	try {
		return (node.type.length === type.length + 1) && (node.type.slice(1) === type);
	} catch (err) {
		throw new Error(`Invalid node ${typeof node} ${node.constructor.name} ${node?.type}`, {cause: err});
	}
}

function assertNodeType(node, type) {
	assert.strictEqual(node.type, type);
}

function assertNodeTypeAnyRL(node, type) {
	assert.strictEqual(node.type.slice(1), type);
}

function assertLastNamedChild(node, ancestorNode = node.parent) {
	while (node && node.parent !== ancestorNode) {
		assert(!node.nextNamedSibling);
		node = node.parent;
	}
}

function assertNoNamedChildren(node) {
	assert.equal(node.namedChildCount, 0);
}

function assertOnlyNamedChild(node) {
	assert.equal(node.parent.namedChildCount, 1);
}

function* getAllNodes(tree) {
	const cursor = tree.rootNode.walk();
	let reachedRoot = false;

	while (!reachedRoot) {
		yield cursor.currentNode;

		if (cursor.gotoFirstChild()) {
			continue;
		}

		if (cursor.gotoNextSibling()) {
			continue;
		}

		while (true) {
			if (!cursor.gotoParent()) {
				reachedRoot = true;
				break;
			}

			if (cursor.gotoNextSibling()) {
				break;
			}
		}
	}
}

function* walkTree(tree) {
	const ENTER_NODE = {enter: true, leave: false, direction: 1, node: null};
	const LEAVE_NODE = {enter: false, leave: true, direction: 0, node: null};

	const cursor = tree.rootNode.walk();
	let reachedRoot = false;

	while (!reachedRoot) {
		ENTER_NODE.node = cursor.currentNode;
		yield ENTER_NODE;

		if (cursor.gotoFirstChild()) {
			continue;
		}

		LEAVE_NODE.node = cursor.currentNode;
		yield LEAVE_NODE;

		if (cursor.gotoNextSibling()) {
			continue;
		}

		while (true) {
			if (!cursor.gotoParent()) {
				reachedRoot = true;
				break;
			}

			LEAVE_NODE.node = cursor.currentNode;
			yield LEAVE_NODE;

			if (cursor.gotoNextSibling()) {
				break;
			}
		}
	}
}

function findNodeOfType(tree, type) {
	for (const node of getAllNodes(tree)) {
		if (node.type === type) {
			return node;
		}
	}
	return null;
}

function findNodeOfTypeAnyRL(tree, type) {
	for (const node of getAllNodes(tree)) {
		if (isNodeTypeAnyRL(node, type)) {
			return node;
		}
	}
	return null;
}

function findNode(tree, filterFn) {
	for (const node of getAllNodes(tree)) {
		if (filterFn(node)) {
			return node;
		}
	}
	return null;
}

function filterNodes(tree, filterFn) {
	const output = [];
	for (const node of getAllNodes(tree)) {
		if (filterFn(node)) {
			output.push(node);
		}
	}
	return output;
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
	getSignificantChildren,
	getInsideParens, getInsideAndParens,
	getOutsideParens, getOutsideAndParens,
	isFirstSignificantSibling,
	isLastSignificantSibling,
	getClosest,
	getClosestAnyRL,
	getClosestStatement,
	isNodeType,
	isNodeTypeAnyRL,
	getAllNodes,
	walkTree,
	filterNodes,
	findNode,
	findNodeOfType,
	findNodeOfTypeAnyRL,
	assertNodeType,
	assertNodeTypeAnyRL,
	assertLastNamedChild,
	assertNoNamedChildren,
	assertOnlyNamedChild,
};
