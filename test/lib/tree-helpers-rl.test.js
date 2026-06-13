"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const JassParser = require('./../../src/parser/parser');
const treeHelpers = require('./../../lib/tree-helpers');

const RL_AWARE_BASES = new Set([
	"IfStatement",
	"ElseIfStatement",
	"ElseStatement",
	"Consequent",
	"Alternate",
]);

const SOURCE = `
function Main takes nothing returns nothing
	if a == 0 then
		call Foo()
	elseif a == 1 then
		call Bar()
	else
		call Baz()
	endif

	loop
		if b == 0 then
			exitwhen true
		elseif b == 1 then
			call Foo()
		else
			call Bar()
		endif
	endloop
endfunction
`;

function getTree() {
	const { error, tree } = JassParser.parse(SOURCE);
	assert.equal(error, null, error ? error.message : "");
	assert.ok(tree && tree.rootNode, "expected a tree-sitter tree");
	return tree;
}

function getBaseType(type) {
	return type.replace(/^[LR]/, "");
}

function hasAncestorOfType(node, type) {
	// eslint-disable-next-line no-cond-assign
	while (node = node.parent) {
		if (node.type === type) {
			return true;
		}
	}
	return false;
}

function ancestorOfType(node, type) {
	// eslint-disable-next-line no-cond-assign
	while (node = node.parent) {
		if (node.type === type) {
			return node;
		}
	}
	return null;
}

function isInsideLoop(node) {
	return hasAncestorOfType(node, "LoopStatement");
}

test("RL-aware node types are prefixed according to loop depth", () => {
	const tree = getTree();

	const rlNodes = treeHelpers.filterNodes(tree, (node) => RL_AWARE_BASES.has(getBaseType(node.type)));
	assert.ok(rlNodes.length > 0, "expected RL-aware nodes in the fixture");

	for (const node of rlNodes) {
		const expectedPrefix = isInsideLoop(node) ? "L" : "R";
		assert.equal(node.type[0], expectedPrefix, `${node.type} should use ${expectedPrefix}`);
		assert.notEqual(node.type, getBaseType(node.type), `${getBaseType(node.type)} must not appear unprefixed`);
	}
});

test("unprefixed RL-aware node kinds do not appear in the tree", () => {
	const tree = getTree();

	for (const base of RL_AWARE_BASES) {
		assert.equal(
			treeHelpers.findNode(tree, (node) => node.type === base),
			null,
			`${base} should be RL-prefixed only`,
		);

		const any = treeHelpers.findNodeOfTypeAnyRL(tree, base);
		assert.ok(any, `expected an RL-prefixed ${base}`);
		assert.match(any.type, new RegExp(`^[LR]${base}$`));

		assert.equal(treeHelpers.findNodeOfType(tree, base), null);
		assert.equal(treeHelpers.isNodeTypeAnyRL(any, base), true);
		assert.equal(treeHelpers.isNodeType(any, base), false);
	}
});

test("ExitWhenStatement only occurs inside loops", () => {
	const tree = getTree();

	const exits = treeHelpers.filterNodes(tree, (node) => node.type === "ExitWhenStatement");
	assert.ok(exits.length > 0, "expected at least one ExitWhenStatement");

	for (const node of exits) {
		assert.ok(isInsideLoop(node), "ExitWhenStatement must be nested under a LoopStatement");
	}
});

test("getClosestAnyRL resolves the surrounding RL-aware branch", () => {
	const tree = getTree();

	const outerCall = treeHelpers.findNode(
		tree,
		(node) => node.type === "CallStatement" && hasAncestorOfType(node, "RConsequent"),
	);
	assert.ok(outerCall, "missing call in the outer consequent");

	const innerCall = treeHelpers.findNode(
		tree,
		(node) => node.type === "CallStatement" && hasAncestorOfType(node, "LAlternate"),
	);
	assert.ok(innerCall, "missing call in the loop alternate");

	assert.strictEqual(
		treeHelpers.getClosestAnyRL(outerCall, "Consequent"),
		ancestorOfType(outerCall, "RConsequent"),
	);

	assert.strictEqual(
		treeHelpers.getClosestAnyRL(innerCall, "Alternate"),
		ancestorOfType(innerCall, "LAlternate"),
	);

	const exitWhen = treeHelpers.findNode(tree, (node) => node.type === "ExitWhenStatement");
	assert.ok(exitWhen, "missing ExitWhenStatement");

	const enclosingIf = treeHelpers.getClosestAnyRL(exitWhen, "IfStatement");
	assert.ok(enclosingIf, "expected an enclosing IfStatement");
	assert.match(enclosingIf.type, /^LIfStatement$/);
});

test("RL-aware kinds are found through the RL helper, not the plain helper", () => {
	const tree = getTree();

	for (const base of RL_AWARE_BASES) {
		const rlNode = treeHelpers.findNodeOfTypeAnyRL(tree, base);
		assert.ok(rlNode, `expected ${base} via findNodeOfTypeAnyRL`);
		assert.match(rlNode.type, new RegExp(`^[LR]${base}$`));

		assert.equal(
			treeHelpers.findNodeOfType(tree, base),
			null,
			`${base} must not be exposed as an unprefixed node type`,
		);

		treeHelpers.assertNodeTypeAnyRL(rlNode, base);
		assert.throws(() => treeHelpers.assertNodeType(rlNode, base));
	}
});
