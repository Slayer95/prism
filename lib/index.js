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

function transcode(buffer, from, to) {
	return Buffer.from(buffer.toString(from), to);
}

function isASCII(text, from, to) {
	for (let i = from; i < to; i++) {
		if (text.charCodeAt(i) >= 0x80) return false;
	}
	return true;
}

function signed8(num) {
	return (num << 24) >> 24;
}

function fourCCUnsigned(buffer) {
	let result = 0;
	for (let i = 0; i < buffer.length; i++) {
		result = (result << 8) | buffer[i];
	}
	return result;
}

function fourCCSigned(buffer) {
	let result = 0;
	let signed = [...buffer];
	for (let i = 0; i < signed.length; i++) {
		signed[i] = signed8(signed[i]);
		if (i > 0 && signed[i] < 0) signed[i - 1]--;
	}
	for (let i = 0; i < signed.length; i++) {
		result = (result << 8) | (signed[i] & 0xFF);
	}
	return result | 0;
}

function optSign(num) {
	if (num < 0) return `-`;
	return ``;
}



module.exports = {
	constants,
	capitalize,
	renderLintCode,
	transcode,
	isASCII,
	signed8,
	fourCCUnsigned,
	fourCCSigned,
	optSign,
};
