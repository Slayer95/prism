"use strict";

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

module.exports = {
	entryPoints,
	isAPINeedsInitialization,
	isAPINullUnsafe,
	isAPIHandleDestroyer,
	isEntryPoint,
};