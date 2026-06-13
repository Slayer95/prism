function HeadVsHead takes real rDir returns boolean
	return (rDir <= bj_PI / 2 + 0.1) and (rDir >= -bj_PI / 2 - 0.1)
endfunction
