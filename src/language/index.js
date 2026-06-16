"use strict";

const {getSignificantChildren, getLastSignificantChild} = require('./../../lib/tree-helpers');

const primitiveTypes = ['boolean', 'integer', 'real', 'string'];
const internalTypes = [...primitiveTypes, 'code', 'handle'];

const reservedKeyWords = [
	//...internalTypes,
	'alias', 'type',
];

const booleanOperators = ['and', 'or', '==', '!=', '<', '>', '<=', '>='];

const MAX_ARRAY_SIZE = 8192;

function isPrimitiveType(type) {
	return primitiveTypes.includes(type);
}

function isPrimitiveTypeOrCode(type) {
	return type === 'code' || primitiveTypes.includes(type);
}

function isHandleType(type) {
	return type !== 'code' && !isPrimitiveType(type);
}

function isExtensibleType(type) {
	return isHandleType(type);
}

function isNumberType(type) {
	return type === 'integer' || type === 'real';
}

function isReservedKeyword(word) {
	return reservedKeyWords.includes(word);
}

function isExpression(node) {
	switch (node.type) {
		case 'Literal': return true;
		case 'VariableReference': return true;
		case 'CodeReference': return true;
		case 'ArrayElement': return true;
		case 'CallExpression': return true;
		case 'ParenthesizedExpression': return true;
		case 'NotExpression': return true;
		case 'PositiveExpression': return true;
		case 'NegativeExpression': return true;
		case 'BinaryExpression': return true;
	}
	return false;
}

function isStatement(node) {
	return node.type.endsWith('Statement');
}

function isBooleanOperator(operator) {
	return booleanOperators.includes(operator);
}

function isShortCircuitOperator(operator) {
	return operator === 'and' || operator === 'or';
}

function isShortCircuitNode(node) {
	return node.type === 'BinaryExpression' && isShortCircuitOperator(findChildNamed(node, 'operator').text);
}

function getTrivialTestValue(node) {
	if (node.type === 'ParenthesizedExpression' || node.type === 'Initializer') {
		return getTrivialTestValue(node.firstNamedChild);
	}
	if (node.type !== 'Literal') return null;
	if (node.text === 'true') return true;
	if (node.text === 'false') return false;
	return null;
}

function getTrivialNumberValue(node) {
	if (node.type === 'ParenthesizedExpression' || node.type === 'Literal' || node.type === 'FunctionArgument' || node.type === 'Initializer') {
		return getTrivialNumberValue(node.firstNamedChild);
	}

	if (node.type === 'NegativeExpression') {
		const innerResult = getTrivialNumberValue(node.firstNamedChild);
		if (innerResult === null) return null;
		return -innerResult;
	}

	switch (node.type) {
		case 'OctalInteger': {
			const value = parseInt(node.text, 8);
			return value;
		}

		case 'DecimalInteger': {
			const value = parseInt(node.text, 10);
			return value;
		}

		case 'HexInteger': {
			const isNegative = node.text.charAt(0) === '-';
			let offset = (+isNegative);
			if (node.text.charAt(offset) === '0') {
				offset += 1;
			}
			const value = parseInt(node.text.slice(offset + 1), 16);
			return value;
		}

		case 'Real': {
			return Number(node.text);
		}

		default:
			return null;
	}
}

function isSideEffectsOperator(operator) {
	return operator === '/' || operator === '%' || operator === '*';
}

function isSpeculatableNode(node) {
	switch (node.type) {
		case 'CallExpression': return false;
		case 'ArrayElement': {
			// TODO: In general, it's impossible to find out whether it's safe to read an arbitrary array ahead-of-time,
			// because it may be uninitialized.
			// So we must leave this return true path out.
			// But it's temporarily enabled for simplicity while developing.
			const indexNode = findChildNamed(node, 'index');
			const indexValue = getTrivialNumberValue(indexNode);
			if (indexValue === null || indexValue < 0 || MAX_ARRAY_SIZE <= indexValue) {
				return false;
			}
			return true;
		}
		case 'BinaryExpression': {
			// TODO: Must also check whether involved variables
			// - always have an initial value
			// - are not currently in TDZ
			const operator = findChildNamed(node, 'operator').text;
			const isMultOrDivision = isSideEffectsOperator(operator);
			if (!isMultOrDivision) return true;
			const rhsNode = findChildNamed(node, 'rhs');
			const rhsValue = getTrivialNumberValue(divisorNode);
			if (rhsValue === null || rhsValue === -1) return false;
			if (operator !== '*' && rhsValue === 0) return false;
			return true;
		}
		case 'NegativeExpression': {
			const operandValue = getTrivialNumberValue(getLastSignificantChild(node));
			if (operandValue === null) return false;
			return operandValue !== -2147483648;
		}
		default:
			return true;
	}
}

function isSpeculatableNode(node) {
	if (!isSpeculatableNode(node)) {
		return false;
	}
	for (const childNode of getSignificantChildren(node)) {
		if (!isSpeculatableNode(childNode)) return false;
	}
	return true;
}

class TypeInfo {
	constructor(name, parentType, onlyAtomic = false) {
		this.name = name;
		this.superTypes = parentType ? [parentType.name, ...parentType.superTypes] : [];
		this.onlyAtomic = onlyAtomic;
		this.isType = true;
		this.type = 'type';
	}

	getExtends(superType) {
		return this.superTypes.includes(superType);
	}
}

module.exports = {
	TypeInfo,

	isPrimitiveType,
	isPrimitiveTypeOrCode,
	isHandleType,
	isExtensibleType,
	isNumberType,
	isExpression,
	isBooleanOperator,
	isSideEffectsOperator,
	isShortCircuitOperator,
	isShortCircuitNode,
	isSpeculatableNode,
	primitiveTypes,
	internalTypes,
	reservedKeyWords,

	isReservedKeyword,
	isStatement,

	getTrivialTestValue,
	getTrivialNumberValue,
};