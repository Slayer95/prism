"use strict";

const util = require('util');

const constants = require('./constants');

const primitiveTypes = ['boolean', 'integer', 'real', 'string'];
const internalTypes = [...primitiveTypes, 'code', 'handle'];

const needInitAPIs = [
	'OrderId', 'OrderId2String', 'UnitId2String', 'GetObjectName', // otherwise, return null
	'CreateQuest', 'CreateMultiboard', 'CreateLeaderboard', // otherwise, crash
	'CreateRegion', // otherwise, save corrupted
];

function isPrimitiveType(type) {
	return primitiveTypes.includes(type);
}

function isNumberType(type) {
	return type === 'integer' || type === 'real';
}

function isAPINeedsInitialization(calleeName) {
	return needInitAPIs.includes(calleeName);
}

function capitalize(text) {
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function renderLintCode(code) {
	if (code.length <= 160) return code;
	const firstNewLineIndex = code.indexOf('\n');
	if (firstNewLineIndex === -1) {
		return util.inspect(code, {maxStringLength: 120});
	}
	const lastNewLineIndex = code.indexOf('\n');
	if (firstNewLineIndex === lastNewLineIndex) {
		return util.inspect(code, {maxStringLength: 120});
	}
	return [code.slice(0, firstNewLineIndex), '...', code.slice(lastNewLineIndex)].join('\n');
}

module.exports = {
	isPrimitiveType,
	isNumberType,
	primitiveTypes,
	internalTypes,
	constants,

	isAPINeedsInitialization,
	capitalize,
	renderLintCode,
};
