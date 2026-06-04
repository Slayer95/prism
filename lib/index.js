"use strict";

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

function isAPINeedsInitialization(calleeName) {
	return needInitAPIs.includes(calleeName);
}

module.exports = {
	isPrimitiveType,
	primitiveTypes,
	internalTypes,
	constants,

	isAPINeedsInitialization,
};
