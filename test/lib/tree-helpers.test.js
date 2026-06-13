"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const JassParser = require('./../../src/parser/parser');
const treeHelpers = require('./../../lib/tree-helpers');

const SOURCE = `
globals
    // global data
    constant integer gAnswer = 42
    real array gNumbers
endglobals

type Foo extends Bar

constant native NativeFoo takes nothing returns nothing

function Noop takes nothing returns nothing
    return
endfunction

function ReturnsTwice takes nothing returns nothing
    return
    return
endfunction

function Main takes nothing returns nothing
    // leading body comment
    local integer i = 0
    local integer z = (((1)))
    if i == 0 then
        set z = z + 1
    elseif i > 0 then
        set z = z - 1
    else
        set z = 0
    endif
    loop
        exitwhen i == 0
        set i = i - 1
    endloop
	// intentional bad signature usage
    call Noop(function Main)
    // trailing comment before final return
    return
endfunction
`;

function getTree() {
	const result = JassParser.parse(SOURCE);
	assert.ok(result && typeof result === "object", "JASSParser.parse should return an object");
	assert.ok(result.error == null, result.error ? result.error.message : "expected parse success");
	assert.ok(result.tree && result.tree.rootNode, "expected a tree-sitter tree");
	return result.tree;
}

function walkEventsForTree(tree) {
	return [...treeHelpers.walkTree(tree)].map((event) => ({
		enter: event.enter,
		leave: event.leave,
		direction: event.direction,
		type: event.node.type,
		text: event.node.text,
		startIndex: event.node.startIndex,
		endIndex: event.node.endIndex,
	}));
}

function textOf(node) {
	return SOURCE.slice(node.startIndex, node.endIndex);
}

function functionByName(tree, name) {
	return treeHelpers.findNode(tree, (node) => {
		if (node.type !== "FunctionDeclaration") return false;
		const signature = treeHelpers.findChildNamed(node, "signature");
		if (!signature) return false;
		const sigName = treeHelpers.findChildNamed(signature, "name");
		return sigName && textOf(sigName) === name;
	});
}

function bodyOf(funcDecl) {
	const children = [...treeHelpers.getChildren(funcDecl)];
	return children.find((node) => node.type === "FunctionBody") || null;
}

function signatureOf(funcDecl) {
	return treeHelpers.findChildNamed(funcDecl, "signature");
}

test("parser smoke test and program root", () => {
	const tree = getTree();
	assert.equal(tree.rootNode.type, "program");

	const rootChildren = [...treeHelpers.getChildren(tree.rootNode)];
	assert.ok(rootChildren.length > 0, "root should have named children");
	assert.equal(rootChildren[0].type, "NewLine");
});

test("field lookup helpers work on signatures and top-level declarations", () => {
	const tree = getTree();

	const noop = functionByName(tree, "Noop");
	assert.ok(noop, "missing Noop function");

	const sig = signatureOf(noop);
	assert.ok(sig, "missing signature");

	const signatureChildren = [...treeHelpers.getChildren(sig)];
	assert.deepStrictEqual(
		signatureChildren.map((node) => node.type),
		["Identifier", "Empty", "None"],
	);
	assert.deepStrictEqual(
		signatureChildren.map((node) => textOf(node)),
		["Noop", "nothing", "nothing"],
	);

	const name = treeHelpers.findChildNamed(sig, "name");
	const input = treeHelpers.findChildNamed(sig, "input");
	const output = treeHelpers.findChildNamed(sig, "output");

	assert.equal(textOf(name), "Noop");
	assert.equal(input.type, "Empty");
	assert.equal(output.type, "None");
	assert.strictEqual(treeHelpers.ensureKind(name, "Identifier"), name);
	assert.equal(treeHelpers.ensureKind(name, "TypeReference"), null);
	assert.equal(treeHelpers.findChildNamed(sig, "missing"), null);

	const typeDecl = treeHelpers.findNode(tree, (node) => node.type === "TypeDeclaration");
	assert.ok(typeDecl, "missing type declaration");
	assert.equal(textOf(treeHelpers.findChildNamed(typeDecl, "name")), "Foo");
	assert.equal(textOf(treeHelpers.findChildNamed(typeDecl, "super")), "Bar");

	const nativeDecl = treeHelpers.findNode(tree, (node) => node.type === "NativeDeclaration");
	assert.ok(nativeDecl, "missing native declaration");
	const nativeSig = treeHelpers.findChildNamed(nativeDecl, "signature");
	assert.equal(treeHelpers.findChildNamed(nativeSig, "name").type, "Identifier");
});

test("significant child helpers ignore comments and layout", () => {
	const tree = getTree();

	const main = functionByName(tree, "Main");
	assert.ok(main, "missing Main function");
	const body = bodyOf(main);
	assert.ok(body, "missing Main body");

	const children = Array.from(treeHelpers.getSignificantChildren(body));
	const first = treeHelpers.getFirstSignificantChild(body);
	const last = treeHelpers.getLastSignificantChild(body);
	assert.equal(first, children[0]);
	assert.equal(last, children.at(-1));

	assert.equal(first.type, "LocalDeclarationStatement");
	assert.equal(textOf(treeHelpers.findChildNamed(first, "name"),), "i");
	assert.equal(last.type, "ReturnStatement");

	assert.ok(treeHelpers.isFirstSignificantSibling(first));
	assert.ok(treeHelpers.isLastSignificantSibling(last));

	const afterFirst = treeHelpers.getNextSignificantSibling(first);
	assert.equal(afterFirst.type, "LocalDeclarationStatement");
	assert.equal(textOf(treeHelpers.findChildNamed(afterFirst, "name")), "z");

	const beforeLast = treeHelpers.getPrevSignificantSibling(last);
	assert.equal(beforeLast.type, "CallStatement");

	const siblingsBefore = [...treeHelpers.getSignificantSiblingsBefore(last)];
	assert.deepStrictEqual(
		siblingsBefore.slice(0, 3).map((node) => node.type),
		["CallStatement", "LoopStatement", "RIfStatement"],
	);

	const siblingsAfter = [...treeHelpers.getSignificantSiblingsAfter(first)];
	assert.deepStrictEqual(
		siblingsAfter.slice(0, 3).map((node) => node.type),
		["LocalDeclarationStatement", "RIfStatement", "LoopStatement"],
	);
});

test("self-or-prev and self-or-next significant sibling helpers respect direction", () => {
	const tree = getTree();

	const comment = treeHelpers.findNode(tree, (node) => node.type === "Comment" && textOf(node).includes("trailing comment before final return"));
	assert.ok(comment, "missing trailing comment");

	const prev = treeHelpers.getSelfOrPrevSignificantSibling(comment);
	const next = treeHelpers.getSelfOrNextSignificantSibling(comment);

	assert(prev, `node before comment is missing - parent is ${comment.parent.type}`);
	assert(next, `node after comment is missing - parent is ${comment.parent.type}`);
	assert.equal(prev.type, "CallStatement");
	assert.equal(next.type, "ReturnStatement");
});

test("prevOfType and nextOfType return the nearest sibling with the requested type", () => {
	const tree = getTree();

	const returnsTwice = functionByName(tree, "ReturnsTwice");
	assert.ok(returnsTwice, "missing ReturnsTwice function");
	const body = bodyOf(returnsTwice);
	assert.ok(body, "missing ReturnsTwice body");

	const returnNodes = treeHelpers.filterNodes(tree,
		(node) => node.type === "ReturnStatement" && node.parent === body,
	).sort((a, b) => a.startIndex - b.startIndex);

	assert.equal(returnNodes.length, 2, "expected exactly two return statements");

	const [firstReturn, secondReturn] = returnNodes;

	assert.strictEqual(treeHelpers.getNextOfType(firstReturn, "ReturnStatement"), secondReturn);
	assert.strictEqual(treeHelpers.getPrevOfType(secondReturn, "ReturnStatement"), firstReturn);
});

test("paren helpers unwrap and rewrap nested parentheses", () => {
	const tree = getTree();

	const initializer = treeHelpers.findNode(
		tree,
		(node) => node.type === "Initializer" && textOf(node).includes("(((1)))"),
	);
	assert.ok(initializer, "missing nested initializer");

	const outerParen = treeHelpers.findNode(
		tree,
		(node) => node.type === "ParenthesizedExpression" && textOf(node) === "(((1)))",
	);
	assert.ok(outerParen, "missing outer parenthesized expression");

	const inside = treeHelpers.getInsideParens(outerParen);
	assert.equal(inside.type, "Literal");
	assert.equal(textOf(inside), "1");

	assert.strictEqual(treeHelpers.getInsideAndParens(initializer), inside);
	assert.strictEqual(treeHelpers.getOutsideParens(outerParen), initializer);
	assert.strictEqual(treeHelpers.getOutsideAndParens(outerParen), initializer);
});

test("node type helpers work", () => {
	const tree = getTree();

	const setStatement = treeHelpers.findNodeOfType(tree, "SetStatement");
	assert.ok(setStatement, "missing set statement");
	assert.match(setStatement.type, /^SetStatement$/);

	const loopSet = treeHelpers.findNode(
		tree,
		(node) => node.type === 'SetStatement' && textOf(node).includes("set i = i - 1"),
	);
	assert.ok(loopSet, "missing loop set statement");
	assert.ok(treeHelpers.isNodeType(loopSet, loopSet.type));
	treeHelpers.assertNodeType(loopSet, loopSet.type);
});

test("getAllNodes traverses the whole tree", () => {
	const tree = getTree();
	const nodes = Array.from(treeHelpers.getAllNodes(tree));

	assert.equal(nodes[0].type, "program");
	assert.ok(nodes.some((node) => node.type === "GlobalsBlock"));
	assert.ok(nodes.some((node) => node.type === "TypeDeclaration"));
	assert.ok(nodes.some((node) => node.type === "NativeDeclaration"));
	assert.ok(nodes.some((node) => node.type === "FunctionDeclaration" && textOf(node).includes("function Main")));
	assert.ok(nodes.some((node) => node.type === "LoopStatement"));
	assert.ok(nodes.some((node) => node.type === "Comment"));
});

test("walkTree yields balanced enter/leave events", () => {
	const tree = getTree();
	const events = walkEventsForTree(tree);

	assert.ok(events.length > 0, "walkTree should yield events");
	assert.equal(events[0].enter, true);
	assert.notEqual(events[0].type, "program");
	assert.equal(events[events.length - 1].leave, true);
	assert.equal(events[events.length - 1].type, "program");

	const enterCount = events.filter((event) => event.enter).length;
	const leaveCount = events.filter((event) => event.leave).length;
	assert.equal(enterCount, leaveCount);
});

test("findNodeOfType locates expected nodes", () => {
	const tree = getTree();

	const globals = treeHelpers.findNodeOfType(tree, "GlobalsBlock");
	const typeDecl = treeHelpers.findNodeOfType(tree, "TypeDeclaration");
	const returnSt = treeHelpers.findNodeOfType(tree, "ReturnStatement");

	assert.ok(globals, "missing globals block");
	assert.ok(typeDecl, "missing type declaration");
	assert.ok(returnSt, "missing return statement");
});

test("assert helpers validate node constraints", () => {
	const tree = getTree();

	const noop = functionByName(tree, "Noop");
	const sig = signatureOf(noop);
	const name = treeHelpers.findChildNamed(sig, "name");
	const output = treeHelpers.findChildNamed(sig, "output");

	treeHelpers.assertNoNamedChildren(name);
	treeHelpers.assertLastNamedChild(output, sig);

	const main = functionByName(tree, "Main");
	const body = bodyOf(main);
	const firstLocal = treeHelpers.getFirstSignificantChild(body);
	assert.ok(firstLocal, "missing first local");

	const outerParen = treeHelpers.findNode(
		tree,
		(node) => node.type === "ParenthesizedExpression" && textOf(node) === "(((1)))",
	);
	assert.ok(outerParen, "missing outer parenthesized expression");

	const literal = treeHelpers.getInsideParens(outerParen);
	treeHelpers.assertOnlyNamedChild(literal);
	treeHelpers.assertNodeType(literal, "Literal");
});
