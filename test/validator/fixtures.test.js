"use strict";

const path = require('path');
const test = require('node:test');
const assert = require('assert/strict');

const common = require('./../common');
const {ValidatorResult} = require('./../../lib/constants');

const folders = ['should-check', 'should-fail', 'should-fail-sound', 'should-fail-recommended'];

const CORE_RULESET = ['core'];
const SOUND_RULESET = [...CORE_RULESET, 'sound'];

// Recommended is very wide, and can fail for all sorts of reasons.
// But I'll make do with it.
const RECOMMENDED_RULESET = [...CORE_RULESET, 'sound', 'recommended'];

const Rulesets = [
	CORE_RULESET,
	CORE_RULESET,
	SOUND_RULESET,
	RECOMMENDED_RULESET,
];

function reportResult(expected, value, desc, output) {
	const success = value === ValidatorResult.kOk;
	if (expected !== success) {
		if (expected) {
			assert.fail(new Error(`False positive at ${desc} - ${output ? JSON.stringify([...(output?.errors ?? []), ...(output?.warnings ?? [])]) : 'PARSER'}`));
		} else {
			assert.fail(new Error(`False negative at ${desc} (passed unexpectedly)`));
		}
	}
}

for (let i = 0; i < folders.length; i++) {
	let expectValid = (i == 0);
	let folderName = folders[i];
	for (const fixturePath of common.getFilesRecursive(path.resolve(__dirname, 'fixtures', folderName), '.j')) {
		const relPath = path.relative(__dirname, fixturePath);
		if (path.basename(fixturePath).startsWith('_')) {
			// Bogus test or wrong JASS version.
			continue;
		}
		test(relPath, () => {
			let result = null;
			try {
				result = common.validateFile(fixturePath, Rulesets[i]);
			} catch (err) {
				if (err.name !== 'ParseError') {
					throw new Error(`Internal error validating ${relPath}`, {cause: err});
				}
			}
			if (!result) {
				reportResult(expectValid, ValidatorResult.kError, relPath);
				return;
			}
			reportResult(expectValid, result.result, relPath, result);
			//common.snapshot('fixtures', relPath, result);
		});
	}
}
