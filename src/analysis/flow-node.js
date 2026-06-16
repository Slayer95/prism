"use strict";

const assert = require('assert');

const {
	isTerminator,
	getTerminatorKind,
	TerminatorKind,
} = require('./flow');

class FlowNode {
	constructor(id) {
		this.id = id;
		this.kind = '';
		this.synthetic = false;
		this.astRange = null;
		this.sourceRange = null;
		this.instructions = [];
	}

	static from(id, instructions) {
		const node = new FlowNode(id);
		node.instructions = instructions;
		return node;
	}

	static synthetic(id) {
		const node = new FlowNode(id);
		node.synthetic = true;
		return node;
	}
}

module.exports = FlowNode;
