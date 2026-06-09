"use strict";

const util = require('util');

const constants = require('./../../lib/constants');

const primitiveTypes = ['boolean', 'integer', 'real', 'string'];
const internalTypes = [...primitiveTypes, 'code', 'handle'];
const entryPoints = ['InitBlizzard', 'config', 'main'];

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

const unsafeNullAPIs = [
	'TriggerExecute', 'ConditionalTriggerExecute',
];

const reservedKeyWords = [
	//...internalTypes,
	'alias', 'type',
];

function isPrimitiveType(type) {
	return primitiveTypes.includes(type);
}

function isExtensibleType(type) {
	return type !== 'code' && !isPrimitiveType(type);
}

function isNumberType(type) {
	return type === 'integer' || type === 'real';
}

function isEntryPoint(symbolName) {
	return entryPoints.includes(symbolName);
}

function isAPINeedsInitialization(calleeName) {
	return needInitAPIs.includes(calleeName);
}

function isAPINullUnsafe(calleeName) {
	return unsafeNullAPIs.includes(calleeName);
}

function isAPIHandleDestroyer(fnName) {
	return handleDestroyerAPIs.has(fnName);
}

function isReservedKeyword(word) {
	return reservedKeyWords.includes(word);
}

class TypeInfo {
	constructor(name, parentType, onlyAtomic = false) {
		this.name = name;
		this.superTypes = parentType ? [parentType.name, ...parentType.superTypes] : [];
		this.onlyAtomic = false;
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
	isExtensibleType,
	isNumberType,
	primitiveTypes,
	internalTypes,
	entryPoints,
	reservedKeyWords,

	isAPINeedsInitialization,
	isAPINullUnsafe,
	isAPIHandleDestroyer,
	isEntryPoint,
	isReservedKeyword,
};