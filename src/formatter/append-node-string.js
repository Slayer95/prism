"use strict";

const assert = require('assert/strict');
const path = require('path');
const util = require('util');

const NodeToNode = require('./../language/n2n');
const NodeToIdentifier = require('./../language/n2i');
const NodeToStruct = require('./../language/n2x');

const {
	getChildren,
	getInsideParens, getInsideAndParens,
} = require('./../../lib/tree-helpers');

function indent(c, depth, content) {
	return `${c.repeat(depth)}${content}`;
}

function joinTupleWithSpace(tuple) {
	return `${tuple[0]} ${tuple[1]}`;
}

function parametersToString(parameters) {
	if (!parameters.length) return `nothing`;
	return parameters.map(joinTupleWithSpace).join(', ');
}

function returnTypeToString(returnType) {
	if (!returnType) return `nothing`;
	return returnType;
}

function typeToString(typeNode) {
	if (typeNode.type === 'AtomicType') return typeNode.text;
	return `${typeNode.firstNamedChild.text} array`;
}

function maybePrefix(flag, content) {
	if (!flag) return ``;
	return `${content} `;
}

function maybeSuffix(flag, content) {
	if (!flag) return ``;
	return ` ${content}`;
}

function doNewLine(buffer, node) {
	if (node.type === 'NewLine') {
		if (node.text === '\r' && (node.nextSibling.type === node.type) && (node.nextSibling.text === '\n')) {
			return true;
		}
		buffer.push('\n');
		return true;
	}
	return false;
}

function wrapParens(source) {
	return `(${source})`;
}

function expressionToString(node) {
	/*
	switch (node.type) {
		case 'BinaryExpression':
			return `${expressionToStringNormalParens(node.lhs)} ${node.operator} ${expressionToStringNormalParens(node.rhs)}`);
	}
	*/
	return node.text.trim();
}

function expressionToStringNormalParens(node) {
	return wrapParens(expressionToString(getInsideParens(node)));
}

function testToString(node) {
	return wrapParens(expressionToString(getInsideAndParens(node)));
}

function appendNodeString(buffer, node, indentString, indentDepth = 0) {
	assert.equal(typeof node.type, 'string');
	const N2I = NodeToIdentifier[node.type];
	const N2N = NodeToNode[node.type];
	const N2X = NodeToStruct[node.type];

	switch (node.type) {
		case 'program': {
			for (const topLevelNode of getChildren(node)) {
				appendNodeString(buffer, topLevelNode, indentString, 0);
			}
			break;
		}

		case 'BOM': {
			// JASS files are not UTF-8, so get rid of the BOM.
			break;
		}

		case 'Comment': {
			const lines = node.text.trim().split('\r');
			for (let i = 0; i < lines.length - 1; i++) {
				buffer.push(indent(indentString, indentDepth, `// ${lines[i].slice(2).trim()}\n`));
			}
			buffer.push(indent(indentString, indentDepth, `// ${lines[lines.length - 1].slice(2).trim()}`));
			break;
		}

		case 'NewLine': {
			doNewLine(buffer, node);
			break;
		}

		case 'TypeDeclaration': {
			const subName = N2I.extractSub(node);
			const superName = N2I.extractSuper(node);
			buffer.push(`type ${subName} extends ${superName}`);
			break;
		}

		case 'GlobalsBlock': {
			buffer.push('globals');
			for (const childNode of getChildren(node)) {
				if (doNewLine(buffer, childNode)) continue;
				appendNodeString(buffer, childNode, indentString, 1);
			}
			buffer.push('endglobals');
			break;
		}

		case 'GlobalDeclarationStatement': {
			const isConstant = N2X.getIsConstant(node);
			const typeNode = N2N.extractType(node);
			const nameNode = N2N.extractName(node);
			const valueNode = N2N.extractValue(node);
			const constantFragment = maybePrefix(isConstant, 'constant');
			const initializerFragment = valueNode ? ` = ${expressionToString(valueNode)}` : ``;
			buffer.push(indent(indentString, indentDepth, `${constantFragment}${typeToString(typeNode)} ${nameNode.text}${initializerFragment}`));
			break;
		}

		case 'NativeDeclaration': {
			const isConstant = N2X.getIsConstant(node);
			const signatureNode = N2N.extractSignature(node);
			assert.equal(signatureNode.type, 'FunctionSignature');
			const parameters = NodeToStruct.FunctionSignature.getParameters(signatureNode);
			const returnType = NodeToStruct.FunctionSignature.getReturnType(signatureNode);
			const constantFragment = maybePrefix(isConstant, 'constant');
			const nativeName = NodeToIdentifier.FunctionSignature.extractName(signatureNode);
			const parameterFragment = parametersToString(parameters);
			const returnTypeFragment = returnTypeToString(returnType);
			buffer.push(`${constantFragment}native ${nativeName} takes ${parameterFragment} returns ${returnTypeFragment}`);
			break;
		}

		case 'FunctionDeclaration': {
			const isConstant = N2X.getIsConstant(node);
			const signatureNode = N2N.extractSignature(node);
			assert.equal(signatureNode.type, 'FunctionSignature');
			const parameters = NodeToStruct.FunctionSignature.getParameters(signatureNode);
			const returnType = NodeToStruct.FunctionSignature.getReturnType(signatureNode);
			const constantFragment = maybePrefix(isConstant, 'constant');
			const functionName = NodeToIdentifier.FunctionSignature.extractName(signatureNode);
			const parameterFragment = parametersToString(parameters);
			const returnTypeFragment = returnTypeToString(returnType);
			const functionBody = N2N.extractBody(node);
			buffer.push(`${constantFragment}function ${functionName} takes ${parameterFragment} returns ${returnTypeFragment}`);
			for (const childNode of getChildren(functionBody)) {
				appendNodeString(buffer, childNode, indentString, 1);
			}
			buffer.push('endfunction');
			break;
		}

		case 'LocalDeclarationStatement': {
			const typeNode = N2N.extractType(node);
			const nameNode = N2N.extractName(node);
			const valueNode = N2N.extractValue(node);
			const initializerFragment = valueNode ? ` = ${expressionToString(valueNode)}` : ``;
			buffer.push(indent(indentString, indentDepth, `local ${typeToString(typeNode)} ${nameNode.text}${initializerFragment}`));
			break;
		}

		case 'RIfStatement':
		case 'LIfStatement': {
			const ifTuples = N2X.getTuples(node);
			let index = 0;
			buffer.push(indent(indentString, indentDepth, `if ${testToString(ifTuples[index][0])} then`));
			appendNodeString(buffer, ifTuples[index][1], indentString, indentDepth);
			index = index + 1;
			while (index < ifTuples.length && ifTuples[index][0] !== null) {
				buffer.push(indent(indentString, indentDepth, `elseif ${testToString(ifTuples[index][0])} then`));
				appendNodeString(buffer, ifTuples[index][1], indentString, indentDepth);
				index = index + 1;
			}
			if (index < ifTuples.length) {
				buffer.push(indent(indentString, indentDepth, `else`));
				appendNodeString(buffer, ifTuples[index][1], indentString, indentDepth);
			}
			buffer.push(indent(indentString, indentDepth, `endif`));
			break;
		}

		case 'RConsequent':
		case 'LConsequent':
		case 'RAlternate':
		case 'LAlternate': {
			for (const childNode of getChildren(node)) {
				if (doNewLine(buffer, childNode)) continue;
				appendNodeString(buffer, childNode, indentString, indentDepth + 1);
			}
			break;
		}

		case 'LoopStatement': {
			buffer.push(indent(indentString, indentDepth, `loop`));
			for (const childNode of getChildren(node)) {
				if (doNewLine(buffer, childNode)) continue;
				appendNodeString(buffer, childNode, indentString, indentDepth + 1);
			}
			buffer.push(indent(indentString, indentDepth, `endloop`));
			break;
		}

		case 'ReturnStatement': {
			const expressionNode = N2N.extractExpression(node);
			if (!expressionNode) {
				buffer.push(indent(indentString, indentDepth, `return`));
			} else {
				buffer.push(indent(indentString, indentDepth, `return ${expressionToString(getInsideParens(expressionNode))}`));
			}
			break;
		}

		case 'SetStatement': {
			const bindingNode = N2N.extractBinding(node);
			const variableName = N2I.extractVariable(node);
			const valueNode = N2N.extractValue(node);
			if (bindingNode.type === 'ArrayElement') {
				const indexNode = NodeToNode.ArrayElement.extractIndex(bindingNode);
				buffer.push(indent(indentString, indentDepth, `set ${variableName}[${expressionToString(getInsideParens(indexNode))}] = ${expressionToString(getInsideParens(valueNode))}`));
			} else {
				buffer.push(indent(indentString, indentDepth, `set ${variableName} = ${expressionToString(getInsideParens(valueNode))}`));
			}
			break;
		}

		case 'CallStatement': {
			const callExpression = N2N.extractCallExpression(node);
			buffer.push(indent(indentString, indentDepth, `call ${expressionToString(callExpression)}`));
			break;
		}

		case 'ExitWhenStatement': {
			const testNode = N2N.extractTest(node);
			buffer.push(indent(indentString, indentDepth, `exitwhen ${expressionToString(getInsideAndParens(testNode))}`));
			break;
		}

		default: {
			throw new Error(`Unhandled node type ${node.type} ${typeof node} ${JSON.stringify(node)}`);
		}
	}
}

module.exports = appendNodeString;
