"use strict";

const assert = require('assert');
const JassParser = require('../../src/parser/parser');
const common = require('./../common');
const test = require('node:test');
const path = require('path');

test("simple function", () => {
	const source = `
function Foo takes nothing returns nothing
endfunction
`;

	const tree = JassParser.parse(source);
	common.snapshot(path.basename(__filename), 'simple_function', '' + tree.rootNode);
});
