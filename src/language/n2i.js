"use strict";

const N2N = require('./n2n');

const Node2Identifier = {
	ArrayElement: {
		extractVariable(node /* ArrayElement */) {
			return N2N.ArrayElement.extractVariable(node).text;
		},
	},
	CallExpression: {
		extractCalleeName(node /* CallExpression */) {
			return N2N.CallExpression.extractCallee(node).text;
		},
	},
	FunctionSignature: {
		extractName(node /* FunctionSignature */) {
			return N2N.FunctionSignature.extractName(node).text;
		},
	},
	SetStatement: {
		extractVariable(node /* SetStatement */) {
			return N2N.SetStatement.extractVariable(node).text;
		},
	},
	TypeDeclaration: {
		extractSub(node /* TypeDeclaration */) {
			return N2N.TypeDeclaration.extractSub(node).text;
		},
		extractSuper(node /* TypeDeclaration */) {
			return N2N.TypeDeclaration.extractSuper(node).text;
		},
	},
};

exports = Node2Identifier;
module.exports = Node2Identifier;
