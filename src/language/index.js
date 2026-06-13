"use strict";

const primitiveTypes = ['boolean', 'integer', 'real', 'string'];
const internalTypes = [...primitiveTypes, 'code', 'handle'];

const reservedKeyWords = [
	//...internalTypes,
	'alias', 'type',
];

const booleanOperators = ['and', 'or', '==', '!=', '<', '>', '<=', '>='];

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

function isBooleanOperator(operator) {
	return booleanOperators.includes(operator);
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
	primitiveTypes,
	internalTypes,
	reservedKeyWords,

	isReservedKeyword,
};