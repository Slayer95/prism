"use strict";

class HandleTracker {
	constructor() {
		this.lastSetNode = null;
		this.nulled = {
			branches: 0,
			always: false,
		};
	}
}

module.exports = HandleTracker;
