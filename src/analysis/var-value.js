"use strict";

const assert = require('assert');

const {
	getUnwrapParensDescendant,
} = require('./../../lib/tree-helpers');

function extractValueNodeFromSetStatement(node /* SetStatement */) {
	return getUnwrapParensDescendant(node.lastNamedChild.lastNamedChild);
}

function extractValueNodeFromDeclaration(node /* GlobalDeclarationStatement */) {
	if (node.lastNamedChild.type !== 'Initializer') return null;
	return node.lastNamedChild.lastNamedChild;
}

module.exports = {
	extractValueNodeFromSetStatement,
	extractValueNodeFromDeclaration,
};
