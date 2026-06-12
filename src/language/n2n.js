"use strict";

const {
	findChildNamed,
	/*
	ensureKind,
	getPrevSignificantSibling,
	getNextSignificantSibling,
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
			return node.lastNamedChild;
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
			return node.lastNamedChild;
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
			if (node.firstChild.type === 'ConstantAttribute') {
				return node.firstChild;
			}
			return null;
		},
		extractSignature(node /* FunctionDeclaration */) {
			return findChildNamed(node, 'signature');
		},
		extractBody(node /* FunctionDeclaration */) {
			return node.lastNamedChild;
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
			return node.firstNamedChild;
		},
		extractConsequent(node /* IfStatement */) {
			return node.firstNamedChild.nextNamedSibling;
		},
	},
	ElseIfStatement: {
		extractTest(node /* IfStatement */) {
			return node.firstNamedChild;
		},
		extractAlternate(node /* ElseStatement */) {
			return node.lastNamedChild;
		},
	},
	ElseStatement: {
		extractAlternate(node /* ElseStatement */) {
			return node.lastNamedChild;
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
			if (node.lastNamedChild.type !== 'Initializer') return null;
			return node.lastNamedChild.lastNamedChild;
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
			return node.lastNamedChild;
		},
	},
	ReturnStatement: {
		extractExpression(node /* ReturnStatement */) {
			if (node.namedChildCount === 0) return null;
			return node.lastNamedChild;	
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
			return node.lastNamedChild;
		},
	},
	TypeDeclaration: {
		extractSub(node /* TypeDeclaration */) {
			return node.firstNamedChild;
		},
		extractSuper(node /* TypeDeclaration */) {
			return node.lastNamedChild;
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
