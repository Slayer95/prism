"use strict";

const assert = require('assert');

function isArrayTypeNode(typeNode /* ArrayType | AtomicType */) {
	// return typeNode.childCount > 1;
	return typeNode.type === 'ArrayType';
}

module.exports = {
	isArrayTypeNode,
};
