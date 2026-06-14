function genCharTable() {
	const output = [];
	const isEscapable = charCode => {
		return charCode === 8 || charCode === 9 || charCode === 0x0A || charCode === 0x0D;
	};

	const buffers = [];
	const header = `function InitCharTable takes nothing returns nothing\n`;
	const footer = `endfunction\n`;

	buffers.push(Buffer.from(header));

	// 0x00 and 0xFF are not allowed.
	for (let i = 1; i < 0xFF; i++) {
		const c = String.fromCharCode(i);
		if (c !== '"' && c !== '\\') {
			buffers.push(Buffer.from(`\tset charTable[${i}] = "${c}"\n`, 'latin1'));
		}
		if (isEscapable(i)) {
			buffers.push(Buffer.from(`\tset charTable[${i}] = ${JSON.stringify(c)}\n`, 'latin1'));
		}
	}

	buffers.push(Buffer.from(footer));
	return Buffer.concat(buffers);
}

//process.stdout.write(genCharTable());
