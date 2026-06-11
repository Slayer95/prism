"use strict";

const assert = require('assert/strict');

const {isNodeTypeAnyRL} = require('./tree-helpers');

class SparseSyntaxStack {
	constructor(type) {
		this.type = type;
		this.stack = [];
	}

	push(node, globalIndex, branch = -1) {
		this.stack.push({node, globalIndex, branch});
	}

	pop() {
		this.stack.pop();
	}

	peek() {
		return this.stack[this.stack.length - 1] ?? null;
	}

	get size() {
		return this.stack.length;
	}

	isEmpty() {
		return this.stack.length === 0;
	}

	*[Symbol.iterator]() {
		for (let i = this.stack.length -1; i >= 0; i--) {
			yield this.stack[i];
		}
	}
}

class SyntaxStack {
	constructor() {
		this.global = [];
		this.if = new SparseSyntaxStack('if');
		this.loop = new SparseSyntaxStack('loop');
	}

	push(node, type) {
		const globalIndex = this.global.push(node) - 1;
		switch (type) {
			case 'if':
				this.if.push(node, globalIndex, -1);
				break;
			case 'loop':
				this.loop.push(node, globalIndex, -1);
				break;
			default:
				break;
		}
	}

	pop(node = this.global.at(-1)) {
		assert.equal(this.global.at(-1), node);
		this.global.pop();
		if (this.if.peek() === node) {
			this.if.pop();
		} else if (this.loop.peek() === node) {
			this.loop.pop();
		}
	}

	peek() {
		return this.global.length >= 1 ? this.global[this.global.length - 1] : null;
	}

	peek2() {
		return this.global.length >= 2 ? this.global[this.global.length - 2] : null;
	}

	get size() {
		return this.global.length;
	}

	isEmpty() {
		return this.global.length === 0;
	}

	checkEmpty() {
		assert.equal(this.if.size, 0);
		assert.equal(this.loop.size, 0);
		assert.equal(this.global.length, 0);
	}

	getClosest(type) {
		for (const node of this) {
			if (node.type === type) {
				return node;
			}
		}
		return null;
	}

	getClosestAnyRL(type) {
		for (const node of this) {
			if (isNodeTypeAnyRL(node, type)) {
				return node;
			}
		}
		return null;
	}

	getIfStackInClosestLoop() {
		const globalDepthForLoop = this.loop.peek().globalIndex;
		for (let i = this.if.size - 1; i >= 0; i--) {
			if (globalDepthForLoop < this.if.stack[i].depth) {
				continue;
			}
			return this.if.stack.slice(i + 1);
		}
		return this.if.stack.slice();
	}

	*[Symbol.iterator]() {
		for (let i = this.global.length -1; i >= 0; i--) {
			yield this.global[i];
		}
	}
}

module.exports = {
	SparseSyntaxStack,
	SyntaxStack,
};
