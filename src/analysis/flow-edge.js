"use strict";

const assert = require('assert');

const {
	isTerminator,
	getTerminatorKind,
	TerminatorKind,
} = require('./flow');

class FlowEdge {
	constructor(from, to, kind) {
		this.from = from;
		this.to = to;
		this.kind = kind;
	}
}

module.exports = FlowEdge;
