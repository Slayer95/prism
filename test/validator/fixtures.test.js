"use strict";

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('assert/strict');

const common = require('./../common');

const folders = ['should-check', 'should-fail'];

for (let i = 0; i < folders.length; i++) {
	let isValid = (i == 0);
	let folderName = folders[i];
	for (const fixturePath of common.getFilesRecursive(path.resolve(__dirname, 'fixtures', folderName))) {
		const relPath = path.relative(__dirname, fixturePath);
		test(relPath, () => {
			const result = common.validateFile(fixturePath);
			if (isValid) {
				assert.equal(result.result, 0);
			} else {
				assert.notEqual(result.result, 0);
			}
			common.snapshot('fixtures', relPath, result);
		});
	}
}
