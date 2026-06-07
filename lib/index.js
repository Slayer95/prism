"use strict";

const util = require('util');

const constants = require('./constants');

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

function getAreDisjoint(set1, set2) {
	for (const elem of set2) {
		if (set1.has(elem)) {
			return false;
		}
	}
	return true;
}

module.exports = {
	constants,
	capitalize,
	renderLintCode,
};
