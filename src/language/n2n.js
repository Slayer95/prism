"use strict";

const {
	findChildNamed,
	getFirstSignificantChild,
	getLastSignificantChild,
	getNextSignificantSibling,
	/*
	ensureKind,
	getPrevSignificantSibling,
	getSignificantSiblingsBefore,
	getSignificantSiblingsAfter,
	getInsideParens,
	getOutsideParens,
	getChildren,
	isLastSignificantSibling,
	getClosestAnyRL,
	isNodeTypeAnyRL,
	assertNodeTypeAnyRL,
	*/
} = require('./../../lib/tree-helpers');

const Node2Node = {
	ArrayElement: {
		extractVariable(node /* ArrayElement */) {
			return node.firstNamedChild;
		},
		extractIndex(node /* ArrayElement */) {
			return node.lastNamedChild;
		},
	},
	CallStatement: {
		extractCallExpression(node /* CallStatement */) {
			return getLastSignificantChild(node);
		},
	},
	CallExpression: {
		extractCallee(node /* CallExpression */) {
			return node.firstNamedChild;
		},
		extractArgumentList(node /* CallExpression */) {
			const maybeArguments = node.lastNamedChild;
			if (maybeArguments.type !== 'FunctionArgumentList') {
				return null;
			}
			return maybeArguments;
		},
	},
	ExitWhenStatement: {
		extractTest(node /* ExitWhenStatement */) {
			return getLastSignificantChild(node);
		},
	},
	FunctionArgumentList: {
		extractNthArgument(node /* FunctionArgumentList */, n /* index, zero-based */) {
			if (n >= node.namedChildCount) return null;
			let fnArgument = node.firstNamedChild;
			while (n > 0) {
				fnArgument = fnArgument.nextNamedSibling;
				n--;
			}
			return fnArgument;
		},
	},
	FunctionDeclaration: {
		extractConstant(node /* FunctionDeclaration */) {
			if (node.firstNamedChild.type === 'ConstantAttribute') {
				return node.firstNamedChild;
			}
			return null;
		},
		extractSignature(node /* FunctionDeclaration */) {
			return findChildNamed(node, 'signature');
		},
		extractBody(node /* FunctionDeclaration */) {
			return getLastSignificantChild(node);
		},
	},
	FunctionSignature: {
		extractName(node /* FunctionSignature */) {
			return node.firstNamedChild;
		},
		extractParameters(node /* FunctionSignature */) {
			return findChildNamed(node, 'input');
		},
		extractReturnType(node /* FunctionSignature */) {
			return findChildNamed(node, 'output');
		},
	},
	GlobalDeclarationStatement: {
		extractConstant(node /* GlobalDeclarationStatement */) {
			if (node.firstChild.type === 'ConstantAttribute') {
				return node.firstChild;
			}
			return null;
		},
		extractType(node /* GlobalDeclarationStatement */) {
			return findChildNamed(node, 'type');
		},
		extractName(node /* GlobalDeclarationStatement */) {
			return findChildNamed(node, 'name');
		},
		extractValue(node /* GlobalDeclarationStatement */) {
			if (node.lastNamedChild.type !== 'Initializer') return null;
			return node.lastNamedChild.lastNamedChild;
		},
	},
	IfStatement: {
		extractTest(node /* IfStatement */) {
			return getFirstSignificantChild(node);
		},
		extractConsequent(node /* IfStatement */) {
			return getNextSignificantSibling(getFirstSignificantChild(node));
		},
	},
	ElseIfStatement: {
		extractTest(node /* IfStatement */) {
			return getFirstSignificantChild(node);
		},
		extractAlternate(node /* ElseStatement */) {
			return getLastSignificantChild(node);
		},
	},
	ElseStatement: {
		extractAlternate(node /* ElseStatement */) {
			return getLastSignificantChild(node);
		},
	},
	LocalDeclarationStatement: {
		extractType(node /* GlobalDeclarationStatement */) {
			return findChildNamed(node, 'type');
		},
		extractName(node /* GlobalDeclarationStatement */) {
			return findChildNamed(node, 'name');
		},
		extractValue(node /* GlobalDeclarationStatement */) {
			const lastSignificant = getLastSignificantChild(node);
			if (lastSignificant.type !== 'Initializer') return null;
			return getLastSignificantChild(lastSignificant);
		},
	},
	NativeDeclaration: {
		extractConstant(node /* NativeDeclaration */) {
			if (node.firstChild.type === 'ConstantAttribute') {
				return node.firstChild;
			}
			return null;
		},
		extractSignature(node /* NativeDeclaration */) {
			return getLastSignificantChild(node);
		},
	},
	ReturnStatement: {
		extractExpression(node /* ReturnStatement */) {
			if (node.namedChildCount === 0) return null;
			return getLastSignificantChild(node);
		},
	},
	SetStatement: {
		extractBinding(node /* SetStatement */) {
			return node.firstNamedChild;
		},
		extractVariable(node /* SetStatement */) {
			const binding = Node2Node.SetStatement.extractBinding(node);
			if (binding.type !== 'ArrayElement') {
				return binding;
			}
			return Node2Node.ArrayElement.extractVariable(binding);
		},
		extractValue(node /* SetStatement */) {
			return getLastSignificantChild(getLastSignificantChild(node));
		},
	},
	TypeDeclaration: {
		extractSub(node /* TypeDeclaration */) {
			return node.firstNamedChild;
		},
		extractSuper(node /* TypeDeclaration */) {
			return getLastSignificantChild(node);
		},
	},
};

function copyRL(recv, name) {
	recv[`R${name}`] = recv[name];
	recv[`L${name}`] = recv[name];
}

copyRL(Node2Node, 'IfStatement');

exports = Node2Node;
module.exports = Node2Node;
