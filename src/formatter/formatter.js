"use strict";

const assert = require('assert/strict');
const path = require('path');
const util = require('util');
const EventEmitter = require('events');

const appendNodeString = require('./append-node-string');

class Formatter {
	constructor(cst, symbols, output) {
		this.cst = cst;
		this.symbols = symbols;
		this.output = output;
	}

	run() {
		appendNodeString(this.output, this.cst.rootNode, '\t', 0);
	}
}

module.exports = Formatter;
