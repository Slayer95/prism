"use strict";

//const assert = require('assert');
const JassParser = require('../../src/parser/parser');
const common = require('./../common');
const test = require('node:test');
const path = require('path');

test("simple function", () => {
	const source = `
function Foo takes nothing returns nothing
endfunction
`;

	const {error, tree} = JassParser.parse(source);
	const serialized = error ? `<${error.message}>` : `${tree.rootNode}`;
	common.snapshot(path.basename(__filename), 'simple_function', serialized);
});
