"use strict";

const assert = require('assert/strict');
const path = require('path');
const util = require('util');

const NodeToNode = require('./../language/n2n');
const NodeToIdentifier = require('./../language/n2i');
const NodeToStruct = require('./../language/n2x');

const {getPrecedenceOf, comparePrecedence} = require('./../language/precedence');

const {isBooleanOperator} = require('./../language');

const {
	getChildren,
	getInsideParens, getInsideAndParens,
	assertLastNamedChild,
	assertNoNamedChildren,
	assertOnlyNamedChild,
} = require('./../../lib/tree-helpers');

function maybePrefix(flag, content) {
	if (!flag) return ``;
	return `${content} `;
}

function maybeSuffix(flag, content) {
	if (!flag) return ``;
	return ` ${content}`;
}

function wrapParens(source) {
	return `(${source})`;
}

function wrapParensIf(source, cond) {
	if (cond) return wrapParens(source);
	return source;
}

function expressionToStringNormalParens(node) {
	return wrapParens(expressionToString(getInsideParens(node)));
}

function testToString(node) {
	return wrapParens(expressionToString(getInsideAndParens(node)));
}

function buildUnaryString(node, prefix, precedence) {
	const child = buildExpressionString(node.firstNamedChild);

	return {
		text: prefix + wrapParensIf(
			child.text,
			child.precedence < precedence,
		),
		precedence,
	};
}

function isRightAssociativitySensitive(operator) {
	switch (operator) {
		case '+':
		case '*':
		case 'and':
		case 'or':
			return false;

		default:
			return true;
	}
}

function isNestedBoolean(outsideBinaryOperator, subBinaryOperator) {
	if (!isBooleanOperator(outsideBinaryOperator)) {
		return false;
	}
	if (subBinaryOperator !== outsideBinaryOperator && isBooleanOperator(subBinaryOperator)) {
		return true;
	}
	return false;
}

function buildBinaryString(node) {
	const lhs = node.childForFieldName('lhs');
	const rhs = node.childForFieldName('rhs');
	const lhsInfo = buildExpressionString(lhs);
	const rhsInfo = buildExpressionString(rhs);

	const operatorNode = node.childForFieldName('operator');
	const operator = operatorNode.text;
	const precedence = getPrecedenceOf(node);

	const leftNeedsParens = (
		lhsInfo.precedence < precedence ||
		(lhsInfo.type === 'BinaryExpression' && isNestedBoolean(operator, lhsInfo.operator))
	);

	const rightNeedsParens = (
		rhsInfo.precedence < precedence ||
		(rhsInfo.precedence === precedence && Number.isFinite(precedence) && isRightAssociativitySensitive(operator)) ||
		(rhsInfo.type === 'BinaryExpression' && isNestedBoolean(operator, rhsInfo.operator))
	);

	return {
		text: `${wrapParensIf(lhsInfo.text, leftNeedsParens)} ${operator} ${wrapParensIf(rhsInfo.text, rightNeedsParens)}`,
		type: node.type,
		operator, precedence,
	};
}

function callExpressionToString(node) {
	const calleeName = NodeToIdentifier.CallExpression.extractCalleeName(node);
	const argList = NodeToNode.CallExpression.extractArgumentList(node);
	if (!argList) return `${calleeName}()`;
	const argExpressions = [];
	for (const arg of getChildren(argList)) {
		argExpressions.push(expressionToString(arg.firstNamedChild));
	}
	return `${calleeName}(${argExpressions.join(', ')})`;
}

function arrayElementToString(node) {
	const variableName = NodeToIdentifier.ArrayElement.extractVariable(node);
	const indexNode = NodeToNode.ArrayElement.extractIndex(node);
	return `${variableName}[${expressionToString(indexNode)}]`;
}

function buildExpressionString(node) {
	switch (node.type) {
		case 'Literal':
		case 'VariableReference':
		case 'FunctionReference':
			return {
				type: node.type,
				text: node.text,
				precedence: Infinity,
			};

		case 'ArrayElement':
			return {
				type: node.type,
				text: arrayElementToString(node),
				precedence: Infinity,
			};

		case 'CallExpression':
			return {
				type: node.type,
				text: callExpressionToString(node),
				precedence: Infinity,
			};

		case 'CodeReference':
			return {
				type: node.type,
				text: `function ${node.childForFieldName('funarg').text}`,
				precedence: Infinity,
			};

		case 'ParenthesizedExpression':
			return buildExpressionString(node.firstNamedChild);

		case 'NotExpression':
			return buildUnaryString(node, 'not ', getPrecedenceOf(node));

		case 'NegativeExpression':
			return buildUnaryString(node, '-', getPrecedenceOf(node));

		case 'PositiveExpression':
			return buildUnaryString(node, '+', getPrecedenceOf(node));

		case 'BinaryExpression':
			return buildBinaryString(node);

		default:
			throw new Error(`Unsupported expression node ${node.type}`);
	}
}

function expressionToString(node) {
	return buildExpressionString(node).text;
};

module.exports = {
	buildExpressionString,
	expressionToString,
};
