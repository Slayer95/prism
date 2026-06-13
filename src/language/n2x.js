"use strict";

const assert = require('assert/strict');
const N2N = require('./n2n');

const {
	findChildNamed,
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
	*/
	assertNodeTypeAnyRL,
	isNodeTypeAnyRL,
} = require('./../../lib/tree-helpers');

const Node2Struct = {
	FunctionSignature: {
		getParameters(node) {
			let parametersNode = N2N.FunctionSignature.extractParameters(node);
			if (parametersNode.type === 'Empty') {
				return [];
			} else {
				assert.equal(parametersNode.type, 'FunctionParameterList');
				const list = [];
				parametersNode = parametersNode.firstChild;
				do {
					assert.equal(parametersNode.type, 'FunctionParameter');
					list.push([
						findChildNamed(parametersNode, 'type').text,
						findChildNamed(parametersNode, 'name').text,
					]);
				// eslint-disable-next-line no-cond-assign
				} while (parametersNode = parametersNode.nextNamedSibling)
				return list;
			}
		},
		getReturnType(node) {
			const returnNode  = N2N.FunctionSignature.extractReturnType(node);
			if (returnNode.type === 'None') {
				return '';
			}
			assert.equal(returnNode.type, 'TypeReference');
			return returnNode.text;
		},
	},
	FunctionDeclaration: {
		getIsConstant(node) {
			return N2N.FunctionDeclaration.extractConstant(node) !== null;
		},
	},
	GlobalDeclarationStatement: {
		getIsConstant(node) {
			return N2N.GlobalDeclarationStatement.extractConstant(node) !== null;
		},
	},
	IfStatement: {
		getTuples(node) {
			const testNode = N2N.IfStatement.extractTest(node);
			const consequentNode = N2N.IfStatement.extractConsequent(node);
			assertNodeTypeAnyRL(consequentNode, 'Consequent');
			
			const result = [[testNode, consequentNode]];
			let elseOrElseIfStatement = consequentNode;
			// eslint-disable-next-line no-cond-assign
			while (elseOrElseIfStatement = getNextSignificantSibling(elseOrElseIfStatement)) {
				if (isNodeTypeAnyRL(elseOrElseIfStatement, 'ElseStatement')) {
					result.push([
						null,
						N2N.ElseStatement.extractAlternate(elseOrElseIfStatement),
					]);
				} else {
					assertNodeTypeAnyRL(elseOrElseIfStatement, 'ElseIfStatement');
					result.push([
						N2N.ElseIfStatement.extractTest(elseOrElseIfStatement),
						N2N.ElseIfStatement.extractAlternate(elseOrElseIfStatement),
					]);
				}
			}
			return result;
		},
	},
	NativeDeclaration: {
		getIsConstant(node) {
			return N2N.NativeDeclaration.extractConstant(node) !== null;
		},
	},
};

function copyRL(recv, name) {
	recv[`R${name}`] = recv[name];
	recv[`L${name}`] = recv[name];
}

copyRL(Node2Struct, 'IfStatement');

exports = Node2Struct;
module.exports = Node2Struct;
