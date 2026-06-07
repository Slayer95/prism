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

const handleDestroyerAPIs = new Set([
	'RemoveRect', 'RemoveItem', 'RemoveUnit', 'RemoveRegion', 'RemoveLocation', 'RemoveDestructable',
	'DestroyTimer', 'DestroyGroup', 'DestroyForce', 'DestroyQuest', 'DestroyImage', 'DestroyFilter',
	'DestroyEffect', 'DestroyTrigger', 'DestroyTextTag', 'DestroyQuestBJ', 'DestroyTimerBJ',
	'DestroyBoolExpr', 'DestroyUnitPool', 'DestroyItemPool', 'DestroyEffectBJ', 'DestroyCondition',
	'DestroyLightning', 'DestroyUbersplat', 'DestroyTextTagBJ', 'DestroyMultiboard', 'DestroyFogModifier',
	'DestroyMinimapIcon', 'DestroyTimerDialog', 'DestroyLeaderboard', 'DestroyLightningBJ',
	'DestroyMultiboardBJ', 'DestroyTimerDialogBJ', 'DestroyLeaderboardBJ', 'DestroyDefeatCondition',
	'DestroyDefeatConditionBJ', 'DestroyCommandButtonEffect', 'DialogDestroy',
]);

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

function isAPIHandleDestroyer(fnName) {
	return handleDestroyerAPIs.has(fnName);
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
	isAPIHandleDestroyer,
	capitalize,
	renderLintCode,
};
