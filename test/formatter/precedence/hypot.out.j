function DistanceBetweenPoints takes real x1, real y1, real x2, real y2 returns real
	return SquareRoot((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1))
endfunction