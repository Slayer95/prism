"use strict";

const assert = require('assert');

const {
	isTerminator,
	getTerminatorKind,
	TerminatorKind,
} = require('./flow');

class FlowBlock {
	constructor(id) {
		this.id = id;
		this.kind = '';
		this.synthetic = false;
		this.astRange = null;
		this.sourceRange = null;
		this.instructions = [];
	}
}

module.exports = FlowBlock;
