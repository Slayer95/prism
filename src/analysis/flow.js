"use strict";

//const assert = require('assert');

const TerminatorKind = {
	kNone: 0,
	kReturn: 1,
	kExitWhen: 2,
};

function isTerminator(node) {
	return node.type === 'ExitWhenStatement' || node.type === 'ReturnStatement';
}

function getTerminatorKind(node) {
	switch (node.type) {
		case 'ExitWhenStatement':
			return TerminatorKind.kExitWhen;
		case 'ReturnStatement':
			return TerminatorKind.kReturn;
		default:
			return TerminatorKind.kNone;
	}
}

module.exports = {
	isTerminator,
	getTerminatorKind,
	TerminatorKind,
};
